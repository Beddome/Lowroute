import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import * as storage from "./storage";
import { parseDateEndOfDayMST } from "./timezone";
import { SEVERITY_TIERS, CLEARANCE_MODES } from "../shared/schema";
import { sendPushNotification, sendPushToMultiple } from "./notifications";

const rateLimitBuckets = new Map<string, Map<string, { count: number; lastAttempt: number }>>();

function checkRateLimit(key: string, bucket = "default", maxAttempts = 10, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  if (!rateLimitBuckets.has(bucket)) rateLimitBuckets.set(bucket, new Map());
  const entries = rateLimitBuckets.get(bucket)!;
  const entry = entries.get(key);
  if (!entry || now - entry.lastAttempt > windowMs) {
    entries.set(key, { count: 1, lastAttempt: now });
    return true;
  }
  if (entry.count >= maxAttempts) return false;
  entry.count++;
  entry.lastAttempt = now;
  return true;
}

function sanitizeInput(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function writeRateLimitMiddleware(maxPerMinute = 30) {
  return (req: Request, res: Response, next: () => void) => {
    const userId = req.session?.userId;
    if (!userId) return next();
    const key = `${req.method}:${req.path}:${userId}`;
    if (!checkRateLimit(key, "write", maxPerMinute, 60 * 1000)) {
      return res.status(429).json({ message: "Too many requests. Please try again later." });
    }
    next();
  };
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function distanceToSegmentMeters(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const cosLat = Math.cos(((ax + bx + px) / 3) * Math.PI / 180);
  const scaledPy = py * cosLat;
  const scaledAy = ay * cosLat;
  const scaledBy = by * cosLat;

  const dx = bx - ax;
  const dy = scaledBy - scaledAy;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - ax;
    const ddy = scaledPy - scaledAy;
    return Math.sqrt(ddx * ddx + ddy * ddy) * 111320;
  }
  let t = ((px - ax) * dx + (scaledPy - scaledAy) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = scaledAy + t * dy;
  const ddx = px - projX;
  const ddy = scaledPy - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy) * 111320;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Not authenticated" });
  }
  if ((user as any).status === "suspended") {
    req.session.destroy(() => {});
    return res.status(403).json({ message: "Your account has been suspended." });
  }
  if ((user as any).status === "banned") {
    req.session.destroy(() => {});
    return res.status(403).json({ message: "Your account has been permanently banned." });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function calculateRouteRisk(hazards: Array<{ severity: number; confidenceScore: number }>, riskMultiplier = 1.0) {
  const SEVERITY_PENALTIES = [0, 5, 20, 100, 1000];
  let score = 0;
  const counts = [0, 0, 0, 0, 0];

  for (const h of hazards) {
    if (h.confidenceScore < 0.4) continue;
    const tier = Math.max(1, Math.min(4, h.severity));
    score += Math.round(SEVERITY_PENALTIES[tier] * riskMultiplier);
    counts[tier]++;
  }

  const highestTier = counts[4] > 0 ? 4 : counts[3] > 0 ? 3 : counts[2] > 0 ? 2 : counts[1] > 0 ? 1 : 0;
  const totalHazards = counts[1] + counts[2] + counts[3] + counts[4];

  return { score, counts, highestTier, totalHazards };
}

const HAZARD_BUFFER_METERS = 3;
const HAZARD_BUFFER_DEG = 0.00003;

function hazardsNearPolyline(
  allHazards: Array<{ lat: number; lng: number; severity: number; confidenceScore: number; [key: string]: any }>,
  polyline: Array<{ lat: number; lng: number }>
) {
  if (polyline.length === 0) return [];

  const lats = polyline.map((p) => p.lat);
  const lngs = polyline.map((p) => p.lng);
  const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const lngBuffer = HAZARD_BUFFER_DEG / Math.cos(avgLat * Math.PI / 180);
  const minLat = Math.min(...lats) - HAZARD_BUFFER_DEG;
  const maxLat = Math.max(...lats) + HAZARD_BUFFER_DEG;
  const minLng = Math.min(...lngs) - lngBuffer;
  const maxLng = Math.max(...lngs) + lngBuffer;

  return allHazards.filter((h) => {
    if (h.lat < minLat || h.lat > maxLat || h.lng < minLng || h.lng > maxLng) return false;
    for (let i = 0; i < polyline.length - 1; i++) {
      const d = distanceToSegmentMeters(
        h.lat, h.lng,
        polyline[i].lat, polyline[i].lng,
        polyline[i + 1].lat, polyline[i + 1].lng
      );
      if (d < HAZARD_BUFFER_METERS) return true;
    }
    return false;
  });
}

interface RouteStep {
  html_instructions: string;
  distance: number;
  duration: number;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  maneuver?: string;
}

async function fetchGoogleRoutes(
  sLat: number, sLng: number, eLat: number, eLng: number
): Promise<Array<{ geometry: string; distance: number; duration: number; steps: RouteStep[] }>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${sLat},${sLng}&destination=${eLat},${eLng}&alternatives=true&key=${apiKey}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Google Directions returned ${resp.status}`);
  const data = await resp.json() as any;
  if (data.status !== "OK" || !data.routes?.length) {
    throw new Error(data.error_message || `Google Directions: ${data.status}`);
  }
  return data.routes.map((r: any) => {
    const leg = r.legs[0];
    const steps: RouteStep[] = (leg.steps || []).map((s: any) => ({
      html_instructions: s.html_instructions || "",
      distance: s.distance?.value ?? 0,
      duration: s.duration?.value ?? 0,
      start_location: { lat: s.start_location?.lat ?? 0, lng: s.start_location?.lng ?? 0 },
      end_location: { lat: s.end_location?.lat ?? 0, lng: s.end_location?.lng ?? 0 },
      maneuver: s.maneuver || undefined,
    }));

    let detailedGeometry = "";
    const stepPolylines = (leg.steps || [])
      .map((s: any) => s.polyline?.points)
      .filter(Boolean);
    if (stepPolylines.length > 0) {
      const allPoints: Array<{ lat: number; lng: number }> = [];
      for (const sp of stepPolylines) {
        const pts = decodePolyline(sp);
        if (allPoints.length > 0 && pts.length > 0) {
          const last = allPoints[allPoints.length - 1];
          if (Math.abs(last.lat - pts[0].lat) < 0.00001 && Math.abs(last.lng - pts[0].lng) < 0.00001) {
            pts.shift();
          }
        }
        allPoints.push(...pts);
      }
      detailedGeometry = JSON.stringify(allPoints);
    }

    return {
      geometry: r.overview_polyline.points,
      detailedPoints: detailedGeometry ? JSON.parse(detailedGeometry) as Array<{ lat: number; lng: number }> : null,
      distance: leg.distance.value,
      duration: leg.duration.value,
      steps,
    };
  });
}

function safeUserResponse(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    reputation: user.reputation,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    shareLocation: user.shareLocation ?? true,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  const PgStore = ConnectPgSimple(session);

  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: process.env.LOWROUTE_SESSION_SECRET || "lowroute-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  app.use((req: Request, res: Response, next: () => void) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.path.startsWith("/api/")) {
      writeRateLimitMiddleware(60)(req, res, next);
    } else {
      next();
    }
  });

  await storage.seedDemoHazards();
  if (process.env.NODE_ENV === "production") {
    if (process.env.LOWROUTE_ADMIN_USERNAME && process.env.LOWROUTE_ADMIN_PASSWORD) {
      const adminHash = await bcrypt.hash(process.env.LOWROUTE_ADMIN_PASSWORD, 10);
      await storage.seedAdminUser(process.env.LOWROUTE_ADMIN_USERNAME, adminHash);
    }
  } else {
    const adminUsername = process.env.LOWROUTE_ADMIN_USERNAME || "admin";
    const adminPassword = process.env.LOWROUTE_ADMIN_PASSWORD || "lowroute-admin";
    const adminHash = await bcrypt.hash(adminPassword, 10);
    await storage.seedAdminUser(adminUsername, adminHash);
  }

  // Auth routes
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(`register:${ip}`)) {
        return res.status(429).json({ message: "Too many attempts. Please try again later." });
      }

      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (typeof username !== "string" || username.length < 3 || username.length > 30) {
        return res.status(400).json({ message: "Username must be 3-30 characters" });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, and underscores" });
      }
      if (typeof email !== "string" || !email.includes("@") || email.length > 254) {
        return res.status(400).json({ message: "Valid email is required" });
      }
      if (password.length < 6 || password.length > 128) {
        return res.status(400).json({ message: "Password must be 6-128 characters" });
      }
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ message: "Email already in use" });
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken" });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, email, passwordHash });
      req.session.userId = user.id;
      res.json(safeUserResponse(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(`login:${ip}`)) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }

      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "All fields required" });

      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });

      if ((user as any).status === "suspended") {
        return res.status(403).json({ message: "Your account has been suspended. Contact support for more information." });
      }
      if ((user as any).status === "banned") {
        return res.status(403).json({ message: "Your account has been permanently banned." });
      }

      req.session.userId = user.id;
      const freshUser = await storage.checkAndDowngradeExpiredSubscription(user.id);
      res.json(safeUserResponse(freshUser ?? user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    try {
      req.session.destroy(() => res.json({ success: true }));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.json(null);
    const user = await storage.checkAndDowngradeExpiredSubscription(req.session.userId);
    if (!user) return res.json(null);
    res.json(safeUserResponse(user));
  });

  // Hazard routes
  app.get("/api/hazards", async (req: Request, res: Response) => {
    try {
      const { minLat, maxLat, minLng, maxLng } = req.query;
      let hazards;
      if (minLat && maxLat && minLng && maxLng) {
        hazards = await storage.getHazardsByBbox(
          parseFloat(minLat as string),
          parseFloat(maxLat as string),
          parseFloat(minLng as string),
          parseFloat(maxLng as string)
        );
      } else {
        hazards = await storage.getAllActiveHazards();
      }
      res.json(hazards);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch hazards" });
    }
  });

  app.post("/api/hazards", requireAuth, async (req: Request, res: Response) => {
    try {
      const { lat, lng, type, severity, title, description, photoUrl } = req.body;
      if (!lat || !lng || !type || !severity || !title || !description) {
        return res.status(400).json({ message: "All fields required" });
      }
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const parsedSeverity = parseInt(severity);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        return res.status(400).json({ message: "Invalid latitude" });
      }
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        return res.status(400).json({ message: "Invalid longitude" });
      }
      if (isNaN(parsedSeverity) || parsedSeverity < 1 || parsedSeverity > 4) {
        return res.status(400).json({ message: "Severity must be 1-4" });
      }
      if (typeof title !== "string" || title.length < 3 || title.length > 100) {
        return res.status(400).json({ message: "Title must be 3-100 characters" });
      }
      if (typeof description !== "string" || description.length < 5 || description.length > 500) {
        return res.status(400).json({ message: "Description must be 5-500 characters" });
      }
      const validTypes = ["pothole", "speed_bump", "construction", "raised_manhole", "railroad_crossing", "flooded_road", "debris", "large_bump_dip", "steep_driveway", "other"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid hazard type" });
      }
      const hazard = await storage.createHazard({
        userId: req.session.userId!,
        lat: parsedLat,
        lng: parsedLng,
        type,
        severity: parsedSeverity,
        title: title.trim(),
        description: description.trim(),
        photoUrl: photoUrl && typeof photoUrl === "string" ? photoUrl.trim() : null,
      });
      await storage.updateUserReputation(req.session.userId!, 10);
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create hazard" });
    }
  });

  app.get("/api/hazards/nearby", async (req: Request, res: Response) => {
    try {
      const { lat, lng, radius } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ message: "lat and lng are required" });
      }
      const radiusKm = radius ? parseFloat(radius as string) : 0.5;
      const hazards = await storage.getHazardsNearby(
        parseFloat(lat as string),
        parseFloat(lng as string),
        radiusKm
      );
      res.json(hazards);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch nearby hazards" });
    }
  });

  app.get("/api/hazards/:id", async (req: Request, res: Response) => {
    try {
      const hazard = await storage.getHazardById(req.params.id);
      if (!hazard) return res.status(404).json({ message: "Not found" });
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch hazard" });
    }
  });

  app.post("/api/hazards/:id/vote", requireAuth, async (req: Request, res: Response) => {
    try {
      const { voteType } = req.body;
      if (!["confirm", "downvote", "clear"].includes(voteType)) {
        return res.status(400).json({ message: "Invalid vote type" });
      }
      const hazard = await storage.voteOnHazard(req.session.userId!, req.params.id, voteType);
      const repDelta = voteType === "confirm" ? 2 : voteType === "clear" ? 3 : 0;
      if (repDelta > 0) await storage.updateUserReputation(req.session.userId!, repDelta);
      if (!hazard) return res.json({ deleted: true, message: "Hazard cleared by community" });
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Vote failed" });
    }
  });

  // Admin routes (user management moved to bottom with search support)

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      if (!role || !["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const user = await storage.updateUserRole(req.params.id, role);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/admin/hazards/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const hazard = await storage.deleteHazard(req.params.id);
      if (!hazard) return res.status(404).json({ message: "Hazard not found" });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete hazard" });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/routes", async (req: Request, res: Response) => {
    try {
      const { startLat, startLng, endLat, endLng, carProfileId } = req.query;
      if (!startLat || !startLng || !endLat || !endLng) {
        return res.status(400).json({ message: "Start and end coordinates required" });
      }

      const sLat = parseFloat(startLat as string);
      const sLng = parseFloat(startLng as string);
      const eLat = parseFloat(endLat as string);
      const eLng = parseFloat(endLng as string);

      if ([sLat, sLng, eLat, eLng].some(isNaN)) {
        return res.status(400).json({ message: "Invalid coordinates" });
      }

      let riskMultiplier = 1.0;
      let carProfileInfo: { make: string; model: string; year: number; clearanceMode: string } | null = null;
      if (carProfileId && typeof carProfileId === "string" && req.session.userId) {
        const carProfile = await storage.getCarProfileById(carProfileId);
        if (carProfile && carProfile.userId === req.session.userId) {
          const modeData = CLEARANCE_MODES.find(m => m.value === carProfile.clearanceMode);
          riskMultiplier = modeData?.riskMultiplier ?? 1.0;
          carProfileInfo = {
            make: carProfile.make,
            model: carProfile.model,
            year: carProfile.year,
            clearanceMode: carProfile.clearanceMode,
          };
        }
      }

      const allHazards = await storage.getAllActiveHazards();

      let googleRoutes: Array<{ geometry: string; distance: number; duration: number; steps: RouteStep[] }>;
      try {
        googleRoutes = await fetchGoogleRoutes(sLat, sLng, eLat, eLng);
      } catch (routeErr) {
        console.error("Google Directions fetch failed:", routeErr);
        return res.status(502).json({ message: "Routing service temporarily unavailable. Please try again." });
      }

      const ROUTE_LABELS = [
        { id: "fastest", label: "Fastest", description: "Shortest travel time" },
        { id: "safest", label: "Low-Car Safe", description: "Alternate route, may avoid hazards" },
        { id: "balanced", label: "Balanced", description: "Balance between time and safety" },
      ];

      const routes = googleRoutes.slice(0, 3).map((gRoute, i) => {
        const overviewPolyline = decodePolyline(gRoute.geometry);
        const detailedPolyline = gRoute.detailedPoints && gRoute.detailedPoints.length > 0
          ? gRoute.detailedPoints
          : overviewPolyline;
        const routeHazards = hazardsNearPolyline(allHazards, detailedPolyline);
        const risk = calculateRouteRisk(routeHazards, riskMultiplier);
        const label = ROUTE_LABELS[i] || { id: `route_${i}`, label: `Route ${i + 1}`, description: "Alternative route" };
        const estimatedMinutes = Math.round(gRoute.duration / 60);
        const distanceKm = Math.round(gRoute.distance / 100) / 10;

        return {
          id: label.id,
          label: label.label,
          description: label.description,
          estimatedMinutes,
          distanceKm,
          timePenaltyMinutes: Math.min(15, Math.round(Math.log2(risk.score + 1))),
          hazards: routeHazards,
          riskScore: risk.score,
          highestSeverity: risk.highestTier,
          totalHazards: risk.totalHazards,
          severityCounts: risk.counts,
          waypoints: detailedPolyline,
          steps: gRoute.steps,
        };
      });

      routes.sort((a, b) => {
        if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
        if (a.highestSeverity !== b.highestSeverity) return a.highestSeverity - b.highestSeverity;
        if (a.totalHazards !== b.totalHazards) return a.totalHazards - b.totalHazards;
        return a.estimatedMinutes - b.estimatedMinutes;
      });

      for (const r of routes) { r.id = ""; r.label = ""; r.description = ""; }

      routes[0].id = "safest";
      routes[0].label = "Low-Car Safe";
      routes[0].description = routes[0].totalHazards === 0
        ? "Clear path — no hazards detected"
        : `Safest path — ${routes[0].totalHazards} hazard${routes[0].totalHazards !== 1 ? "s" : ""}, risk score ${routes[0].riskScore}`;

      if (routes.length > 1) {
        const quickestIdx = routes.reduce((bestIdx, r, i) => {
          if (i === 0) return bestIdx;
          return r.estimatedMinutes < routes[bestIdx].estimatedMinutes ? i : bestIdx;
        }, 1);

        routes[quickestIdx].id = "quickest";
        routes[quickestIdx].label = "Quickest";
        const qRoute = routes[quickestIdx];
        routes[quickestIdx].description = qRoute.totalHazards > 0
          ? `${qRoute.estimatedMinutes} min — ${qRoute.totalHazards} hazard${qRoute.totalHazards !== 1 ? "s" : ""}, risk score ${qRoute.riskScore}`
          : `${qRoute.estimatedMinutes} min — no hazards`;

        for (const r of routes) {
          if (!r.id || (r.id !== "safest" && r.id !== "quickest")) {
            r.id = "balanced";
            r.label = "Balanced";
            r.description = r.totalHazards > 0
              ? `${r.totalHazards} hazard${r.totalHazards !== 1 ? "s" : ""}, risk score ${r.riskScore} · ${r.estimatedMinutes} min`
              : `No hazards · ${r.estimatedMinutes} min`;
          }
        }
      }

      res.json({ routes, carProfile: carProfileInfo, riskMultiplier });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Route calculation failed" });
    }
  });

  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const { input, lat, lng } = req.query;
      if (!input || typeof input !== "string" || input.trim().length < 2) {
        return res.json([]);
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Maps API not configured" });

      let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}`;
      if (lat && lng) {
        url += `&location=${lat},${lng}&radius=50000`;
      }
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await resp.json() as any;
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Places API error:", data.status, data.error_message);
        return res.json([]);
      }
      const results = (data.predictions || []).map((p: any) => ({
        description: p.description,
        placeId: p.place_id,
      }));
      res.json(results);
    } catch (err) {
      console.error("Places autocomplete error:", err);
      res.json([]);
    }
  });

  app.get("/api/geocode", async (req: Request, res: Response) => {
    try {
      const { placeId, address, lat, lng } = req.query;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(500).json({ message: "Maps API not configured" });

      let url: string;
      if (placeId) {
        url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId as string)}&key=${apiKey}`;
      } else if (address) {
        url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address as string)}&key=${apiKey}`;
      } else {
        return res.status(400).json({ message: "Provide placeId or address" });
      }

      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await resp.json() as any;
      if (data.status !== "OK" || !data.results?.length) {
        return res.json(null);
      }
      const result = data.results[0];
      res.json({
        formattedAddress: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
      });
    } catch (err) {
      console.error("Geocode error:", err);
      res.status(500).json({ message: "Geocoding failed" });
    }
  });

  app.post("/api/routes/save", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, startLat, startLng, endLat, endLng, startAddress, endAddress, riskScore, carProfileId, routeData } = req.body;
      if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ message: "Name must be 1-100 characters" });
      }
      if (startLat == null || startLng == null || endLat == null || endLng == null) {
        return res.status(400).json({ message: "Start and end coordinates are required" });
      }
      const route = await storage.saveRoute({
        userId: req.session.userId!,
        name: name.trim(),
        startLat: parseFloat(startLat),
        startLng: parseFloat(startLng),
        endLat: parseFloat(endLat),
        endLng: parseFloat(endLng),
        startAddress: startAddress || null,
        endAddress: endAddress || null,
        riskScore: parseInt(riskScore) || 0,
        carProfileId: carProfileId || null,
        routeData: routeData || null,
      });
      res.json(route);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to save route" });
    }
  });

  app.get("/api/routes/saved", requireAuth, async (req: Request, res: Response) => {
    try {
      const routes = await storage.getSavedRoutesByUser(req.session.userId!);
      res.json(routes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch saved routes" });
    }
  });

  app.delete("/api/routes/saved/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const route = await storage.getSavedRouteById(req.params.id);
      if (!route) return res.status(404).json({ message: "Route not found" });
      if (route.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your route" });
      }
      await storage.deleteSavedRoute(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete route" });
    }
  });

  app.post("/api/routes/saved/:id/share", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.toggleRouteSharing(req.params.id, req.session.userId!);
      if (!result) return res.status(404).json({ message: "Route not found or not yours" });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to toggle sharing" });
    }
  });

  app.get("/api/routes/shared/:token", async (req: Request, res: Response) => {
    try {
      const route = await storage.getSavedRouteByShareToken(req.params.token);
      if (!route || !route.isPublic) {
        return res.status(404).json({ message: "Shared route not found" });
      }
      const user = await storage.getUserById(route.userId);
      res.json({
        id: route.id,
        name: route.name,
        startLat: route.startLat,
        startLng: route.startLng,
        endLat: route.endLat,
        endLng: route.endLng,
        startAddress: route.startAddress,
        endAddress: route.endAddress,
        riskScore: route.riskScore,
        routeData: route.routeData,
        createdAt: route.createdAt,
        sharedBy: user?.username || "Unknown",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch shared route" });
    }
  });

  app.post("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    try {
      const { tier } = req.body;
      if (tier === "pro") {
        return res.status(403).json({ message: "Pro upgrades require a subscription or promo code" });
      }
      if (tier !== "free") {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }
      await storage.updateSubscriptionTier(req.session.userId!, "free", null);
      const user = await storage.getUserById(req.session.userId!);
      res.json(safeUserResponse(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  });

  app.post("/api/admin/promo-codes", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { type, maxUses, expiresAt, code: customCode } = req.body;
      if (!type || !["7_day", "30_day", "permanent"].includes(type)) {
        return res.status(400).json({ message: "Invalid promo type. Use 7_day, 30_day, or permanent." });
      }
      const parsedUses = maxUses ? parseInt(maxUses) : 1;
      const uses = isNaN(parsedUses) ? 1 : Math.max(1, Math.min(10000, parsedUses));

      let code: string;
      if (customCode && typeof customCode === "string" && customCode.trim()) {
        code = customCode.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "");
        if (code.length < 3 || code.length > 20) {
          return res.status(400).json({ message: "Custom code must be 3-20 characters (letters, numbers, hyphens)" });
        }
        const existing = await storage.getPromoCodeByCode(code);
        if (existing) {
          return res.status(409).json({ message: `Code "${code}" is already taken` });
        }
      } else {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        code = "LOWPRO-";
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      }

      let parsedExpiry: Date | null = null;
      if (expiresAt && typeof expiresAt === "string" && expiresAt.trim()) {
        parsedExpiry = parseDateEndOfDayMST(expiresAt.trim());
        if (!parsedExpiry) {
          return res.status(400).json({ message: "Invalid expiry date. Use YYYY-MM-DD format." });
        }
        if (parsedExpiry < new Date()) {
          return res.status(400).json({ message: "Expiry date must be in the future" });
        }
      }

      const promo = await storage.createPromoCode({
        code,
        type,
        maxUses: uses,
        createdBy: req.session.userId!,
        expiresAt: parsedExpiry,
      });
      res.json(promo);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.get("/api/admin/promo-codes", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const codes = await storage.getAllPromoCodes();
      res.json(codes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch promo codes" });
    }
  });

  app.patch("/api/admin/promo-codes/:id/deactivate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const promo = await storage.deactivatePromoCode(req.params.id);
      if (!promo) return res.status(404).json({ message: "Promo code not found" });
      res.json(promo);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to deactivate promo code" });
    }
  });

  app.post("/api/promo/redeem", requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Promo code is required" });
      }

      const promo = await storage.getPromoCodeByCode(code.trim().toUpperCase());
      if (!promo) return res.status(404).json({ message: "Invalid promo code" });
      if (!promo.isActive) return res.status(400).json({ message: "This promo code is no longer active" });
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        return res.status(400).json({ message: "This promo code has expired" });
      }
      if (promo.currentUses >= promo.maxUses) {
        return res.status(400).json({ message: "This promo code has reached its usage limit" });
      }

      const hasRedeemed = await storage.hasUserRedeemedAnyPromo(req.session.userId!);
      if (hasRedeemed) return res.status(400).json({ message: "Promo codes are limited to one per account" });

      await storage.redeemPromoCode(req.session.userId!, promo.id);

      const currentUser = await storage.getUserById(req.session.userId!);
      let expiresAt: Date | null = null;
      if (promo.type === "7_day" || promo.type === "30_day") {
        const days = promo.type === "7_day" ? 7 : 30;
        const baseTime = (currentUser?.subscriptionExpiresAt && new Date(currentUser.subscriptionExpiresAt) > new Date())
          ? new Date(currentUser.subscriptionExpiresAt).getTime()
          : Date.now();
        expiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000);
      }

      if (currentUser?.subscriptionTier === "pro" && !currentUser.subscriptionExpiresAt && promo.type !== "permanent") {
        expiresAt = null;
      }

      await storage.updateSubscriptionTier(req.session.userId!, "pro", expiresAt);
      const user = await storage.getUserById(req.session.userId!);
      res.json({
        message: promo.type === "permanent"
          ? "Permanent Pro access activated!"
          : `Pro access activated for ${promo.type === "7_day" ? "7 days" : "30 days"}!`,
        user: safeUserResponse(user),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to redeem promo code" });
    }
  });

  // Car profile routes
  app.get("/api/cars", requireAuth, async (req: Request, res: Response) => {
    try {
      const profiles = await storage.getCarProfilesByUser(req.session.userId!);
      res.json(profiles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch car profiles" });
    }
  });

  app.get("/api/cars/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getCarProfileById(req.params.id);
      if (!profile) return res.status(404).json({ message: "Car profile not found" });
      if (profile.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      res.json(profile);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch car profile" });
    }
  });

  app.post("/api/cars", requireAuth, async (req: Request, res: Response) => {
    try {
      const { make, model, year, rideHeight, suspensionType, hasFrontLip, wheelSize, clearanceMode, isDefault, avatarStyle, avatarColor } = req.body;
      if (!make || !model || !year) {
        return res.status(400).json({ message: "Make, model, and year are required" });
      }
      if (typeof make !== "string" || make.length < 1 || make.length > 50) {
        return res.status(400).json({ message: "Make must be 1-50 characters" });
      }
      if (typeof model !== "string" || model.length < 1 || model.length > 50) {
        return res.status(400).json({ message: "Model must be 1-50 characters" });
      }
      const parsedYear = parseInt(year);
      if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2030) {
        return res.status(400).json({ message: "Year must be between 1900 and 2030" });
      }
      const validSuspension = ["stock", "lowered", "coilovers", "air_ride", "bagged"];
      if (suspensionType && !validSuspension.includes(suspensionType)) {
        return res.status(400).json({ message: "Invalid suspension type" });
      }
      const validClearance = ["normal", "lowered", "very_lowered", "show_car"];
      if (clearanceMode && !validClearance.includes(clearanceMode)) {
        return res.status(400).json({ message: "Invalid clearance mode" });
      }
      const profile = await storage.createCarProfile({
        userId: req.session.userId!,
        make: make.trim(),
        model: model.trim(),
        year: parsedYear,
        rideHeight: rideHeight ? parseFloat(rideHeight) : null,
        suspensionType: suspensionType || "stock",
        hasFrontLip: !!hasFrontLip,
        wheelSize: wheelSize ? parseInt(wheelSize) : null,
        clearanceMode: clearanceMode || "normal",
        isDefault: !!isDefault,
        avatarStyle: avatarStyle || "sedan",
        avatarColor: avatarColor || "#F97316",
      });
      res.json(profile);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create car profile" });
    }
  });

  app.put("/api/cars/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getCarProfileById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Car profile not found" });
      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      const { make, model, year, rideHeight, suspensionType, hasFrontLip, wheelSize, clearanceMode, isDefault, avatarStyle, avatarColor } = req.body;
      const validSuspension = ["stock", "lowered", "coilovers", "air_ride", "bagged"];
      const validClearance = ["normal", "lowered", "very_lowered", "show_car"];
      const updates: any = {};
      if (make !== undefined) {
        if (typeof make !== "string" || make.trim().length < 1 || make.trim().length > 50) {
          return res.status(400).json({ message: "Make must be 1-50 characters" });
        }
        updates.make = make.trim();
      }
      if (model !== undefined) {
        if (typeof model !== "string" || model.trim().length < 1 || model.trim().length > 50) {
          return res.status(400).json({ message: "Model must be 1-50 characters" });
        }
        updates.model = model.trim();
      }
      if (year !== undefined) {
        const parsedYear = parseInt(year);
        if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2030) {
          return res.status(400).json({ message: "Year must be between 1900 and 2030" });
        }
        updates.year = parsedYear;
      }
      if (rideHeight !== undefined) updates.rideHeight = rideHeight ? parseFloat(rideHeight) : null;
      if (suspensionType !== undefined) {
        if (!validSuspension.includes(suspensionType)) {
          return res.status(400).json({ message: "Invalid suspension type" });
        }
        updates.suspensionType = suspensionType;
      }
      if (hasFrontLip !== undefined) updates.hasFrontLip = !!hasFrontLip;
      if (wheelSize !== undefined) updates.wheelSize = wheelSize ? parseInt(wheelSize) : null;
      if (clearanceMode !== undefined) {
        if (!validClearance.includes(clearanceMode)) {
          return res.status(400).json({ message: "Invalid clearance mode" });
        }
        updates.clearanceMode = clearanceMode;
      }
      if (isDefault !== undefined) updates.isDefault = !!isDefault;
      if (avatarStyle !== undefined) updates.avatarStyle = avatarStyle;
      if (avatarColor !== undefined) updates.avatarColor = avatarColor;
      const profile = await storage.updateCarProfile(req.params.id, updates);
      res.json(profile);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update car profile" });
    }
  });

  app.delete("/api/cars/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getCarProfileById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Car profile not found" });
      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      await storage.deleteCarProfile(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete car profile" });
    }
  });

  app.post("/api/cars/:id/default", requireAuth, async (req: Request, res: Response) => {
    try {
      const existing = await storage.getCarProfileById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Car profile not found" });
      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      await storage.setDefaultCarProfile(req.session.userId!, req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to set default car" });
    }
  });

  // Event routes
  app.get("/api/events", async (req: Request, res: Response) => {
    try {
      const { minLat, maxLat, minLng, maxLng } = req.query;
      let evts;
      if (minLat && maxLat && minLng && maxLng) {
        evts = await storage.getEventsByBbox(
          parseFloat(minLat as string),
          parseFloat(maxLat as string),
          parseFloat(minLng as string),
          parseFloat(maxLng as string)
        );
      } else {
        evts = await storage.getUpcomingEvents();
      }
      if (req.session?.userId) {
        const enriched = await Promise.all(evts.map(async (e: any) => ({
          ...e,
          hasRsvped: await storage.getUserRsvp(req.session.userId!, e.id),
        })));
        return res.json(enriched);
      }
      res.json(evts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get("/api/events/upcoming", async (req: Request, res: Response) => {
    try {
      const evts = await storage.getUpcomingEvents();
      if (req.session?.userId) {
        const enriched = await Promise.all(evts.map(async (e: any) => ({
          ...e,
          hasRsvped: await storage.getUserRsvp(req.session.userId!, e.id),
        })));
        return res.json(enriched);
      }
      res.json(evts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch upcoming events" });
    }
  });

  app.get("/api/events/:id", async (req: Request, res: Response) => {
    try {
      const event = await storage.getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const result: any = { ...event };
      if (req.session?.userId) {
        result.hasRsvped = await storage.getUserRsvp(req.session.userId, event.id);
      }
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.post("/api/events", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, description, eventType, lat, lng, date, endDate, maxAttendees } = req.body;
      if (!title || !description || !eventType || !lat || !lng || !date) {
        return res.status(400).json({ message: "Title, description, type, location, and date are required" });
      }
      if (typeof title !== "string" || title.length < 3 || title.length > 100) {
        return res.status(400).json({ message: "Title must be 3-100 characters" });
      }
      if (typeof description !== "string" || description.length < 5 || description.length > 500) {
        return res.status(400).json({ message: "Description must be 5-500 characters" });
      }
      const validEventTypes = ["car_meet", "show_and_shine", "cruise", "photo_spot", "shop_garage"];
      if (!validEventTypes.includes(eventType)) {
        return res.status(400).json({ message: "Invalid event type" });
      }
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        return res.status(400).json({ message: "Invalid latitude" });
      }
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        return res.status(400).json({ message: "Invalid longitude" });
      }
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid date" });
      }
      const event = await storage.createEvent({
        userId: req.session.userId!,
        title: title.trim(),
        description: description.trim(),
        eventType,
        lat: parsedLat,
        lng: parsedLng,
        date: parsedDate,
        endDate: endDate ? new Date(endDate) : null,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
      });
      await storage.updateUserReputation(req.session.userId!, 15);
      res.json(event);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.put("/api/events/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const event = await storage.getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your event" });
      }
      const { title, description, eventType, date, endDate, maxAttendees, status } = req.body;
      const validEventTypes = ["car_meet", "show_and_shine", "cruise", "photo_spot", "shop_garage"];
      const validStatuses = ["active", "cancelled", "completed"];
      const updates: any = {};
      if (title !== undefined) {
        if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 100) {
          return res.status(400).json({ message: "Title must be 3-100 characters" });
        }
        updates.title = title.trim();
      }
      if (description !== undefined) {
        if (typeof description !== "string" || description.trim().length < 5 || description.trim().length > 500) {
          return res.status(400).json({ message: "Description must be 5-500 characters" });
        }
        updates.description = description.trim();
      }
      if (eventType !== undefined) {
        if (!validEventTypes.includes(eventType)) {
          return res.status(400).json({ message: "Invalid event type" });
        }
        updates.eventType = eventType;
      }
      if (date) {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ message: "Invalid date" });
        }
        updates.date = parsed;
      }
      if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
      if (maxAttendees !== undefined) updates.maxAttendees = maxAttendees ? parseInt(maxAttendees) : null;
      if (status !== undefined) {
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        updates.status = status;
      }
      const updated = await storage.updateEvent(req.params.id, updates);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const event = await storage.getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const user = await storage.getUserById(req.session.userId!);
      if (event.userId !== req.session.userId && user?.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  app.post("/api/events/:id/rsvp", requireAuth, async (req: Request, res: Response) => {
    try {
      const event = await storage.getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.maxAttendees && event.rsvpCount >= event.maxAttendees) {
        const hasRsvp = await storage.getUserRsvp(req.session.userId!, req.params.id);
        if (!hasRsvp) {
          return res.status(400).json({ message: "Event is full" });
        }
      }
      const result = await storage.toggleRsvp(req.session.userId!, req.params.id);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update RSVP" });
    }
  });

  // Admin event routes
  app.get("/api/admin/events", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const evts = await storage.getAllEvents();
      res.json(evts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.delete("/api/admin/events/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const event = await storage.deleteEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  app.patch("/api/admin/events/:id/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status || !["upcoming", "active", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const event = await storage.updateEvent(req.params.id, { status });
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json(event);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update event status" });
    }
  });

  // Friends system routes
  app.get("/api/users/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string" || q.trim().length < 1) {
        return res.status(400).json({ message: "Search query is required" });
      }
      const users = await storage.searchUsersByUsername(q.trim(), req.session.userId!);
      res.json(users);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.post("/api/friends/request", requireAuth, async (req: Request, res: Response) => {
    try {
      const { addresseeId } = req.body;
      if (!addresseeId || typeof addresseeId !== "string") {
        return res.status(400).json({ message: "addresseeId is required" });
      }
      if (addresseeId === req.session.userId) {
        return res.status(400).json({ message: "Cannot send friend request to yourself" });
      }
      const addressee = await storage.getUserById(addresseeId);
      if (!addressee) {
        return res.status(404).json({ message: "User not found" });
      }
      const friendship = await storage.sendFriendRequest(req.session.userId!, addresseeId);
      if (!friendship) {
        return res.status(400).json({ message: "Cannot send friend request to this user" });
      }
      const requester = await storage.getUserById(req.session.userId!);
      sendPushNotification(addresseeId, "Friend Request", `${requester?.username || "Someone"} sent you a friend request`, { type: "friend_request", fromUserId: req.session.userId });
      res.json(friendship);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  app.get("/api/friends", requireAuth, async (req: Request, res: Response) => {
    try {
      const friends = await storage.getAcceptedFriends(req.session.userId!);
      res.json(friends);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch friends" });
    }
  });

  app.get("/api/friends/requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const requests = await storage.getPendingFriendRequests(req.session.userId!);
      res.json(requests);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch friend requests" });
    }
  });

  app.get("/api/friends/with-cars", requireAuth, async (req: Request, res: Response) => {
    try {
      const friends = await storage.getFriendsWithCars(req.session.userId!);
      res.json(friends);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch friends" });
    }
  });

  app.post("/api/friends/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.acceptFriendRequest(req.params.id, req.session.userId!);
      if (!result) {
        return res.status(404).json({ message: "Friend request not found or already handled" });
      }
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to accept friend request" });
    }
  });

  app.post("/api/friends/:id/decline", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.declineFriendRequest(req.params.id, req.session.userId!);
      if (!result) {
        return res.status(404).json({ message: "Friend request not found or already handled" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to decline friend request" });
    }
  });

  app.delete("/api/friends/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.removeFriend(req.params.id, req.session.userId!);
      if (!result) {
        return res.status(404).json({ message: "Friendship not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  app.post("/api/location/update", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || !user.shareLocation) {
        await storage.deleteUserLocation(req.session.userId!);
        return res.json({ hidden: true });
      }
      const { lat, lng, activeCarId } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ message: "lat and lng are required" });
      }
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        return res.status(400).json({ message: "Invalid latitude" });
      }
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        return res.status(400).json({ message: "Invalid longitude" });
      }
      const location = await storage.updateUserLocation(req.session.userId!, parsedLat, parsedLng, activeCarId || null);
      res.json(location);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.get("/api/friends/locations", requireAuth, async (req: Request, res: Response) => {
    try {
      const locations = await storage.getFriendsLocations(req.session.userId!);
      res.json(locations);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch friend locations" });
    }
  });

  app.patch("/api/settings/location-sharing", requireAuth, async (req: Request, res: Response) => {
    try {
      const { shareLocation } = req.body;
      if (typeof shareLocation !== "boolean") {
        return res.status(400).json({ message: "shareLocation must be a boolean" });
      }
      const user = await storage.updateUserShareLocation(req.session.userId!, shareLocation);
      if (!shareLocation) {
        await storage.deleteUserLocation(req.session.userId!);
      }
      res.json(safeUserResponse(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update location sharing setting" });
    }
  });

  // Marketplace routes
  app.get("/api/marketplace", async (req: Request, res: Response) => {
    try {
      const { category, condition, search, lat, lng, radius, priceMin, priceMax, sort, shippingOption, sellerId } = req.query;
      const filters: any = {};
      if (category && typeof category === "string") filters.category = category;
      if (condition && typeof condition === "string") filters.condition = condition;
      if (search && typeof search === "string") filters.search = search;
      if (shippingOption && typeof shippingOption === "string") {
        const validShippingFilters = ["pickup_only", "shipping_available", "shipping_only"];
        if (validShippingFilters.includes(shippingOption)) {
          filters.shippingOption = shippingOption;
        }
      }
      if (sellerId && typeof sellerId === "string") filters.sellerId = sellerId;
      if (lat && lng) {
        filters.lat = parseFloat(lat as string);
        filters.lng = parseFloat(lng as string);
      }
      filters.radiusMiles = radius ? parseFloat(radius as string) : 50;
      if (priceMin) filters.priceMin = parseInt(priceMin as string);
      if (priceMax) filters.priceMax = parseInt(priceMax as string);
      if (sort && typeof sort === "string") filters.sort = sort;

      const listings = await storage.getMarketplaceListings(filters);
      res.json(listings);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch listings" });
    }
  });

  app.post("/api/marketplace", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, description, price, category, condition, lat, lng, city, photos, shippingOption } = req.body;
      if (!title || !description || price == null || !category || !condition || lat == null || lng == null) {
        return res.status(400).json({ message: "Title, description, price, category, condition, and location are required" });
      }
      const validShipping = ["pickup_only", "shipping_available", "shipping_only"];
      if (shippingOption && !validShipping.includes(shippingOption)) {
        return res.status(400).json({ message: "Invalid shipping option" });
      }
      if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 100) {
        return res.status(400).json({ message: "Title must be 3-100 characters" });
      }
      if (typeof description !== "string" || description.trim().length < 5 || description.trim().length > 2000) {
        return res.status(400).json({ message: "Description must be 5-2000 characters" });
      }
      const parsedPrice = parseInt(price);
      if (isNaN(parsedPrice) || parsedPrice < 0 || parsedPrice > 99999999) {
        return res.status(400).json({ message: "Invalid price" });
      }
      const validCategories = ["wheels_tires", "suspension", "body_kits", "exhaust", "interior", "electronics", "engine", "misc"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      const validConditions = ["new", "like_new", "good", "fair", "parts_only"];
      if (!validConditions.includes(condition)) {
        return res.status(400).json({ message: "Invalid condition" });
      }
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        return res.status(400).json({ message: "Invalid latitude" });
      }
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        return res.status(400).json({ message: "Invalid longitude" });
      }
      const listing = await storage.createMarketplaceListing({
        sellerId: req.session.userId!,
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        category,
        condition,
        lat: parsedLat,
        lng: parsedLng,
        city: city || null,
        photos: Array.isArray(photos) ? photos : [],
        shippingOption: shippingOption || "pickup_only",
      });
      res.json(listing);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create listing" });
    }
  });

  app.get("/api/marketplace/:id", async (req: Request, res: Response) => {
    try {
      const listing = await storage.getMarketplaceListingById(req.params.id);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      res.json(listing);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch listing" });
    }
  });

  app.put("/api/marketplace/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const listing = await storage.getMarketplaceListingById(req.params.id);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.sellerId !== req.session.userId) {
        return res.status(403).json({ message: "Not your listing" });
      }
      const { title, description, price, category, condition, photos, status, shippingOption } = req.body;
      const updates: any = {};
      if (title !== undefined) {
        if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 100) {
          return res.status(400).json({ message: "Title must be 3-100 characters" });
        }
        updates.title = title.trim();
      }
      if (description !== undefined) {
        if (typeof description !== "string" || description.trim().length < 5 || description.trim().length > 2000) {
          return res.status(400).json({ message: "Description must be 5-2000 characters" });
        }
        updates.description = description.trim();
      }
      if (price !== undefined) {
        const parsedPrice = parseInt(price);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ message: "Invalid price" });
        }
        updates.price = parsedPrice;
      }
      if (category !== undefined) {
        const validCategories = ["wheels_tires", "suspension", "body_kits", "exhaust", "interior", "electronics", "engine", "misc"];
        if (!validCategories.includes(category)) {
          return res.status(400).json({ message: "Invalid category" });
        }
        updates.category = category;
      }
      if (condition !== undefined) {
        const validConditions = ["new", "like_new", "good", "fair", "parts_only"];
        if (!validConditions.includes(condition)) {
          return res.status(400).json({ message: "Invalid condition" });
        }
        updates.condition = condition;
      }
      if (photos !== undefined) {
        if (!Array.isArray(photos)) {
          return res.status(400).json({ message: "Photos must be an array" });
        }
        updates.photos = photos;
      }
      if (status !== undefined) {
        const validStatuses = ["active", "sold", "removed"];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        updates.status = status;
      }
      if (shippingOption !== undefined) {
        const validShipping = ["pickup_only", "shipping_available", "shipping_only"];
        if (!validShipping.includes(shippingOption)) {
          return res.status(400).json({ message: "Invalid shipping option" });
        }
        updates.shippingOption = shippingOption;
      }
      const updated = await storage.updateMarketplaceListing(req.params.id, updates);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update listing" });
    }
  });

  app.delete("/api/marketplace/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const listing = await storage.getMarketplaceListingById(req.params.id);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      const user = await storage.getUserById(req.session.userId!);
      if (listing.sellerId !== req.session.userId && user?.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteMarketplaceListing(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete listing" });
    }
  });

  const uploadsDir = path.resolve(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uploadStorage = multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (_req, file, cb) {
      const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, uniqueSuffix + ext);
    },
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".jpg", ".jpeg", ".png", ".webp"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Only jpg, png, and webp files are allowed"));
      }
    },
  });

  // ===== MESSAGING ROUTES =====
  app.post("/api/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const { receiverId, listingId, content } = req.body;
      if (!receiverId || !content) {
        return res.status(400).json({ message: "Receiver and content are required" });
      }
      if (typeof content !== "string" || content.trim().length < 1 || content.trim().length > 2000) {
        return res.status(400).json({ message: "Message must be 1-2000 characters" });
      }
      if (receiverId === req.session.userId) {
        return res.status(400).json({ message: "Cannot message yourself" });
      }
      const receiver = await storage.getUserById(receiverId);
      if (!receiver) {
        return res.status(404).json({ message: "User not found" });
      }
      if (listingId) {
        const listing = await storage.getMarketplaceListingById(listingId);
        if (!listing) {
          return res.status(404).json({ message: "Listing not found" });
        }
      }
      const msg = await storage.sendMessage({
        senderId: req.session.userId!,
        receiverId,
        listingId: listingId || null,
        content: content.trim(),
      });
      const sender = await storage.getUserById(req.session.userId!);
      sendPushNotification(receiverId, "New Message", `${sender?.username || "Someone"}: ${content.trim().substring(0, 100)}`, { type: "message", senderId: req.session.userId });
      res.json(msg);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/messages/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const conversations = await storage.getConversations(req.session.userId!);
      res.json(conversations);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/messages/unread-count", requireAuth, async (req: Request, res: Response) => {
    try {
      const count = await storage.getUnreadCount(req.session.userId!);
      res.json({ count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.get("/api/messages/:userId", requireAuth, async (req: Request, res: Response) => {
    try {
      const listingId = req.query.listingId as string | undefined;
      const messages = await storage.getMessages(
        req.session.userId!,
        req.params.userId,
        listingId || null
      );
      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.patch("/api/messages/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const { otherUserId, listingId, groupChatId } = req.body;
      if (!otherUserId && !groupChatId) {
        return res.status(400).json({ message: "otherUserId or groupChatId is required" });
      }
      if (groupChatId) {
        const isMember = await storage.isGroupChatMember(groupChatId, req.session.userId!);
        if (!isMember) {
          return res.status(403).json({ message: "Not a member of this group" });
        }
        await storage.markGroupMessagesRead(req.session.userId!, groupChatId);
      } else {
        await storage.markMessagesRead(req.session.userId!, otherUserId, listingId || null);
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // ===== GROUP CHAT ROUTES =====
  app.post("/api/group-chats", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, memberIds } = req.body;
      if (!Array.isArray(memberIds) || memberIds.length < 1) {
        return res.status(400).json({ message: "At least one member is required" });
      }
      if (name && (typeof name !== "string" || name.trim().length > 100)) {
        return res.status(400).json({ message: "Group name must be 100 characters or fewer" });
      }
      const group = await storage.createGroupChat(
        name ? name.trim() : null,
        req.session.userId!,
        memberIds
      );
      res.json(group);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create group chat" });
    }
  });

  app.get("/api/group-chats", requireAuth, async (req: Request, res: Response) => {
    try {
      const groups = await storage.getGroupChats(req.session.userId!);
      res.json(groups);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch group chats" });
    }
  });

  app.get("/api/group-chats/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const group = await storage.getGroupChatById(req.params.id);
      if (!group) return res.status(404).json({ message: "Group not found" });
      const isMember = await storage.isGroupChatMember(req.params.id, req.session.userId!);
      if (!isMember) return res.status(403).json({ message: "Not a member" });
      res.json(group);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch group chat" });
    }
  });

  app.get("/api/group-chats/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const isMember = await storage.isGroupChatMember(req.params.id, req.session.userId!);
      if (!isMember) return res.status(403).json({ message: "Not a member" });
      const messages = await storage.getGroupMessages(req.params.id);
      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch group messages" });
    }
  });

  app.post("/api/group-chats/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || content.trim().length < 1 || content.trim().length > 2000) {
        return res.status(400).json({ message: "Message must be 1-2000 characters" });
      }
      const isMember = await storage.isGroupChatMember(req.params.id, req.session.userId!);
      if (!isMember) return res.status(403).json({ message: "Not a member" });
      const msg = await storage.sendGroupMessage(req.session.userId!, req.params.id, content.trim());
      const groupChat = await storage.getGroupChatById(req.params.id);
      if (groupChat?.members) {
        const otherMemberIds = groupChat.members.filter((m: any) => m.userId !== req.session.userId).map((m: any) => m.userId);
        if (otherMemberIds.length > 0) {
          const sender = await storage.getUserById(req.session.userId!);
          sendPushToMultiple(otherMemberIds, groupChat.name || "Group Chat", `${sender?.username || "Someone"}: ${content.trim().substring(0, 100)}`, { type: "group_message", groupChatId: req.params.id });
        }
      }
      res.json(msg);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to send group message" });
    }
  });

  app.post("/api/group-chats/:id/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId is required" });
      const isMember = await storage.isGroupChatMember(req.params.id, req.session.userId!);
      if (!isMember) return res.status(403).json({ message: "Not a member" });
      const member = await storage.addGroupMember(req.params.id, userId);
      if (!member) return res.status(409).json({ message: "Already a member" });
      res.json(member);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to add member" });
    }
  });

  app.get("/privacy-policy", (_req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
    const html = fs.readFileSync(templatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/terms-of-service", (_req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "terms-of-service.html");
    const html = fs.readFileSync(templatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/support", (_req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "support.html");
    const html = fs.readFileSync(templatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  const express = require("express");
  app.use("/uploads", express.static(uploadsDir));

  app.post("/api/upload", requireAuth, upload.single("photo"), (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    try {
      const buffer = fs.readFileSync(req.file.path);
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
      if (!isJpeg && !isPng && !isWebp) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Invalid image file" });
      }
    } catch {
      // If we can't read the file, let it through (multer already validated extension)
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    res.json({ url: photoUrl });
  });

  // ===== PASSWORD CHANGE =====
  app.patch("/api/auth/password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

      const newHash = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(user.id, newHash);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // ===== PASSWORD RESET =====
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
      }

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      await storage.createPasswordResetToken(user.id, token);

      const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG + ".repl.co";
      const resetUrl = `https://${domain}:5000/api/auth/reset-password/${token}`;
      console.log(`Password reset link for ${email}: ${resetUrl}`);

      res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to process password reset" });
    }
  });

  app.get("/api/auth/reset-password/:token", async (req: Request, res: Response) => {
    try {
      const resetToken = await storage.getPasswordResetToken(req.params.token);
      if (!resetToken || new Date() > resetToken.expiresAt) {
        return res.status(400).send(`
          <html><head><title>LowRoute - Reset Password</title>
          <style>body{font-family:sans-serif;background:#0A0A0B;color:#F5F5F5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
          .card{background:#111114;padding:40px;border-radius:16px;text-align:center;max-width:400px}
          h2{color:#F59E0B}p{color:#9A9AAF}</style></head>
          <body><div class="card"><h2>Link Expired</h2><p>This password reset link has expired or already been used. Please request a new one from the app.</p></div></body></html>
        `);
      }
      res.send(`
        <html><head><title>LowRoute - Reset Password</title>
        <style>body{font-family:sans-serif;background:#0A0A0B;color:#F5F5F5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
        .card{background:#111114;padding:40px;border-radius:16px;max-width:400px;width:90%}
        h2{color:#F59E0B;margin-bottom:20px}
        input{width:100%;padding:12px;border-radius:8px;border:1px solid #2A2A32;background:#1E1E24;color:#F5F5F5;font-size:16px;margin-bottom:12px;box-sizing:border-box}
        button{width:100%;padding:14px;border-radius:12px;background:#F59E0B;color:#0A0A0B;font-size:16px;font-weight:bold;border:none;cursor:pointer}
        button:hover{background:#D97706}
        .msg{margin-top:12px;padding:10px;border-radius:8px;text-align:center}</style></head>
        <body><div class="card"><h2>Reset Your Password</h2>
        <form id="f" onsubmit="return doReset(event)">
        <input type="password" id="pw" placeholder="New password (min 6 chars)" required minlength="6">
        <input type="password" id="pw2" placeholder="Confirm new password" required minlength="6">
        <button type="submit">Reset Password</button>
        </form><div id="msg"></div>
        <script>async function doReset(e){e.preventDefault();
        const pw=document.getElementById('pw').value,pw2=document.getElementById('pw2').value,msg=document.getElementById('msg');
        if(pw!==pw2){msg.innerHTML='<div style="color:#EF4444">Passwords do not match</div>';return false}
        try{const r=await fetch('/api/auth/reset-password/${req.params.token}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
        const d=await r.json();if(r.ok){msg.innerHTML='<div style="color:#22C55E">Password reset! You can now log in with your new password.</div>';document.getElementById('f').style.display='none'}
        else{msg.innerHTML='<div style="color:#EF4444">'+(d.message||'Error')+'</div>'}}catch{msg.innerHTML='<div style="color:#EF4444">Network error</div>'}return false}</script>
        </div></body></html>
      `);
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  });

  app.post("/api/auth/reset-password/:token", async (req: Request, res: Response) => {
    try {
      const resetToken = await storage.getPasswordResetToken(req.params.token);
      if (!resetToken || new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const newHash = await bcrypt.hash(password, 10);
      await storage.updateUserPassword(resetToken.userId, newHash);
      await storage.markResetTokenUsed(resetToken.id);

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ===== ACCOUNT DELETION =====
  app.delete("/api/auth/account", requireAuth, async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ message: "Password is required to delete your account" });

      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Incorrect password" });

      await storage.deleteUserAccount(user.id);
      req.session.destroy(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // ===== DATA EXPORT =====
  app.get("/api/auth/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = await storage.exportUserData(req.session.userId!);
      if (!data) return res.status(404).json({ message: "User not found" });
      res.setHeader("Content-Disposition", `attachment; filename="lowroute-data-export.json"`);
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // ===== PUSH TOKEN =====
  app.post("/api/push-token", requireAuth, async (req: Request, res: Response) => {
    try {
      const { pushToken } = req.body;
      await storage.updatePushToken(req.session.userId!, pushToken || null);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update push token" });
    }
  });

  // ===== REPORTS =====
  app.post("/api/reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contentType, contentId, targetUserId, reason, description } = req.body;
      if (!contentType || !contentId || !targetUserId || !reason) {
        return res.status(400).json({ message: "contentType, contentId, targetUserId, and reason are required" });
      }
      if (targetUserId === req.session.userId) {
        return res.status(400).json({ message: "You cannot report yourself" });
      }
      const validContentTypes = ["user", "listing", "message", "hazard", "event"];
      if (!validContentTypes.includes(contentType)) {
        return res.status(400).json({ message: "Invalid content type" });
      }
      const validReasons = ["spam", "inappropriate", "scam_fraud", "harassment", "inaccurate", "other"];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({ message: "Invalid report reason" });
      }
      const report = await storage.createReport({
        reporterId: req.session.userId!,
        contentType,
        contentId,
        targetUserId,
        reason,
        description: description ? sanitizeInput(String(description).substring(0, 1000)) : undefined,
      });
      res.status(201).json(report);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  // ===== ADMIN REPORTS MANAGEMENT =====
  app.get("/api/admin/reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const status = req.query.status as string | undefined;
      const reports = await storage.getReports(status);
      const mapped = reports.map((r: any) => ({
        id: r.id,
        reporterId: r.reporter_id,
        contentType: r.content_type,
        contentId: r.content_id,
        targetUserId: r.target_user_id,
        reason: r.reason,
        description: r.description,
        status: r.status,
        adminNotes: r.admin_notes,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        resolvedBy: r.resolved_by,
        reporterUsername: r.reporter_username,
        targetUsername: r.target_username,
        targetReportCount: r.target_report_count,
        targetStatus: r.target_status,
      }));
      res.json(mapped);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.get("/api/admin/reports/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const report = await storage.getReportById(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      res.json(report);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  app.patch("/api/admin/reports/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status, adminNotes } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });

      await storage.updateReportStatus(req.params.id, status, user.id, adminNotes);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  // ===== ADMIN USER MANAGEMENT =====
  app.get("/api/admin/users", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const search = req.query.search as string | undefined;
      const users = await storage.getAllUsers(search);
      const mapped = users.map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        status: u.status,
        reportCount: u.report_count,
        reputation: u.reputation ?? 0,
        subscriptionTier: u.subscription_tier,
        createdAt: u.created_at,
      }));
      res.json(mapped);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:id/suspend", requireAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = await storage.getUserById(req.session.userId!);
      if (!adminUser || adminUser.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      if (req.params.id === req.session.userId) return res.status(400).json({ message: "Cannot suspend yourself" });

      await storage.suspendUser(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  });

  app.post("/api/admin/users/:id/unsuspend", requireAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = await storage.getUserById(req.session.userId!);
      if (!adminUser || adminUser.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      await storage.unsuspendUser(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to unsuspend user" });
    }
  });

  app.post("/api/admin/users/:id/ban", requireAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = await storage.getUserById(req.session.userId!);
      if (!adminUser || adminUser.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      if (req.params.id === req.session.userId) return res.status(400).json({ message: "Cannot ban yourself" });

      await storage.banUser(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to ban user" });
    }
  });

  app.post("/api/admin/users/:id/cancel-membership", requireAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = await storage.getUserById(req.session.userId!);
      if (!adminUser || adminUser.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      await storage.cancelMembership(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to cancel membership" });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = await storage.getUserById(req.session.userId!);
      if (!adminUser || adminUser.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      if (req.params.id === req.session.userId) return res.status(400).json({ message: "Cannot delete yourself" });

      await storage.adminDeleteUser(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
