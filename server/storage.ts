import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, or, sql, between, desc, asc, gte, lte, ilike, ne } from "drizzle-orm";
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

  if (clearCount >= 10) {
    await db.delete(schema.hazardVotes).where(eq(schema.hazardVotes.hazardId, hazardId));
    await db.delete(schema.hazards).where(eq(schema.hazards.id, hazardId));
    return null;
  }

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
    { lat: 49.6942, lng: -112.8183, type: "pothole" as const, severity: 3, title: "Deep Pothole on Mayor Magrath", description: "Large pothole in right lane on Mayor Magrath Dr S near Walmart. Could bottom out low cars." },
    { lat: 49.7054, lng: -112.8427, type: "speed_bump" as const, severity: 4, title: "Extreme Speed Bump on 5th Ave", description: "Unmarked extremely tall speed bump on 5th Ave S near Galt Gardens. Full detour for slammed builds." },
    { lat: 49.6788, lng: -112.8554, type: "construction" as const, severity: 3, title: "Construction on Whoop-Up Dr", description: "Metal plates and loose gravel on Whoop-Up Dr near the bridge. Lane partially blocked." },
    { lat: 49.7121, lng: -112.8095, type: "raised_manhole" as const, severity: 2, title: "Raised Manhole on Stafford Dr", description: "Cover sits 2 inches above road surface on Stafford Dr N. Approach with caution." },
    { lat: 49.6856, lng: -112.7943, type: "railroad_crossing" as const, severity: 2, title: "Rough Crossing on Highway 4", description: "Uneven tracks with significant lip near Highway 4 south. Approach at angle." },
    { lat: 49.6723, lng: -112.8312, type: "flooded_road" as const, severity: 4, title: "Flooded Underpass at Scenic Dr", description: "Standing water of unknown depth under Scenic Dr bridge. Full detour required." },
    { lat: 49.7003, lng: -112.7862, type: "debris" as const, severity: 1, title: "Road Debris on Highway 3", description: "Tire fragments on shoulder of Highway 3 east. Dodgeable, watch left lane." },
    { lat: 49.6951, lng: -112.8682, type: "large_bump_dip" as const, severity: 3, title: "Severe Dip on University Dr", description: "Deep dip at University Dr W bridge approach. Bottom-out risk at speed." },
    { lat: 49.7176, lng: -112.8291, type: "steep_driveway" as const, severity: 2, title: "Steep Entry at North Side Shell", description: "Sharp angle entering the Shell station on 13th St N. Scrape risk." },
    { lat: 49.6891, lng: -112.8147, type: "pothole" as const, severity: 1, title: "Pothole Cluster on McMaster Blvd", description: "Several small potholes in right lane on McMaster Blvd W. Move left to avoid." },
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
  avatarStyle?: string;
  avatarColor?: string;
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
    avatarStyle: data.avatarStyle || "sedan",
    avatarColor: data.avatarColor || "#F97316",
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
  avatarStyle: string;
  avatarColor: string;
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

export async function saveRoute(data: {
  userId: string;
  name: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress?: string | null;
  endAddress?: string | null;
  riskScore: number;
  carProfileId?: string | null;
  routeData?: any;
}) {
  const [route] = await db.insert(schema.savedRoutes).values(data).returning();
  return route;
}

export async function getSavedRoutesByUser(userId: string) {
  return db.select().from(schema.savedRoutes)
    .where(eq(schema.savedRoutes.userId, userId))
    .orderBy(desc(schema.savedRoutes.createdAt));
}

export async function getSavedRouteById(id: string) {
  const [route] = await db.select().from(schema.savedRoutes).where(eq(schema.savedRoutes.id, id));
  return route || null;
}

export async function deleteSavedRoute(id: string) {
  const [deleted] = await db.delete(schema.savedRoutes).where(eq(schema.savedRoutes.id, id)).returning();
  return deleted || null;
}

export async function getSavedRouteByShareToken(token: string) {
  const [route] = await db.select().from(schema.savedRoutes)
    .where(eq(schema.savedRoutes.shareToken, token));
  return route || null;
}

