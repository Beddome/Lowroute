import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, sql, between, desc, gte } from "drizzle-orm";
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
  photoUrl?: string | null;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [hazard] = await db
    .insert(schema.hazards)
    .values({ ...data, photoUrl: data.photoUrl ?? null, expiresAt })
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

export async function getAllUsers() {
  return db.select({
    id: schema.users.id,
    username: schema.users.username,
    email: schema.users.email,
    reputation: schema.users.reputation,
    role: schema.users.role,
    subscriptionTier: schema.users.subscriptionTier,
    createdAt: schema.users.createdAt,
  }).from(schema.users);
}

export async function updateUserRole(userId: string, role: string) {
  const [user] = await db
    .update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId))
    .returning({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
      reputation: schema.users.reputation,
      role: schema.users.role,
      subscriptionTier: schema.users.subscriptionTier,
      createdAt: schema.users.createdAt,
    });
  return user || null;
}

export async function deleteHazard(hazardId: string) {
  await db.delete(schema.hazardVotes).where(eq(schema.hazardVotes.hazardId, hazardId));
  const [deleted] = await db.delete(schema.hazards).where(eq(schema.hazards.id, hazardId)).returning();
  return deleted || null;
}

export async function getStats() {
  const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
  const [hazardCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.hazards);
  const [eventCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.events);
  const severityCounts = await db
    .select({
      severity: schema.hazards.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.hazards)
    .where(eq(schema.hazards.status, "active"))
    .groupBy(schema.hazards.severity);

  return {
    totalUsers: userCount?.count ?? 0,
    totalHazards: hazardCount?.count ?? 0,
    totalEvents: eventCount?.count ?? 0,
    hazardsBySeverity: severityCounts,
  };
}

export async function getHazardsNearby(lat: number, lng: number, radiusKm: number) {
  const degBuffer = radiusKm / 111;
  return db
    .select()
    .from(schema.hazards)
    .where(
      and(
        between(schema.hazards.lat, lat - degBuffer, lat + degBuffer),
        between(schema.hazards.lng, lng - degBuffer, lng + degBuffer),
        eq(schema.hazards.status, "active")
      )
    );
}

export async function updateSubscriptionTier(userId: string, tier: string, expiresAt?: Date | null) {
  await db
    .update(schema.users)
    .set({ subscriptionTier: tier, subscriptionExpiresAt: expiresAt ?? null })
    .where(eq(schema.users.id, userId));
}

export async function createPromoCode(data: {
  code: string;
  type: string;
  maxUses: number;
  createdBy: string;
  expiresAt?: Date | null;
}) {
  const [promo] = await db.insert(schema.promoCodes).values({
    code: data.code,
    type: data.type,
    maxUses: data.maxUses,
    createdBy: data.createdBy,
    expiresAt: data.expiresAt ?? null,
  }).returning();
  return promo;
}

export async function getPromoCodeByCode(code: string) {
  const [promo] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.code, code.toUpperCase()));
  return promo || null;
}

export async function getAllPromoCodes() {
  return db.select().from(schema.promoCodes).orderBy(schema.promoCodes.createdAt);
}

export async function deactivatePromoCode(id: string) {
  const [promo] = await db.update(schema.promoCodes)
    .set({ isActive: false })
    .where(eq(schema.promoCodes.id, id))
    .returning();
  return promo || null;
}

export async function getUserRedemption(userId: string, promoCodeId: string) {
  const [redemption] = await db.select().from(schema.promoRedemptions)
    .where(and(
      eq(schema.promoRedemptions.userId, userId),
      eq(schema.promoRedemptions.promoCodeId, promoCodeId)
    ));
  return redemption || null;
}

export async function hasUserRedeemedAnyPromo(userId: string): Promise<boolean> {
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.promoRedemptions)
    .where(eq(schema.promoRedemptions.userId, userId));
  return (result?.count ?? 0) > 0;
}

export async function redeemPromoCode(userId: string, promoCodeId: string) {
  await db.insert(schema.promoRedemptions).values({ userId, promoCodeId });
  await db.update(schema.promoCodes)
    .set({ currentUses: sql`${schema.promoCodes.currentUses} + 1` })
    .where(eq(schema.promoCodes.id, promoCodeId));
}

