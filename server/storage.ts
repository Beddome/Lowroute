import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, sql, between } from "drizzle-orm";
import * as schema from "../shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function getUserById(id: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user || null;
}

export async function getUserByUsername(username: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  return user || null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  return user || null;
}

export async function createUser(data: schema.InsertUser) {
  const [user] = await db.insert(schema.users).values(data).returning();
  return user;
}

export async function updateUserReputation(userId: string, delta: number) {
  await db
    .update(schema.users)
    .set({ reputation: sql`${schema.users.reputation} + ${delta}` })
    .where(eq(schema.users.id, userId));
}

export async function getHazardsByBbox(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
) {
  return db
    .select()
    .from(schema.hazards)
    .where(
      and(
        between(schema.hazards.lat, minLat, maxLat),
        between(schema.hazards.lng, minLng, maxLng),
        eq(schema.hazards.status, "active")
      )
    );
}

export async function getHazardById(id: string) {
  const [hazard] = await db.select().from(schema.hazards).where(eq(schema.hazards.id, id));
  return hazard || null;
}

export async function createHazard(data: {
  userId: string;
  lat: number;
  lng: number;
  type: schema.Hazard["type"];
  severity: number;
  title: string;
  description: string;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [hazard] = await db
    .insert(schema.hazards)
    .values({ ...data, expiresAt })
    .returning();
  return hazard;
}

export async function getUserVoteForHazard(userId: string, hazardId: string) {
  const [vote] = await db
    .select()
    .from(schema.hazardVotes)
    .where(and(eq(schema.hazardVotes.userId, userId), eq(schema.hazardVotes.hazardId, hazardId)));
  return vote || null;
}

export async function voteOnHazard(
  userId: string,
  hazardId: string,
  voteType: "confirm" | "downvote" | "clear"
) {
  const existing = await getUserVoteForHazard(userId, hazardId);
  if (existing) {
    await db
      .update(schema.hazardVotes)
      .set({ voteType })
      .where(eq(schema.hazardVotes.id, existing.id));
  } else {
    await db.insert(schema.hazardVotes).values({ userId, hazardId, voteType });
  }

  const [confirms] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.hazardVotes)
    .where(and(eq(schema.hazardVotes.hazardId, hazardId), eq(schema.hazardVotes.voteType, "confirm")));

  const [downvotes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.hazardVotes)
    .where(and(eq(schema.hazardVotes.hazardId, hazardId), eq(schema.hazardVotes.voteType, "downvote")));

  const [clears] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.hazardVotes)
    .where(and(eq(schema.hazardVotes.hazardId, hazardId), eq(schema.hazardVotes.voteType, "clear")));

  const confirmCount = confirms?.count ?? 0;
  const downvoteCount = downvotes?.count ?? 0;
  const clearCount = clears?.count ?? 0;
  const total = confirmCount + downvoteCount + clearCount + 1;
  const confidence = Math.min(1, (confirmCount + 1) / total);
  const status: "active" | "cleared" = clearCount >= 3 ? "cleared" : "active";

  await db
    .update(schema.hazards)
    .set({ upvotes: confirmCount, downvotes: downvoteCount, confidenceScore: confidence, status })
    .where(eq(schema.hazards.id, hazardId));

  return getHazardById(hazardId);
}

export async function getAllActiveHazards() {
  return db.select().from(schema.hazards).where(eq(schema.hazards.status, "active"));
}

export async function seedDemoHazards() {
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.hazards);
  if ((count?.count ?? 0) > 0) return;

  const demoUserId = "demo-user-seed";

  await db.insert(schema.users).values({
    id: demoUserId,
    username: "community_bot",
    email: "bot@lowroute.app",
    passwordHash: "seeded",
    reputation: 500,
  }).onConflictDoNothing();

  const sampleHazards = [
    { lat: 34.0522, lng: -118.2437, type: "pothole" as const, severity: 3, title: "Deep Pothole", description: "Large pothole in right lane. Could bottom out low cars." },
    { lat: 34.0532, lng: -118.2457, type: "speed_bump" as const, severity: 4, title: "Extreme Speed Bump", description: "Unmarked extremely tall speed bump. Full detour for slammed builds." },
    { lat: 34.0512, lng: -118.2417, type: "construction" as const, severity: 3, title: "Construction Zone", description: "Metal plates and loose gravel. Lane partially blocked." },
    { lat: 34.0542, lng: -118.2477, type: "raised_manhole" as const, severity: 2, title: "Raised Manhole", description: "Cover sits 2 inches above road surface. Approach with caution." },
    { lat: 34.0502, lng: -118.2397, type: "railroad_crossing" as const, severity: 2, title: "Rough Railroad Crossing", description: "Uneven tracks with significant lip. Approach at angle." },
    { lat: 34.0562, lng: -118.2497, type: "flooded_road" as const, severity: 4, title: "Flooded Underpass", description: "Standing water of unknown depth. Full detour required." },
    { lat: 34.0488, lng: -118.238, type: "debris" as const, severity: 1, title: "Road Debris", description: "Tire fragments on shoulder. Dodgeable, watch left lane." },
    { lat: 34.0575, lng: -118.251, type: "large_bump_dip" as const, severity: 3, title: "Severe Road Dip", description: "Deep dip at bridge approach. Bottom-out risk at speed." },
    { lat: 34.0498, lng: -118.247, type: "steep_driveway" as const, severity: 2, title: "Steep Entry Angle", description: "Sharp angle entering the gas station. Scrape risk." },
    { lat: 34.0518, lng: -118.249, type: "pothole" as const, severity: 1, title: "Small Pothole Cluster", description: "Several small potholes in right lane. Move left to avoid." },
  ];

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  for (const h of sampleHazards) {
    await db.insert(schema.hazards).values({
      userId: demoUserId,
      ...h,
      status: "active",
      upvotes: Math.floor(Math.random() * 20) + 1,
      confidenceScore: 0.6 + Math.random() * 0.4,
      expiresAt,
    });
  }
}