export async function toggleRouteSharing(id: string, userId: string): Promise<{ shareToken: string; isPublic: boolean } | null> {
  const route = await getSavedRouteById(id);
  if (!route || route.userId !== userId) return null;

  if (route.isPublic && route.shareToken) {
    const [updated] = await db.update(schema.savedRoutes)
      .set({ isPublic: false })
      .where(eq(schema.savedRoutes.id, id))
      .returning();
    return { shareToken: updated.shareToken!, isPublic: false };
  }

  const token = route.shareToken || generateShareToken();
  const [updated] = await db.update(schema.savedRoutes)
    .set({ isPublic: true, shareToken: token })
    .where(eq(schema.savedRoutes.id, id))
    .returning();
  return { shareToken: updated.shareToken!, isPublic: true };
}

function generateShareToken(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(12).toString("base64url");
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

export async function searchUsersByUsername(query: string, currentUserId: string) {
  return db.select({
    id: schema.users.id,
    username: schema.users.username,
  })
    .from(schema.users)
    .where(and(
      ilike(schema.users.username, `%${query}%`),
      ne(schema.users.id, currentUserId)
    ))
    .limit(20);
}

export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  const [existing] = await db.select().from(schema.friendships)
    .where(or(
      and(eq(schema.friendships.requesterId, requesterId), eq(schema.friendships.addresseeId, addresseeId)),
      and(eq(schema.friendships.requesterId, addresseeId), eq(schema.friendships.addresseeId, requesterId))
    ));
  if (existing) {
    if (existing.status === "blocked") return null;
    return existing;
  }
  const [friendship] = await db.insert(schema.friendships)
    .values({ requesterId, addresseeId })
    .returning();
  return friendship;
}

export async function getAcceptedFriends(userId: string) {
  const rows = await db.select({
    id: schema.friendships.id,
    requesterId: schema.friendships.requesterId,
    addresseeId: schema.friendships.addresseeId,
  })
    .from(schema.friendships)
    .where(and(
      eq(schema.friendships.status, "accepted"),
      or(
        eq(schema.friendships.requesterId, userId),
        eq(schema.friendships.addresseeId, userId)
      )
    ));

  const friendIds = rows.map(r => r.requesterId === userId ? r.addresseeId : r.requesterId);
  if (friendIds.length === 0) return [];

  const users = await db.select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .where(sql`${schema.users.id} IN ${friendIds}`);

  const userMap = new Map(users.map(u => [u.id, u.username]));
  return rows.map(r => {
    const friendId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    return { id: r.id, friendId, username: userMap.get(friendId) || "Unknown" };
  });
}

export async function getPendingFriendRequests(userId: string) {
  return db.select({
    id: schema.friendships.id,
    requesterId: schema.friendships.requesterId,
    createdAt: schema.friendships.createdAt,
    requesterUsername: schema.users.username,
  })
    .from(schema.friendships)
    .leftJoin(schema.users, eq(schema.friendships.requesterId, schema.users.id))
    .where(and(
      eq(schema.friendships.addresseeId, userId),
      eq(schema.friendships.status, "pending")
    ));
}

export async function getFriendshipById(id: string) {
  const [f] = await db.select().from(schema.friendships).where(eq(schema.friendships.id, id));
  return f || null;
}

export async function acceptFriendRequest(id: string, userId: string) {
  const friendship = await getFriendshipById(id);
  if (!friendship || friendship.addresseeId !== userId || friendship.status !== "pending") return null;
  const [updated] = await db.update(schema.friendships)
    .set({ status: "accepted" })
    .where(eq(schema.friendships.id, id))
    .returning();
  return updated;
}

export async function declineFriendRequest(id: string, userId: string) {
  const friendship = await getFriendshipById(id);
  if (!friendship || friendship.addresseeId !== userId || friendship.status !== "pending") return null;
  const [deleted] = await db.delete(schema.friendships)
    .where(eq(schema.friendships.id, id))
    .returning();
  return deleted;
}

export async function removeFriend(id: string, userId: string) {
  const friendship = await getFriendshipById(id);
  if (!friendship) return null;
  if (friendship.requesterId !== userId && friendship.addresseeId !== userId) return null;
  const [deleted] = await db.delete(schema.friendships)
    .where(eq(schema.friendships.id, id))
    .returning();
  return deleted;
}