export async function checkAndDowngradeExpiredSubscription(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;
  if (
    user.subscriptionTier === "pro" &&
    user.subscriptionExpiresAt &&
    new Date(user.subscriptionExpiresAt) < new Date()
  ) {
    await db.update(schema.users)
      .set({ subscriptionTier: "free", subscriptionExpiresAt: null })
      .where(eq(schema.users.id, userId));
    return { ...user, subscriptionTier: "free", subscriptionExpiresAt: null };
  }
  return user;
}

export async function seedAdminUser(username: string, passwordHash: string) {
  const existing = await getUserByUsername(username);
  if (existing) return existing;
  const [admin] = await db.insert(schema.users).values({
    username,
    email: `${username}@lowroute.app`,
    passwordHash,
    reputation: 1000,
    role: "admin",
  }).returning();
  return admin;
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

export async function getCarProfilesByUser(userId: string) {
  return db.select().from(schema.carProfiles).where(eq(schema.carProfiles.userId, userId));
}

export async function getDefaultCarProfile(userId: string) {
  const [profile] = await db.select().from(schema.carProfiles)
    .where(and(eq(schema.carProfiles.userId, userId), eq(schema.carProfiles.isDefault, true)));
  return profile || null;
}

export async function getCarProfileById(id: string) {
  const [profile] = await db.select().from(schema.carProfiles).where(eq(schema.carProfiles.id, id));
  return profile || null;
}

export async function createCarProfile(data: {
  userId: string;
  make: string;
  model: string;
  year: number;
  rideHeight?: number | null;
  suspensionType?: string;
  hasFrontLip?: boolean;
  wheelSize?: number | null;
  clearanceMode?: string;
  isDefault?: boolean;
}) {
  if (data.isDefault) {
    await db.update(schema.carProfiles)
      .set({ isDefault: false })
      .where(eq(schema.carProfiles.userId, data.userId));
  }
  const [profile] = await db.insert(schema.carProfiles).values({
    userId: data.userId,
    make: data.make,
    model: data.model,
    year: data.year,
    rideHeight: data.rideHeight ?? null,
    suspensionType: (data.suspensionType as any) || "stock",
    hasFrontLip: data.hasFrontLip ?? false,
    wheelSize: data.wheelSize ?? null,
    clearanceMode: (data.clearanceMode as any) || "normal",
    isDefault: data.isDefault ?? false,
  }).returning();
  return profile;
}

export async function updateCarProfile(id: string, data: Partial<{
  make: string;
  model: string;
  year: number;
  rideHeight: number | null;
  suspensionType: string;
  hasFrontLip: boolean;
  wheelSize: number | null;
  clearanceMode: string;
  isDefault: boolean;
}>) {
  if (data.isDefault) {
    const existing = await getCarProfileById(id);
    if (existing) {
      await db.update(schema.carProfiles)
        .set({ isDefault: false })
        .where(eq(schema.carProfiles.userId, existing.userId));
    }
  }
  const [profile] = await db.update(schema.carProfiles).set(data as any).where(eq(schema.carProfiles.id, id)).returning();
  return profile || null;
}

export async function deleteCarProfile(id: string) {
  const [deleted] = await db.delete(schema.carProfiles).where(eq(schema.carProfiles.id, id)).returning();
  return deleted || null;
}

export async function setDefaultCarProfile(userId: string, profileId: string) {
  await db.update(schema.carProfiles)
    .set({ isDefault: false })
    .where(eq(schema.carProfiles.userId, userId));
  await db.update(schema.carProfiles)
    .set({ isDefault: true })
    .where(and(eq(schema.carProfiles.id, profileId), eq(schema.carProfiles.userId, userId)));
}

export async function getEventsByBbox(minLat: number, maxLat: number, minLng: number, maxLng: number) {
  return db.select({
    id: schema.events.id,
    userId: schema.events.userId,
    title: schema.events.title,
    description: schema.events.description,
    eventType: schema.events.eventType,
    lat: schema.events.lat,
    lng: schema.events.lng,
    date: schema.events.date,
    endDate: schema.events.endDate,
    maxAttendees: schema.events.maxAttendees,
    rsvpCount: schema.events.rsvpCount,
    status: schema.events.status,
    createdAt: schema.events.createdAt,
    creatorUsername: schema.users.username,
  })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.events.userId, schema.users.id))
    .where(
      and(
        between(schema.events.lat, minLat, maxLat),
        between(schema.events.lng, minLng, maxLng),
      )
    );
}

