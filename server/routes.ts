import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import * as storage from "./storage";
import { SEVERITY_TIERS } from "../shared/schema";

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  entry.lastAttempt = now;
  return true;
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

function distanceToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - ax;
    const ddy = py - ay;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
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

function calculateRouteRisk(hazards: Array<{ severity: number; confidenceScore: number }>) {
  const SEVERITY_PENALTIES = [0, 5, 20, 100, 1000];
  let score = 0;
  const counts = [0, 0, 0, 0, 0];

  for (const h of hazards) {
    if (h.confidenceScore < 0.4) continue;
    const tier = Math.max(1, Math.min(4, h.severity));
    score += SEVERITY_PENALTIES[tier];
    counts[tier]++;
  }

  const highestTier = counts[4] > 0 ? 4 : counts[3] > 0 ? 3 : counts[2] > 0 ? 2 : counts[1] > 0 ? 1 : 0;
  const totalHazards = counts[1] + counts[2] + counts[3] + counts[4];

  return { score, counts, highestTier, totalHazards };
}

const HAZARD_BUFFER_DEG = 0.0015;

function hazardsNearPolyline(
  allHazards: Array<{ lat: number; lng: number; severity: number; confidenceScore: number; [key: string]: any }>,
  polyline: Array<{ lat: number; lng: number }>
) {
  if (polyline.length === 0) return [];

  const lats = polyline.map((p) => p.lat);
  const lngs = polyline.map((p) => p.lng);
  const minLat = Math.min(...lats) - HAZARD_BUFFER_DEG;
  const maxLat = Math.max(...lats) + HAZARD_BUFFER_DEG;
  const minLng = Math.min(...lngs) - HAZARD_BUFFER_DEG;
  const maxLng = Math.max(...lngs) + HAZARD_BUFFER_DEG;

  return allHazards.filter((h) => {
    if (h.lat < minLat || h.lat > maxLat || h.lng < minLng || h.lng > maxLng) return false;
    for (let i = 0; i < polyline.length - 1; i++) {
      const d = distanceToSegment(
        h.lat, h.lng,
        polyline[i].lat, polyline[i].lng,
        polyline[i + 1].lat, polyline[i + 1].lng
      );
      if (d < HAZARD_BUFFER_DEG) return true;
    }
    return false;
  });
}

async function fetchOSRMRoutes(
  sLat: number, sLng: number, eLat: number, eLng: number
): Promise<Array<{ geometry: string; distance: number; duration: number }>> {
  const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?alternatives=true&overview=full&geometries=polyline`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`OSRM returned ${resp.status}`);
  const data = await resp.json() as any;
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("OSRM could not find routes");
  }
  return data.routes.map((r: any) => ({
    geometry: r.geometry,
    distance: r.distance,
    duration: r.duration,
  }));
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
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  const PgStore = ConnectPgSimple(session);

  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "lowroute-dev-secret",
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

  await storage.seedDemoHazards();
  if (process.env.NODE_ENV === "production") {
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await storage.seedAdminUser(process.env.ADMIN_USERNAME, adminHash);
    }
  } else {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "lowroute-admin";
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

      req.session.userId = user.id;
      const freshUser = await storage.checkAndDowngradeExpiredSubscription(user.id);
      res.json(safeUserResponse(freshUser ?? user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => res.json({ success: true }));
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
      const { lat, lng, type, severity, title, description } = req.body;
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
    const hazard = await storage.getHazardById(req.params.id);
    if (!hazard) return res.status(404).json({ message: "Not found" });
    res.json(hazard);
  });

  app.post("/api/hazards/:id/vote", requireAuth, async (req: Request, res: Response) => {
    try {
      const { voteType } = req.body;
      if (!["confirm", "downvote", "clear"].includes(voteType)) {
        return res.status(400).json({ message: "Invalid vote type" });
      }
      const hazard = await storage.voteOnHazard(req.session.userId!, req.params.id, voteType);
      if (!hazard) return res.status(404).json({ message: "Hazard not found" });
      const repDelta = voteType === "confirm" ? 2 : voteType === "clear" ? 3 : 0;
      if (repDelta > 0) await storage.updateUserReputation(req.session.userId!, repDelta);
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Vote failed" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

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
      const { startLat, startLng, endLat, endLng } = req.query;
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

      const allHazards = await storage.getAllActiveHazards();

      let osrmRoutes: Array<{ geometry: string; distance: number; duration: number }>;
      try {
        osrmRoutes = await fetchOSRMRoutes(sLat, sLng, eLat, eLng);
      } catch (osrmErr) {
        console.error("OSRM fetch failed:", osrmErr);
        return res.status(502).json({ message: "Routing service temporarily unavailable. Please try again." });
      }

      const ROUTE_LABELS = [
        { id: "fastest", label: "Fastest", description: "Shortest travel time" },
        { id: "safest", label: "Low-Car Safe", description: "Alternate route, may avoid hazards" },
        { id: "balanced", label: "Balanced", description: "Balance between time and safety" },
      ];

      const routes = osrmRoutes.slice(0, 3).map((osrmRoute, i) => {
        const polyline = decodePolyline(osrmRoute.geometry);
        const routeHazards = hazardsNearPolyline(allHazards, polyline);
        const risk = calculateRouteRisk(routeHazards);
        const label = ROUTE_LABELS[i] || { id: `route_${i}`, label: `Route ${i + 1}`, description: "Alternative route" };
        const estimatedMinutes = Math.round(osrmRoute.duration / 60);
        const distanceKm = Math.round(osrmRoute.distance / 100) / 10;

        return {
          id: label.id,
          label: label.label,
          description: label.description,
          estimatedMinutes,
          distanceKm,
          timePenaltyMinutes: Math.round(risk.score / 10),
          hazards: routeHazards,
          riskScore: risk.score,
          highestSeverity: risk.highestTier,
          totalHazards: risk.totalHazards,
          severityCounts: risk.counts,
          waypoints: polyline,
        };
      });

      routes.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
      if (routes.length > 0) {
        routes[0].id = "fastest";
        routes[0].label = "Fastest";
        routes[0].description = "Shortest travel time";
      }
      if (routes.length > 1) {
        const safest = routes.reduce((best, r) => r.riskScore < best.riskScore ? r : best, routes[1]);
        if (safest !== routes[0]) {
          safest.id = "safest";
          safest.label = "Low-Car Safe";
          safest.description = "Lowest hazard risk for low vehicles";
        }
      }

      res.json(routes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Route calculation failed" });
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
      const { type, maxUses, expiresAt } = req.body;
      if (!type || !["7_day", "30_day", "permanent"].includes(type)) {
        return res.status(400).json({ message: "Invalid promo type. Use 7_day, 30_day, or permanent." });
      }
      const parsedUses = maxUses ? parseInt(maxUses) : 1;
      const uses = isNaN(parsedUses) ? 1 : Math.max(1, Math.min(10000, parsedUses));
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "LOWPRO-";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

      const promo = await storage.createPromoCode({
        code,
        type,
        maxUses: uses,
        createdBy: req.session.userId!,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
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

      const existing = await storage.getUserRedemption(req.session.userId!, promo.id);
      if (existing) return res.status(400).json({ message: "You have already used this promo code" });

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

  const httpServer = createServer(app);
  return httpServer;
}