export async function updateUserLocation(userId: string, lat: number, lng: number, activeCarId: string | null = null) {
  const [existing] = await db.select().from(schema.userLocations)
    .where(eq(schema.userLocations.userId, userId));
  if (existing) {
    const [updated] = await db.update(schema.userLocations)
      .set({ lat, lng, activeCarId, updatedAt: new Date() })
      .where(eq(schema.userLocations.userId, userId))
      .returning();
    return updated;
  }
  const [created] = await db.insert(schema.userLocations)
    .values({ userId, lat, lng, activeCarId })
    .returning();
  return created;
}

export async function deleteUserLocation(userId: string) {
  await db.delete(schema.userLocations)
    .where(eq(schema.userLocations.userId, userId));
}

export async function updateUserShareLocation(userId: string, shareLocation: boolean) {
  const [updated] = await db.update(schema.users)
    .set({ shareLocation })
    .where(eq(schema.users.id, userId))
    .returning();
  return updated;
}

export async function getFriendsLocations(userId: string) {
  const friends = await getAcceptedFriends(userId);
  if (friends.length === 0) return [];
  const friendIds = friends.map(f => f.friendId);
  const locations = await db.select({
    userId: schema.userLocations.userId,
    lat: schema.userLocations.lat,
    lng: schema.userLocations.lng,
    updatedAt: schema.userLocations.updatedAt,
    username: schema.users.username,
    activeCarId: schema.userLocations.activeCarId,
    carMake: schema.carProfiles.make,
    carModel: schema.carProfiles.model,
    carYear: schema.carProfiles.year,
    carClearanceMode: schema.carProfiles.clearanceMode,
    carSuspensionType: schema.carProfiles.suspensionType,
    carHasFrontLip: schema.carProfiles.hasFrontLip,
    carRideHeight: schema.carProfiles.rideHeight,
    carWheelSize: schema.carProfiles.wheelSize,
    carAvatarStyle: schema.carProfiles.avatarStyle,
    carAvatarColor: schema.carProfiles.avatarColor,
  })
    .from(schema.userLocations)
    .leftJoin(schema.users, eq(schema.userLocations.userId, schema.users.id))
    .leftJoin(schema.carProfiles, eq(schema.userLocations.activeCarId, schema.carProfiles.id))
    .where(sql`${schema.userLocations.userId} IN ${friendIds} AND ${schema.users.shareLocation} = true`);
  return locations.map(loc => ({
    userId: loc.userId,
    lat: loc.lat,
    lng: loc.lng,
    updatedAt: loc.updatedAt,
    username: loc.username,
    activeCar: loc.activeCarId ? {
      make: loc.carMake!,
      model: loc.carModel!,
      year: loc.carYear!,
      clearanceMode: loc.carClearanceMode!,
      suspensionType: loc.carSuspensionType!,
      hasFrontLip: loc.carHasFrontLip!,
      rideHeight: loc.carRideHeight ?? null,
      wheelSize: loc.carWheelSize ?? null,
      avatarStyle: loc.carAvatarStyle!,
      avatarColor: loc.carAvatarColor!,
    } : undefined,
  }));
}