export async function getEventById(id: string) {
  const [event] = await db.select({
    id: schema.events.id,
    userId: schema.events.userId,
    title: schema.events.title,
    description: schema.events.description,
    eventType: schema.events.eventType,
    lat: schema.events.lat,
    lng: schema.events.lng,
    date: schema.events.date,
    endDate: schema.events.endDate,
    maxAttendees: schema.events.maxAttendees,
    rsvpCount: schema.events.rsvpCount,
    status: schema.events.status,
    createdAt: schema.events.createdAt,
    creatorUsername: schema.users.username,
  })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.events.userId, schema.users.id))
    .where(eq(schema.events.id, id));
  return event || null;
}

export async function createEvent(data: {
  userId: string;
  title: string;
  description: string;
  eventType: string;
  lat: number;
  lng: number;
  date: Date;
  endDate?: Date | null;
  maxAttendees?: number | null;
}) {
  const [event] = await db.insert(schema.events).values({
    userId: data.userId,
    title: data.title,
    description: data.description,
    eventType: data.eventType as any,
    lat: data.lat,
    lng: data.lng,
    date: data.date,
    endDate: data.endDate ?? null,
    maxAttendees: data.maxAttendees ?? null,
  }).returning();
  return event;
}

export async function updateEvent(id: string, data: Partial<{
  title: string;
  description: string;
  eventType: string;
  date: Date;
  endDate: Date | null;
  maxAttendees: number | null;
  status: string;
}>) {
  const [event] = await db.update(schema.events).set(data as any).where(eq(schema.events.id, id)).returning();
  return event || null;
}

export async function deleteEvent(id: string) {
  await db.delete(schema.eventRsvps).where(eq(schema.eventRsvps.eventId, id));
  const [deleted] = await db.delete(schema.events).where(eq(schema.events.id, id)).returning();
  return deleted || null;
}

export async function toggleRsvp(userId: string, eventId: string) {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.eventRsvps)
      .where(and(eq(schema.eventRsvps.userId, userId), eq(schema.eventRsvps.eventId, eventId)));

    if (existing) {
      await tx.delete(schema.eventRsvps).where(eq(schema.eventRsvps.id, existing.id));
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
        .from(schema.eventRsvps).where(eq(schema.eventRsvps.eventId, eventId));
      await tx.update(schema.events).set({ rsvpCount: count }).where(eq(schema.events.id, eventId));
      return { rsvped: false };
    } else {
      await tx.insert(schema.eventRsvps).values({ userId, eventId });
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
        .from(schema.eventRsvps).where(eq(schema.eventRsvps.eventId, eventId));
      await tx.update(schema.events).set({ rsvpCount: count }).where(eq(schema.events.id, eventId));
      return { rsvped: true };
    }
  });
}

export async function getUserRsvp(userId: string, eventId: string) {
  const [rsvp] = await db.select().from(schema.eventRsvps)
    .where(and(eq(schema.eventRsvps.userId, userId), eq(schema.eventRsvps.eventId, eventId)));
  return !!rsvp;
}

export async function getUpcomingEvents(limit = 20) {
  return db.select({
    id: schema.events.id,
    userId: schema.events.userId,
    title: schema.events.title,
    description: schema.events.description,
    eventType: schema.events.eventType,
    lat: schema.events.lat,
    lng: schema.events.lng,
    date: schema.events.date,
    endDate: schema.events.endDate,
    maxAttendees: schema.events.maxAttendees,
    rsvpCount: schema.events.rsvpCount,
    status: schema.events.status,
    createdAt: schema.events.createdAt,
    creatorUsername: schema.users.username,
  })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.events.userId, schema.users.id))
    .where(gte(schema.events.date, new Date()))
    .orderBy(schema.events.date)
    .limit(limit);
}

export async function getAllEvents() {
  return db.select({
    id: schema.events.id,
    userId: schema.events.userId,
    title: schema.events.title,
    description: schema.events.description,
    eventType: schema.events.eventType,
    lat: schema.events.lat,
    lng: schema.events.lng,
    date: schema.events.date,
    endDate: schema.events.endDate,
    maxAttendees: schema.events.maxAttendees,
    rsvpCount: schema.events.rsvpCount,
    status: schema.events.status,
    createdAt: schema.events.createdAt,
    creatorUsername: schema.users.username,
  })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.events.userId, schema.users.id))
    .orderBy(desc(schema.events.date));
}
