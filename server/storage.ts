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

export async function getAllUsersBasic() {
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
  shippingOption?: string;
  sellerId?: string;
}) {
  const conditions: any[] = [eq(schema.marketplaceListings.status, "active")];

  if (filters.category) {
    conditions.push(eq(schema.marketplaceListings.category, filters.category as any));
  }
  if (filters.condition) {
    conditions.push(eq(schema.marketplaceListings.condition, filters.condition as any));
  }
  if (filters.shippingOption) {
    conditions.push(eq(schema.marketplaceListings.shippingOption, filters.shippingOption as any));
  }
  if (filters.sellerId) {
    conditions.push(eq(schema.marketplaceListings.sellerId, filters.sellerId));
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
    shippingOption: schema.marketplaceListings.shippingOption,
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
    shippingOption: schema.marketplaceListings.shippingOption,
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
  shippingOption?: string;
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
    shippingOption: (data.shippingOption as any) || "pickup_only",
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
  shippingOption: string;
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

export async function sendMessage(data: { senderId: string; receiverId: string; listingId?: string | null; content: string }) {
  const [msg] = await db.insert(schema.messages).values({
    senderId: data.senderId,
    receiverId: data.receiverId,
    listingId: data.listingId ?? null,
    content: data.content,
  }).returning();
  return msg;
}

export async function getConversations(userId: string) {
  const dmRows = await db.execute(sql`
    WITH convos AS (
      SELECT
        CASE WHEN m.sender_id = ${userId} THEN m.receiver_id ELSE m.sender_id END as other_user_id,
        m.listing_id,
        m.content as last_message,
        m.created_at as last_message_at,
        ROW_NUMBER() OVER (
          PARTITION BY
            CASE WHEN m.sender_id = ${userId} THEN m.receiver_id ELSE m.sender_id END,
            m.listing_id
          ORDER BY m.created_at DESC
        ) as rn
      FROM messages m
      WHERE (m.sender_id = ${userId} OR m.receiver_id = ${userId})
      AND m.group_chat_id IS NULL
    )
    SELECT
      c.other_user_id,
      u.username as other_username,
      c.listing_id,
      ml.title as listing_title,
      ml.photos as listing_photos,
      c.last_message,
      c.last_message_at,
      COALESCE(
        (SELECT COUNT(*) FROM messages m2
         WHERE m2.sender_id = c.other_user_id
         AND m2.receiver_id = ${userId}
         AND (m2.listing_id = c.listing_id OR (m2.listing_id IS NULL AND c.listing_id IS NULL))
         AND m2.group_chat_id IS NULL
         AND m2.is_read = false),
        0
      )::int as unread_count
    FROM convos c
    LEFT JOIN users u ON u.id = c.other_user_id
    LEFT JOIN marketplace_listings ml ON ml.id = c.listing_id
    WHERE c.rn = 1
    ORDER BY c.last_message_at DESC
  `);
  const dmResults = (Array.isArray(dmRows) ? dmRows : (dmRows as any).rows ?? []);
  const dmConversations = dmResults.map((r: any) => ({
    otherUserId: r.other_user_id ?? "",
    otherUsername: r.other_username ?? "",
    listingId: r.listing_id,
    listingTitle: r.listing_title,
    listingPhoto: r.listing_photos ? (typeof r.listing_photos === 'string' ? JSON.parse(r.listing_photos) : r.listing_photos)?.[0] ?? null : null,
    lastMessage: r.last_message,
    lastMessageAt: r.last_message_at,
    unreadCount: parseInt(r.unread_count) || 0,
    isGroup: false,
    groupChatId: null,
    groupName: null,
    memberCount: 0,
  }));

  const groupRows = await db.execute(sql`
    WITH group_convos AS (
      SELECT
        m.group_chat_id,
        m.content as last_message,
        m.created_at as last_message_at,
        ROW_NUMBER() OVER (PARTITION BY m.group_chat_id ORDER BY m.created_at DESC) as rn
      FROM messages m
      WHERE m.group_chat_id IN (
        SELECT group_chat_id FROM group_chat_members WHERE user_id = ${userId}
      )
    )
    SELECT
      gc.id as group_chat_id,
      gc.name as group_name,
      COALESCE(gconv.last_message, '') as last_message,
      COALESCE(gconv.last_message_at, gc.created_at) as last_message_at,
      (SELECT COUNT(*)::int FROM group_chat_members WHERE group_chat_id = gc.id) as member_count,
      COALESCE(
        (SELECT COUNT(*)::int FROM messages m2
         WHERE m2.group_chat_id = gc.id
         AND m2.sender_id != ${userId}
         AND m2.created_at > gcm.last_read_at),
        0
      ) as unread_count
    FROM group_chats gc
    INNER JOIN group_chat_members gcm ON gcm.group_chat_id = gc.id AND gcm.user_id = ${userId}
    LEFT JOIN group_convos gconv ON gconv.group_chat_id = gc.id AND gconv.rn = 1
    ORDER BY last_message_at DESC
  `);
  const groupResults = (Array.isArray(groupRows) ? groupRows : (groupRows as any).rows ?? []);
  const groupConversations = groupResults.map((r: any) => ({
    otherUserId: "",
    otherUsername: "",
    listingId: null,
    listingTitle: null,
    listingPhoto: null,
    lastMessage: r.last_message || "",
    lastMessageAt: r.last_message_at,
    unreadCount: parseInt(r.unread_count) || 0,
    isGroup: true,
    groupChatId: r.group_chat_id,
    groupName: r.group_name,
    memberCount: parseInt(r.member_count) || 0,
  }));

  const all = [...dmConversations, ...groupConversations];
  all.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return all;
}

export async function getMessages(userId: string, otherUserId: string, listingId?: string | null) {
  const listingCondition = listingId
    ? sql`AND m.listing_id = ${listingId}`
    : sql`AND m.listing_id IS NULL`;
  const rows = await db.execute(sql`
    SELECT m.*, u.username as sender_username
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE (
      (m.sender_id = ${userId} AND m.receiver_id = ${otherUserId})
      OR (m.sender_id = ${otherUserId} AND m.receiver_id = ${userId})
    ) ${listingCondition}
    ORDER BY m.created_at ASC
    LIMIT 200
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  return resultRows.map((r: any) => ({
    id: r.id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    listingId: r.listing_id,
    content: r.content,
    isRead: r.is_read,
    createdAt: r.created_at,
    senderUsername: r.sender_username,
  }));
}

export async function markMessagesRead(userId: string, otherUserId: string, listingId?: string | null) {
  const listingCondition = listingId
    ? sql`AND listing_id = ${listingId}`
    : sql`AND listing_id IS NULL`;
  await db.execute(sql`
    UPDATE messages
    SET is_read = true
    WHERE sender_id = ${otherUserId}
    AND receiver_id = ${userId}
    ${listingCondition}
    AND is_read = false
  `);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM messages
    WHERE (receiver_id = ${userId} AND is_read = false)
    OR (
      group_chat_id IS NOT NULL
      AND sender_id != ${userId}
      AND is_read = false
      AND group_chat_id IN (SELECT group_chat_id FROM group_chat_members WHERE user_id = ${userId})
    )
  `);
  const resultRows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return resultRows[0]?.count ?? 0;
}

export async function getFriendsWithCars(userId: string) {
  const friends = await getAcceptedFriends(userId);
  if (friends.length === 0) return [];

  const friendIds = friends.map(f => f.friendId);
  const cars = await db.select({
    userId: schema.carProfiles.userId,
    make: schema.carProfiles.make,
    model: schema.carProfiles.model,
    year: schema.carProfiles.year,
    clearanceMode: schema.carProfiles.clearanceMode,
    suspensionType: schema.carProfiles.suspensionType,
    hasFrontLip: schema.carProfiles.hasFrontLip,
    rideHeight: schema.carProfiles.rideHeight,
    wheelSize: schema.carProfiles.wheelSize,
    avatarStyle: schema.carProfiles.avatarStyle,
    avatarColor: schema.carProfiles.avatarColor,
    isDefault: schema.carProfiles.isDefault,
  })
    .from(schema.carProfiles)
    .where(and(
      sql`${schema.carProfiles.userId} IN ${friendIds}`,
      eq(schema.carProfiles.isDefault, true)
    ));

  const carMap = new Map(cars.map(c => [c.userId, c]));

  return friends.map(f => {
    const car = carMap.get(f.friendId);
    return {
      ...f,
      activeCar: car ? {
        make: car.make,
        model: car.model,
        year: car.year,
        clearanceMode: car.clearanceMode,
        suspensionType: car.suspensionType,
        hasFrontLip: car.hasFrontLip,
        rideHeight: car.rideHeight,
        wheelSize: car.wheelSize,
        avatarStyle: car.avatarStyle ?? "sedan",
        avatarColor: car.avatarColor ?? "#F97316",
      } : undefined,
    };
  });
}

export async function createGroupChat(name: string | null, creatorId: string, memberIds: string[]) {
  const [group] = await db.insert(schema.groupChats).values({
    name: name || null,
    creatorId,
  }).returning();

  const allMembers = [creatorId, ...memberIds.filter(id => id !== creatorId)];
  for (const uid of allMembers) {
    await db.insert(schema.groupChatMembers).values({
      groupChatId: group.id,
      userId: uid,
    });
  }

  return group;
}

export async function getGroupChats(userId: string) {
  const result = await db.execute(sql`
    SELECT gc.*, 
      (SELECT COUNT(*)::int FROM group_chat_members WHERE group_chat_id = gc.id) as member_count
    FROM group_chats gc
    INNER JOIN group_chat_members gcm ON gcm.group_chat_id = gc.id
    WHERE gcm.user_id = ${userId}
    ORDER BY gc.created_at DESC
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    creatorId: r.creator_id,
    createdAt: r.created_at,
    memberCount: r.member_count,
  }));
}

export async function getGroupChatById(id: string) {
  const [group] = await db.select().from(schema.groupChats).where(eq(schema.groupChats.id, id));
  if (!group) return null;

  const members = await db.select({
    id: schema.groupChatMembers.id,
    groupChatId: schema.groupChatMembers.groupChatId,
    userId: schema.groupChatMembers.userId,
    joinedAt: schema.groupChatMembers.joinedAt,
    username: schema.users.username,
  })
    .from(schema.groupChatMembers)
    .leftJoin(schema.users, eq(schema.groupChatMembers.userId, schema.users.id))
    .where(eq(schema.groupChatMembers.groupChatId, id));

  return { ...group, members };
}

export async function isGroupChatMember(groupChatId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.groupChatMembers.id })
    .from(schema.groupChatMembers)
    .where(and(
      eq(schema.groupChatMembers.groupChatId, groupChatId),
      eq(schema.groupChatMembers.userId, userId)
    ));
  return !!row;
}

export async function getGroupMessages(groupChatId: string) {
  const result = await db.execute(sql`
    SELECT m.*, u.username as sender_username
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.group_chat_id = ${groupChatId}
    ORDER BY m.created_at ASC
    LIMIT 500
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows.map((r: any) => ({
    id: r.id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    listingId: r.listing_id,
    groupChatId: r.group_chat_id,
    content: r.content,
    isRead: r.is_read,
    createdAt: r.created_at,
    senderUsername: r.sender_username,
  }));
}

export async function sendGroupMessage(senderId: string, groupChatId: string, content: string) {
  const [msg] = await db.insert(schema.messages).values({
    senderId,
    groupChatId,
    content,
  }).returning();
  return msg;
}

export async function addGroupMember(groupChatId: string, userId: string) {
  const existing = await isGroupChatMember(groupChatId, userId);
  if (existing) return null;
  const [member] = await db.insert(schema.groupChatMembers).values({
    groupChatId,
    userId,
  }).returning();
  return member;
}

export async function markGroupMessagesRead(userId: string, groupChatId: string) {
  await db.execute(sql`
    UPDATE group_chat_members
    SET last_read_at = NOW()
    WHERE group_chat_id = ${groupChatId}
    AND user_id = ${userId}
  `);
}

// ===== PASSWORD MANAGEMENT =====

export async function updateUserPassword(userId: string, newPasswordHash: string) {
  await db.update(schema.users)
    .set({ passwordHash: newPasswordHash })
    .where(eq(schema.users.id, userId));
}

export async function createPasswordResetToken(userId: string, token: string) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.execute(sql`UPDATE password_reset_tokens SET used = true WHERE user_id = ${userId} AND used = false`);
  const [row] = await db.insert(schema.passwordResetTokens).values({
    userId,
    token,
    expiresAt,
  }).returning();
  return row;
}

export async function getPasswordResetToken(token: string) {
  const [row] = await db.select().from(schema.passwordResetTokens)
    .where(and(
      eq(schema.passwordResetTokens.token, token),
      eq(schema.passwordResetTokens.used, false),
    ));
  return row || null;
}

export async function markResetTokenUsed(tokenId: string) {
  await db.update(schema.passwordResetTokens)
    .set({ used: true })
    .where(eq(schema.passwordResetTokens.id, tokenId));
}

// ===== ACCOUNT DELETION =====

export async function deleteUserAccount(userId: string) {
  await db.execute(sql`DELETE FROM hazard_votes WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM event_rsvps WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM messages WHERE sender_id = ${userId} OR receiver_id = ${userId}`);
  await db.execute(sql`DELETE FROM group_chat_members WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM friendships WHERE requester_id = ${userId} OR addressee_id = ${userId}`);
  await db.execute(sql`DELETE FROM user_locations WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM saved_routes WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM marketplace_listings WHERE seller_id = ${userId}`);
  await db.execute(sql`DELETE FROM car_profiles WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM promo_redemptions WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM hazards WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM events WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM reports WHERE reporter_id = ${userId}`);
  await db.execute(sql`DELETE FROM reports WHERE target_user_id = ${userId}`);
  await db.execute(sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
}

// ===== REPORTING SYSTEM =====

export async function createReport(data: {
  reporterId: string;
  contentType: string;
  contentId: string;
  targetUserId: string;
  reason: string;
  description?: string;
}) {
  const [report] = await db.execute(sql`
    INSERT INTO reports (reporter_id, content_type, content_id, target_user_id, reason, description)
    VALUES (${data.reporterId}, ${data.contentType}, ${data.contentId}, ${data.targetUserId}, ${data.reason}, ${data.description || null})
    RETURNING *
  `);
  await db.execute(sql`UPDATE users SET report_count = report_count + 1 WHERE id = ${data.targetUserId}`);
  const rows = Array.isArray(report) ? report : (report as any).rows ?? [];
  return rows[0] || report;
}

export async function getReports(status?: string) {
  const validStatuses = ["pending", "reviewed", "resolved", "dismissed"];
  if (status && validStatuses.includes(status)) {
    const result = await db.execute(sql`
      SELECT r.*,
        reporter.username as reporter_username,
        target.username as target_username,
        target.report_count as target_report_count,
        target.status as target_status
      FROM reports r
      LEFT JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN users target ON target.id = r.target_user_id
      WHERE r.status = ${status}
      ORDER BY r.created_at DESC
    `);
    return Array.isArray(result) ? result : (result as any).rows ?? [];
  }
  const result = await db.execute(sql`
    SELECT r.*,
      reporter.username as reporter_username,
      target.username as target_username,
      target.report_count as target_report_count,
      target.status as target_status
    FROM reports r
    LEFT JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN users target ON target.id = r.target_user_id
    ORDER BY r.created_at DESC
  `);
  return Array.isArray(result) ? result : (result as any).rows ?? [];
}

export async function getReportById(id: string) {
  const result = await db.execute(sql`
    SELECT r.*,
      reporter.username as reporter_username,
      target.username as target_username,
      target.report_count as target_report_count,
      target.email as target_email,
      target.status as target_status
    FROM reports r
    LEFT JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN users target ON target.id = r.target_user_id
    WHERE r.id = ${id}
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows[0] || null;
}

export async function updateReportStatus(id: string, status: string, adminId: string, adminNotes?: string) {
  await db.execute(sql`
    UPDATE reports
    SET status = ${status}, resolved_by = ${adminId}, resolved_at = NOW(),
        admin_notes = COALESCE(${adminNotes || null}, admin_notes)
    WHERE id = ${id}
  `);
}

export async function getReportCountForUser(userId: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM reports WHERE target_user_id = ${userId}
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return rows[0]?.count || 0;
}

// ===== ADMIN ACCOUNT MANAGEMENT =====

export async function suspendUser(userId: string) {
  await db.update(schema.users)
    .set({ status: "suspended" as any })
    .where(eq(schema.users.id, userId));
}

export async function unsuspendUser(userId: string) {
  await db.update(schema.users)
    .set({ status: "active" as any })
    .where(eq(schema.users.id, userId));
}

export async function banUser(userId: string) {
  await db.update(schema.users)
    .set({ status: "banned" as any })
    .where(eq(schema.users.id, userId));
}

export async function cancelMembership(userId: string) {
  await db.update(schema.users)
    .set({
      subscriptionTier: "free",
      subscriptionExpiresAt: null,
    })
    .where(eq(schema.users.id, userId));
}

export async function adminDeleteUser(userId: string) {
  await deleteUserAccount(userId);
}

export async function getAllUsers(search?: string) {
  if (search) {
    const result = await db.execute(sql`
      SELECT id, username, email, role, status, report_count, subscription_tier, created_at
      FROM users
      WHERE username ILIKE ${'%' + search + '%'} OR email ILIKE ${'%' + search + '%'}
      ORDER BY created_at DESC
    `);
    return Array.isArray(result) ? result : (result as any).rows ?? [];
  }
  const result = await db.execute(sql`
    SELECT id, username, email, role, status, report_count, subscription_tier, created_at
    FROM users
    ORDER BY created_at DESC
  `);
  return Array.isArray(result) ? result : (result as any).rows ?? [];
}

// ===== DATA EXPORT =====

export async function exportUserData(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;

  const cars = await db.select().from(schema.carProfiles).where(eq(schema.carProfiles.userId, userId));
  const hazardsResult = await db.select().from(schema.hazards).where(eq(schema.hazards.userId, userId));
  const routes = await db.select().from(schema.savedRoutes).where(eq(schema.savedRoutes.userId, userId));
  const listings = await db.select().from(schema.marketplaceListings).where(eq(schema.marketplaceListings.sellerId, userId));
  const msgResult = await db.execute(sql`SELECT * FROM messages WHERE sender_id = ${userId} OR receiver_id = ${userId} ORDER BY created_at DESC`);
  const messages = Array.isArray(msgResult) ? msgResult : (msgResult as any).rows ?? [];
  const friendsResult = await db.execute(sql`
    SELECT f.*, u.username FROM friendships f
    LEFT JOIN users u ON (CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END) = u.id
    WHERE f.requester_id = ${userId} OR f.addressee_id = ${userId}
  `);
  const friends = Array.isArray(friendsResult) ? friendsResult : (friendsResult as any).rows ?? [];

  const { passwordHash, ...safeUser } = user;
  return {
    profile: safeUser,
    carProfiles: cars,
    hazardReports: hazardsResult,
    savedRoutes: routes,
    marketplaceListings: listings,
    messages,
    friends,
    exportedAt: new Date().toISOString(),
  };
}

// ===== PUSH TOKENS =====

export async function updatePushToken(userId: string, pushToken: string | null) {
  await db.update(schema.users)
    .set({ pushToken })
    .where(eq(schema.users.id, userId));
}

export async function getPushTokensForUsers(userIds: string[]) {
  if (userIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT id, push_token FROM users WHERE id = ANY(${userIds}) AND push_token IS NOT NULL
  `);
  return Array.isArray(result) ? result : (result as any).rows ?? [];
}

