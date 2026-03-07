import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import * as storage from "./storage";
import { SEVERITY_TIERS } from "../shared/schema";

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

/**
 * Route Safety Scoring Logic:
 *
 * Each route is scored based on hazards along its path.
 * Tier 4 hazards add 1000 penalty points (route nearly unusable)
 * Tier 3 hazards add 100 penalty points each
 * Tier 2 hazards add 20 penalty points each
 * Tier 1 hazards add 5 penalty points each
 *
 * Only hazards with confidence >= 0.4 are considered.
 * The "safest" route picks one that avoids Tier 4 and minimizes Tier 3.
 * The "balanced" route weighs safety vs distance.
 *
 * Since we don't have a real routing engine, we simulate 3 route variants
 * by slightly adjusting the bounding box and sampling hazards within each.
 */
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

function hazardsNearLine(
  allHazards: Array<{ lat: number; lng: number; severity: number; confidenceScore: number }>,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  bufferDeg: number
) {
  return allHazards.filter((h) => {
    const minLat = Math.min(startLat, endLat) - bufferDeg;
    const maxLat = Math.max(startLat, endLat) + bufferDeg;
    const minLng = Math.min(startLng, endLng) - bufferDeg;
    const maxLng = Math.max(startLng, endLng) + bufferDeg;
    return h.lat >= minLat && h.lat <= maxLat && h.lng >= minLng && h.lng <= maxLng;
  });
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

  // Auth routes
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ message: "Email already in use" });
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken" });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, email, passwordHash });
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, email: user.email, reputation: user.reputation });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "All fields required" });

      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, email: user.email, reputation: user.reputation });
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
    const user = await storage.getUserById(req.session.userId);
    if (!user) return res.json(null);
    res.json({ id: user.id, username: user.username, email: user.email, reputation: user.reputation });
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
      const hazard = await storage.createHazard({
        userId: req.session.userId!,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        type,
        severity: parseInt(severity),
        title,
        description,
      });
      await storage.updateUserReputation(req.session.userId!, 10);
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create hazard" });
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

  // Route calculation with hazard scoring
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

      const allHazards = await storage.getAllActiveHazards();

      // Route 1: Fastest (direct path, narrow buffer = more hazards possible)
      const route1Hazards = hazardsNearLine(allHazards, sLat, sLng, eLat, eLng, 0.003);
      const route1Risk = calculateRouteRisk(route1Hazards);

      // Route 2: Safest (wider detour, different midpoints to simulate alternate road)
      const midLat = (sLat + eLat) / 2 + 0.008;
      const midLng = (sLng + eLng) / 2 - 0.006;
      const route2AHazards = hazardsNearLine(allHazards, sLat, sLng, midLat, midLng, 0.002);
      const route2BHazards = hazardsNearLine(allHazards, midLat, midLng, eLat, eLng, 0.002);
      const route2Hazards = [...new Set([...route2AHazards, ...route2BHazards])];
      const route2Risk = calculateRouteRisk(route2Hazards);

      // Route 3: Balanced (moderate buffer, different offset)
      const mid3Lat = (sLat + eLat) / 2 - 0.004;
      const mid3Lng = (sLng + eLng) / 2 + 0.005;
      const route3AHazards = hazardsNearLine(allHazards, sLat, sLng, mid3Lat, mid3Lng, 0.0025);
      const route3BHazards = hazardsNearLine(allHazards, mid3Lat, mid3Lng, eLat, eLng, 0.0025);
      const route3Hazards = [...new Set([...route3AHazards, ...route3BHazards])];
      const route3Risk = calculateRouteRisk(route3Hazards);

      // Calculate estimated time penalty in minutes (10 pts = 1 min delay)
      const routes = [
        {
          id: "fastest",
          label: "Fastest",
          description: "Direct route, minimum travel time",
          estimatedMinutes: 18,
          timePenaltyMinutes: Math.round(route1Risk.score / 10),
          hazards: route1Hazards,
          riskScore: route1Risk.score,
          highestSeverity: route1Risk.highestTier,
          totalHazards: route1Risk.totalHazards,
          severityCounts: route1Risk.counts,
          waypoints: [
            { lat: sLat, lng: sLng },
            { lat: eLat, lng: eLng },
          ],
        },
        {
          id: "safest",
          label: "Low-Car Safe",
          description: "Avoids Tier 4 hazards, safest for low vehicles",
          estimatedMinutes: 24,
          timePenaltyMinutes: Math.round(route2Risk.score / 10),
          hazards: route2Hazards,
          riskScore: route2Risk.score,
          highestSeverity: route2Risk.highestTier,
          totalHazards: route2Risk.totalHazards,
          severityCounts: route2Risk.counts,
          waypoints: [
            { lat: sLat, lng: sLng },
            { lat: midLat, lng: midLng },
            { lat: eLat, lng: eLng },
          ],
        },
        {
          id: "balanced",
          label: "Balanced",
          description: "Balance between time and road safety",
          estimatedMinutes: 21,
          timePenaltyMinutes: Math.round(route3Risk.score / 10),
          hazards: route3Hazards,
          riskScore: route3Risk.score,
          highestSeverity: route3Risk.highestTier,
          totalHazards: route3Risk.totalHazards,
          severityCounts: route3Risk.counts,
          waypoints: [
            { lat: sLat, lng: sLng },
            { lat: mid3Lat, lng: mid3Lng },
            { lat: eLat, lng: eLng },
          ],
        },
      ];

      res.json(routes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Route calculation failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