export async function getMarketplaceListings(filters: {
  category?: string;
  condition?: string;
  search?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: string;
}) {
  const conditions: any[] = [eq(schema.marketplaceListings.status, "active")];

  if (filters.category) {
    conditions.push(eq(schema.marketplaceListings.category, filters.category as any));
  }
  if (filters.condition) {
    conditions.push(eq(schema.marketplaceListings.condition, filters.condition as any));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(schema.marketplaceListings.title, `%${filters.search}%`),
        ilike(schema.marketplaceListings.description, `%${filters.search}%`)
      )
    );
  }
  if (filters.priceMin !== undefined) {
    conditions.push(gte(schema.marketplaceListings.price, filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    conditions.push(lte(schema.marketplaceListings.price, filters.priceMax));
  }

  if (filters.lat !== undefined && filters.lng !== undefined && filters.radiusMiles) {
    const radiusKm = filters.radiusMiles * 1.60934;
    const earthRadiusKm = 6371;
    conditions.push(
      sql`(
        ${earthRadiusKm} * acos(
          cos(radians(${filters.lat})) * cos(radians(${schema.marketplaceListings.lat}))
          * cos(radians(${schema.marketplaceListings.lng}) - radians(${filters.lng}))
          + sin(radians(${filters.lat})) * sin(radians(${schema.marketplaceListings.lat}))
        )
      ) <= ${radiusKm}`
    );
  }

  let orderBy;
  switch (filters.sort) {
    case "price_low":
      orderBy = asc(schema.marketplaceListings.price);
      break;
    case "price_high":
      orderBy = desc(schema.marketplaceListings.price);
      break;
    case "nearest":
      if (filters.lat !== undefined && filters.lng !== undefined) {
        orderBy = sql`(
          6371 * acos(
            cos(radians(${filters.lat})) * cos(radians(${schema.marketplaceListings.lat}))
            * cos(radians(${schema.marketplaceListings.lng}) - radians(${filters.lng}))
            + sin(radians(${filters.lat})) * sin(radians(${schema.marketplaceListings.lat}))
          )
        ) ASC`;
      } else {
        orderBy = desc(schema.marketplaceListings.createdAt);
      }
      break;
    default:
      orderBy = desc(schema.marketplaceListings.createdAt);
  }

  const results = await db.select({
    id: schema.marketplaceListings.id,
    sellerId: schema.marketplaceListings.sellerId,
    title: schema.marketplaceListings.title,
    description: schema.marketplaceListings.description,
    price: schema.marketplaceListings.price,
    category: schema.marketplaceListings.category,
    condition: schema.marketplaceListings.condition,
    lat: schema.marketplaceListings.lat,
    lng: schema.marketplaceListings.lng,
    city: schema.marketplaceListings.city,
    photos: schema.marketplaceListings.photos,
    status: schema.marketplaceListings.status,
    createdAt: schema.marketplaceListings.createdAt,
    sellerUsername: schema.users.username,
  })
    .from(schema.marketplaceListings)
    .leftJoin(schema.users, eq(schema.marketplaceListings.sellerId, schema.users.id))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(50);

  return results;
}

export async function getMarketplaceListingById(id: string) {
  const [listing] = await db.select({
    id: schema.marketplaceListings.id,
    sellerId: schema.marketplaceListings.sellerId,
    title: schema.marketplaceListings.title,
    description: schema.marketplaceListings.description,
    price: schema.marketplaceListings.price,
    category: schema.marketplaceListings.category,
    condition: schema.marketplaceListings.condition,
    lat: schema.marketplaceListings.lat,
    lng: schema.marketplaceListings.lng,
    city: schema.marketplaceListings.city,
    photos: schema.marketplaceListings.photos,
    status: schema.marketplaceListings.status,
    createdAt: schema.marketplaceListings.createdAt,
    sellerUsername: schema.users.username,
  })
    .from(schema.marketplaceListings)
    .leftJoin(schema.users, eq(schema.marketplaceListings.sellerId, schema.users.id))
    .where(eq(schema.marketplaceListings.id, id));
  return listing || null;
}

export async function createMarketplaceListing(data: {
  sellerId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  lat: number;
  lng: number;
  city?: string | null;
  photos?: string[];
}) {
  const [listing] = await db.insert(schema.marketplaceListings).values({
    sellerId: data.sellerId,
    title: data.title,
    description: data.description,
    price: data.price,
    category: data.category as any,
    condition: data.condition as any,
    lat: data.lat,
    lng: data.lng,
    city: data.city ?? null,
    photos: data.photos ?? [],
  }).returning();
  return listing;
}

export async function updateMarketplaceListing(id: string, data: Partial<{
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  lat: number;
  lng: number;
  city: string | null;
  photos: string[];
  status: string;
}>) {
  const [listing] = await db.update(schema.marketplaceListings)
    .set(data as any)
    .where(eq(schema.marketplaceListings.id, id))
    .returning();
  return listing || null;
}

export async function deleteMarketplaceListing(id: string) {
  const [deleted] = await db.delete(schema.marketplaceListings)
    .where(eq(schema.marketplaceListings.id, id))
    .returning();
  return deleted || null;
}
