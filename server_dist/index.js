"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/index.ts
var import_express = __toESM(require("express"));

// server/routes.ts
var import_node_http = require("node:http");
var import_express_session = __toESM(require("express-session"));
var import_connect_pg_simple = __toESM(require("connect-pg-simple"));
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_pg2 = require("pg");
var import_multer = __toESM(require("multer"));
var import_node_path = __toESM(require("node:path"));
var import_node_fs = __toESM(require("node:fs"));

// server/storage.ts
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = require("pg");
var import_drizzle_orm2 = require("drizzle-orm");

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  CLEARANCE_MODES: () => CLEARANCE_MODES,
  EVENT_TYPES: () => EVENT_TYPES,
  HAZARD_TYPES: () => HAZARD_TYPES,
  SEVERITY_TIERS: () => SEVERITY_TIERS,
  SUSPENSION_TYPES: () => SUSPENSION_TYPES,
  carProfiles: () => carProfiles,
  clearanceModeEnum: () => clearanceModeEnum,
  eventRsvps: () => eventRsvps,
  eventTypeEnum: () => eventTypeEnum,
  events: () => events,
  hazardStatusEnum: () => hazardStatusEnum,
  hazardTypeEnum: () => hazardTypeEnum,
  hazardVotes: () => hazardVotes,
  hazards: () => hazards,
  insertHazardSchema: () => insertHazardSchema,
  insertUserSchema: () => insertUserSchema,
  promoCodes: () => promoCodes,
  promoRedemptions: () => promoRedemptions,
  savedRoutes: () => savedRoutes,
  suspensionTypeEnum: () => suspensionTypeEnum,
  users: () => users,
  voteTypeEnum: () => voteTypeEnum
});
var import_drizzle_orm = require("drizzle-orm");
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_zod = require("drizzle-zod");
var hazardTypeEnum = (0, import_pg_core.pgEnum)("hazard_type", [
  "pothole",
  "speed_bump",
  "construction",
  "large_bump_dip",
  "raised_manhole",
  "railroad_crossing",
  "debris",
  "steep_driveway",
  "flooded_road",
  "other"
]);
var hazardStatusEnum = (0, import_pg_core.pgEnum)("hazard_status", ["active", "cleared"]);
var voteTypeEnum = (0, import_pg_core.pgEnum)("vote_type", ["confirm", "downvote", "clear"]);
var suspensionTypeEnum = (0, import_pg_core.pgEnum)("suspension_type", [
  "stock",
  "lowered",
  "coilovers",
  "air_ride",
  "bagged"
]);
var clearanceModeEnum = (0, import_pg_core.pgEnum)("clearance_mode", [
  "normal",
  "lowered",
  "very_lowered",
  "show_car"
]);
var eventTypeEnum = (0, import_pg_core.pgEnum)("event_type", [
  "car_meet",
  "show_and_shine",
  "cruise",
  "photo_spot",
  "shop_garage",
  "warning"
]);
var users = (0, import_pg_core.pgTable)("users", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  username: (0, import_pg_core.text)("username").notNull().unique(),
  email: (0, import_pg_core.text)("email").notNull().unique(),
  passwordHash: (0, import_pg_core.text)("password_hash").notNull(),
  reputation: (0, import_pg_core.integer)("reputation").notNull().default(0),
  role: (0, import_pg_core.text)("role").notNull().default("user"),
  subscriptionTier: (0, import_pg_core.text)("subscription_tier").notNull().default("free"),
  subscriptionExpiresAt: (0, import_pg_core.timestamp)("subscription_expires_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var hazards = (0, import_pg_core.pgTable)("hazards", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  lat: (0, import_pg_core.real)("lat").notNull(),
  lng: (0, import_pg_core.real)("lng").notNull(),
  type: hazardTypeEnum("type").notNull(),
  severity: (0, import_pg_core.integer)("severity").notNull(),
  title: (0, import_pg_core.text)("title").notNull(),
  description: (0, import_pg_core.text)("description").notNull(),
  status: hazardStatusEnum("status").notNull().default("active"),
  upvotes: (0, import_pg_core.integer)("upvotes").notNull().default(0),
  downvotes: (0, import_pg_core.integer)("downvotes").notNull().default(0),
  confidenceScore: (0, import_pg_core.real)("confidence_score").notNull().default(0.5),
  photoUrl: (0, import_pg_core.text)("photo_url"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow(),
  expiresAt: (0, import_pg_core.timestamp)("expires_at")
});
var hazardVotes = (0, import_pg_core.pgTable)("hazard_votes", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  hazardId: (0, import_pg_core.varchar)("hazard_id").references(() => hazards.id).notNull(),
  voteType: voteTypeEnum("vote_type").notNull(),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var promoCodes = (0, import_pg_core.pgTable)("promo_codes", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  code: (0, import_pg_core.text)("code").notNull().unique(),
  type: (0, import_pg_core.text)("type").notNull(),
  maxUses: (0, import_pg_core.integer)("max_uses").notNull().default(1),
  currentUses: (0, import_pg_core.integer)("current_uses").notNull().default(0),
  createdBy: (0, import_pg_core.varchar)("created_by").references(() => users.id).notNull(),
  expiresAt: (0, import_pg_core.timestamp)("expires_at"),
  isActive: (0, import_pg_core.boolean)("is_active").notNull().default(true),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var promoRedemptions = (0, import_pg_core.pgTable)("promo_redemptions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  promoCodeId: (0, import_pg_core.varchar)("promo_code_id").references(() => promoCodes.id).notNull(),
  redeemedAt: (0, import_pg_core.timestamp)("redeemed_at").notNull().defaultNow()
});
var carProfiles = (0, import_pg_core.pgTable)("car_profiles", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  make: (0, import_pg_core.text)("make").notNull(),
  model: (0, import_pg_core.text)("model").notNull(),
  year: (0, import_pg_core.integer)("year").notNull(),
  rideHeight: (0, import_pg_core.real)("ride_height"),
  suspensionType: suspensionTypeEnum("suspension_type").notNull().default("stock"),
  hasFrontLip: (0, import_pg_core.boolean)("has_front_lip").notNull().default(false),
  wheelSize: (0, import_pg_core.integer)("wheel_size"),
  clearanceMode: clearanceModeEnum("clearance_mode").notNull().default("normal"),
  isDefault: (0, import_pg_core.boolean)("is_default").notNull().default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var events = (0, import_pg_core.pgTable)("events", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  title: (0, import_pg_core.text)("title").notNull(),
  description: (0, import_pg_core.text)("description").notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  lat: (0, import_pg_core.real)("lat").notNull(),
  lng: (0, import_pg_core.real)("lng").notNull(),
  date: (0, import_pg_core.timestamp)("date").notNull(),
  endDate: (0, import_pg_core.timestamp)("end_date"),
  maxAttendees: (0, import_pg_core.integer)("max_attendees"),
  rsvpCount: (0, import_pg_core.integer)("rsvp_count").notNull().default(0),
  status: (0, import_pg_core.text)("status").notNull().default("upcoming"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var eventRsvps = (0, import_pg_core.pgTable)("event_rsvps", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  eventId: (0, import_pg_core.varchar)("event_id").references(() => events.id).notNull(),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var savedRoutes = (0, import_pg_core.pgTable)("saved_routes", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id).notNull(),
  name: (0, import_pg_core.text)("name").notNull(),
  startLat: (0, import_pg_core.doublePrecision)("start_lat").notNull(),
  startLng: (0, import_pg_core.doublePrecision)("start_lng").notNull(),
  endLat: (0, import_pg_core.doublePrecision)("end_lat").notNull(),
  endLng: (0, import_pg_core.doublePrecision)("end_lng").notNull(),
  startAddress: (0, import_pg_core.text)("start_address"),
  endAddress: (0, import_pg_core.text)("end_address"),
  riskScore: (0, import_pg_core.integer)("risk_score").notNull().default(0),
  carProfileId: (0, import_pg_core.varchar)("car_profile_id").references(() => carProfiles.id),
  routeData: (0, import_pg_core.jsonb)("route_data"),
  createdAt: (0, import_pg_core.timestamp)("created_at").notNull().defaultNow()
});
var insertUserSchema = (0, import_drizzle_zod.createInsertSchema)(users).pick({
  username: true,
  email: true,
  passwordHash: true
});
var insertHazardSchema = (0, import_drizzle_zod.createInsertSchema)(hazards).pick({
  userId: true,
  lat: true,
  lng: true,
  type: true,
  severity: true,
  title: true,
  description: true
});
var HAZARD_TYPES = [
  { value: "pothole", label: "Pothole" },
  { value: "speed_bump", label: "Speed Bump" },
  { value: "construction", label: "Construction Zone" },
  { value: "large_bump_dip", label: "Large Bump / Dip" },
  { value: "raised_manhole", label: "Raised Manhole" },
  { value: "railroad_crossing", label: "Railroad Crossing" },
  { value: "debris", label: "Debris in Road" },
  { value: "steep_driveway", label: "Steep Driveway Angle" },
  { value: "flooded_road", label: "Flooded Road" },
  { value: "other", label: "Other" }
];
var SEVERITY_TIERS = [
  {
    tier: 1,
    label: "Minor",
    description: "Dodgeable obstacle",
    color: "#22C55E",
    bg: "#052e16",
    detail: "Small pothole, small debris. Driver can usually avoid or slow down."
  },
  {
    tier: 2,
    label: "Caution",
    description: "Scrape risk",
    color: "#EAB308",
    bg: "#422006",
    detail: "Moderate bump, bad dip, rough crossing. Slow down significantly."
  },
  {
    tier: 3,
    label: "Major",
    description: "Detour recommended",
    color: "#F97316",
    bg: "#431407",
    detail: "Severe pothole, deep dip, blocking construction. Strong warning."
  },
  {
    tier: 4,
    label: "No-Go",
    description: "Full detour required",
    color: "#EF4444",
    bg: "#450a0a",
    detail: "Road inaccessible for low vehicles. Routing will avoid this road."
  }
];
var EVENT_TYPES = [
  { value: "car_meet", label: "Car Meet", icon: "people" },
  { value: "show_and_shine", label: "Show & Shine", icon: "trophy" },
  { value: "cruise", label: "Cruise", icon: "car-sport" },
  { value: "photo_spot", label: "Photo Spot", icon: "camera" },
  { value: "shop_garage", label: "Shop / Garage", icon: "build" },
  { value: "warning", label: "Road Warning", icon: "warning" }
];
var SUSPENSION_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "lowered", label: "Lowered Springs" },
  { value: "coilovers", label: "Coilovers" },
  { value: "air_ride", label: "Air Ride" },
  { value: "bagged", label: "Bagged" }
];
var CLEARANCE_MODES = [
  { value: "normal", label: "Normal", riskMultiplier: 1 },
  { value: "lowered", label: "Lowered", riskMultiplier: 1.3 },
  { value: "very_lowered", label: "Very Lowered", riskMultiplier: 1.6 },
  { value: "show_car", label: "Show Car", riskMultiplier: 2 }
];

// server/storage.ts
var pool = new import_pg.Pool({ connectionString: process.env.DATABASE_URL });
var db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });
async function getUserById(id) {
  const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.id, id));
  return user || null;
}
async function getUserByUsername(username) {
  const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.username, username));
  return user || null;
}
async function getUserByEmail(email) {
  const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.email, email));
  return user || null;
}
async function createUser(data) {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}
async function updateUserReputation(userId, delta) {
  await db.update(users).set({ reputation: import_drizzle_orm2.sql`${users.reputation} + ${delta}` }).where((0, import_drizzle_orm2.eq)(users.id, userId));
}
async function getHazardsByBbox(minLat, maxLat, minLng, maxLng) {
  return db.select().from(hazards).where(
    (0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.between)(hazards.lat, minLat, maxLat),
      (0, import_drizzle_orm2.between)(hazards.lng, minLng, maxLng),
      (0, import_drizzle_orm2.eq)(hazards.status, "active")
    )
  );
}
async function getHazardById(id) {
  const [hazard] = await db.select().from(hazards).where((0, import_drizzle_orm2.eq)(hazards.id, id));
  return hazard || null;
}
async function createHazard(data) {
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3);
  const [hazard] = await db.insert(hazards).values({ ...data, photoUrl: data.photoUrl ?? null, expiresAt }).returning();
  return hazard;
}
async function getUserVoteForHazard(userId, hazardId) {
  const [vote] = await db.select().from(hazardVotes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(hazardVotes.userId, userId), (0, import_drizzle_orm2.eq)(hazardVotes.hazardId, hazardId)));
  return vote || null;
}
async function voteOnHazard(userId, hazardId, voteType) {
  const existing = await getUserVoteForHazard(userId, hazardId);
  if (existing) {
    await db.update(hazardVotes).set({ voteType }).where((0, import_drizzle_orm2.eq)(hazardVotes.id, existing.id));
  } else {
    await db.insert(hazardVotes).values({ userId, hazardId, voteType });
  }
  const [confirms] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(hazardVotes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(hazardVotes.hazardId, hazardId), (0, import_drizzle_orm2.eq)(hazardVotes.voteType, "confirm")));
  const [downvotes] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(hazardVotes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(hazardVotes.hazardId, hazardId), (0, import_drizzle_orm2.eq)(hazardVotes.voteType, "downvote")));
  const [clears] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(hazardVotes).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(hazardVotes.hazardId, hazardId), (0, import_drizzle_orm2.eq)(hazardVotes.voteType, "clear")));
  const confirmCount = confirms?.count ?? 0;
  const downvoteCount = downvotes?.count ?? 0;
  const clearCount = clears?.count ?? 0;
  const total = confirmCount + downvoteCount + clearCount + 1;
  const confidence = Math.min(1, (confirmCount + 1) / total);
  const status = clearCount >= 3 ? "cleared" : "active";
  await db.update(hazards).set({ upvotes: confirmCount, downvotes: downvoteCount, confidenceScore: confidence, status }).where((0, import_drizzle_orm2.eq)(hazards.id, hazardId));
  return getHazardById(hazardId);
}
async function getAllActiveHazards() {
  return db.select().from(hazards).where((0, import_drizzle_orm2.eq)(hazards.status, "active"));
}
async function getAllUsers() {
  return db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    reputation: users.reputation,
    role: users.role,
    subscriptionTier: users.subscriptionTier,
    createdAt: users.createdAt
  }).from(users);
}
async function updateUserRole(userId, role) {
  const [user] = await db.update(users).set({ role }).where((0, import_drizzle_orm2.eq)(users.id, userId)).returning({
    id: users.id,
    username: users.username,
    email: users.email,
    reputation: users.reputation,
    role: users.role,
    subscriptionTier: users.subscriptionTier,
    createdAt: users.createdAt
  });
  return user || null;
}
async function deleteHazard(hazardId) {
  await db.delete(hazardVotes).where((0, import_drizzle_orm2.eq)(hazardVotes.hazardId, hazardId));
  const [deleted] = await db.delete(hazards).where((0, import_drizzle_orm2.eq)(hazards.id, hazardId)).returning();
  return deleted || null;
}
async function getStats() {
  const [userCount] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(users);
  const [hazardCount] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(hazards);
  const [eventCount] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(events);
  const severityCounts = await db.select({
    severity: hazards.severity,
    count: import_drizzle_orm2.sql`count(*)::int`
  }).from(hazards).where((0, import_drizzle_orm2.eq)(hazards.status, "active")).groupBy(hazards.severity);
  return {
    totalUsers: userCount?.count ?? 0,
    totalHazards: hazardCount?.count ?? 0,
    totalEvents: eventCount?.count ?? 0,
    hazardsBySeverity: severityCounts
  };
}
async function getHazardsNearby(lat, lng, radiusKm) {
  const degBuffer = radiusKm / 111;
  return db.select().from(hazards).where(
    (0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.between)(hazards.lat, lat - degBuffer, lat + degBuffer),
      (0, import_drizzle_orm2.between)(hazards.lng, lng - degBuffer, lng + degBuffer),
      (0, import_drizzle_orm2.eq)(hazards.status, "active")
    )
  );
}
async function updateSubscriptionTier(userId, tier, expiresAt) {
  await db.update(users).set({ subscriptionTier: tier, subscriptionExpiresAt: expiresAt ?? null }).where((0, import_drizzle_orm2.eq)(users.id, userId));
}
async function createPromoCode(data) {
  const [promo] = await db.insert(promoCodes).values({
    code: data.code,
    type: data.type,
    maxUses: data.maxUses,
    createdBy: data.createdBy,
    expiresAt: data.expiresAt ?? null
  }).returning();
  return promo;
}
async function getPromoCodeByCode(code) {
  const [promo] = await db.select().from(promoCodes).where((0, import_drizzle_orm2.eq)(promoCodes.code, code.toUpperCase()));
  return promo || null;
}
async function getAllPromoCodes() {
  return db.select().from(promoCodes).orderBy(promoCodes.createdAt);
}
async function deactivatePromoCode(id) {
  const [promo] = await db.update(promoCodes).set({ isActive: false }).where((0, import_drizzle_orm2.eq)(promoCodes.id, id)).returning();
  return promo || null;
}
async function hasUserRedeemedAnyPromo(userId) {
  const [result] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(promoRedemptions).where((0, import_drizzle_orm2.eq)(promoRedemptions.userId, userId));
  return (result?.count ?? 0) > 0;
}
async function redeemPromoCode(userId, promoCodeId) {
  await db.insert(promoRedemptions).values({ userId, promoCodeId });
  await db.update(promoCodes).set({ currentUses: import_drizzle_orm2.sql`${promoCodes.currentUses} + 1` }).where((0, import_drizzle_orm2.eq)(promoCodes.id, promoCodeId));
}
async function checkAndDowngradeExpiredSubscription(userId) {
  const user = await getUserById(userId);
  if (!user) return null;
  if (user.subscriptionTier === "pro" && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < /* @__PURE__ */ new Date()) {
    await db.update(users).set({ subscriptionTier: "free", subscriptionExpiresAt: null }).where((0, import_drizzle_orm2.eq)(users.id, userId));
    return { ...user, subscriptionTier: "free", subscriptionExpiresAt: null };
  }
  return user;
}
async function seedAdminUser(username, passwordHash) {
  const existing = await getUserByUsername(username);
  if (existing) return existing;
  const [admin] = await db.insert(users).values({
    username,
    email: `${username}@lowroute.app`,
    passwordHash,
    reputation: 1e3,
    role: "admin"
  }).returning();
  return admin;
}
async function seedDemoHazards() {
  const [count] = await db.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(hazards);
  if ((count?.count ?? 0) > 0) return;
  const demoUserId = "demo-user-seed";
  await db.insert(users).values({
    id: demoUserId,
    username: "community_bot",
    email: "bot@lowroute.app",
    passwordHash: "seeded",
    reputation: 500
  }).onConflictDoNothing();
  const sampleHazards = [
    { lat: 34.0522, lng: -118.2437, type: "pothole", severity: 3, title: "Deep Pothole", description: "Large pothole in right lane. Could bottom out low cars." },
    { lat: 34.0532, lng: -118.2457, type: "speed_bump", severity: 4, title: "Extreme Speed Bump", description: "Unmarked extremely tall speed bump. Full detour for slammed builds." },
    { lat: 34.0512, lng: -118.2417, type: "construction", severity: 3, title: "Construction Zone", description: "Metal plates and loose gravel. Lane partially blocked." },
    { lat: 34.0542, lng: -118.2477, type: "raised_manhole", severity: 2, title: "Raised Manhole", description: "Cover sits 2 inches above road surface. Approach with caution." },
    { lat: 34.0502, lng: -118.2397, type: "railroad_crossing", severity: 2, title: "Rough Railroad Crossing", description: "Uneven tracks with significant lip. Approach at angle." },
    { lat: 34.0562, lng: -118.2497, type: "flooded_road", severity: 4, title: "Flooded Underpass", description: "Standing water of unknown depth. Full detour required." },
    { lat: 34.0488, lng: -118.238, type: "debris", severity: 1, title: "Road Debris", description: "Tire fragments on shoulder. Dodgeable, watch left lane." },
    { lat: 34.0575, lng: -118.251, type: "large_bump_dip", severity: 3, title: "Severe Road Dip", description: "Deep dip at bridge approach. Bottom-out risk at speed." },
    { lat: 34.0498, lng: -118.247, type: "steep_driveway", severity: 2, title: "Steep Entry Angle", description: "Sharp angle entering the gas station. Scrape risk." },
    { lat: 34.0518, lng: -118.249, type: "pothole", severity: 1, title: "Small Pothole Cluster", description: "Several small potholes in right lane. Move left to avoid." }
  ];
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
  for (const h of sampleHazards) {
    await db.insert(hazards).values({
      userId: demoUserId,
      ...h,
      status: "active",
      upvotes: Math.floor(Math.random() * 20) + 1,
      confidenceScore: 0.6 + Math.random() * 0.4,
      expiresAt
    });
  }
}
async function getCarProfilesByUser(userId) {
  return db.select().from(carProfiles).where((0, import_drizzle_orm2.eq)(carProfiles.userId, userId));
}
async function getCarProfileById(id) {
  const [profile] = await db.select().from(carProfiles).where((0, import_drizzle_orm2.eq)(carProfiles.id, id));
  return profile || null;
}
async function createCarProfile(data) {
  if (data.isDefault) {
    await db.update(carProfiles).set({ isDefault: false }).where((0, import_drizzle_orm2.eq)(carProfiles.userId, data.userId));
  }
  const [profile] = await db.insert(carProfiles).values({
    userId: data.userId,
    make: data.make,
    model: data.model,
    year: data.year,
    rideHeight: data.rideHeight ?? null,
    suspensionType: data.suspensionType || "stock",
    hasFrontLip: data.hasFrontLip ?? false,
    wheelSize: data.wheelSize ?? null,
    clearanceMode: data.clearanceMode || "normal",
    isDefault: data.isDefault ?? false
  }).returning();
  return profile;
}
async function updateCarProfile(id, data) {
  if (data.isDefault) {
    const existing = await getCarProfileById(id);
    if (existing) {
      await db.update(carProfiles).set({ isDefault: false }).where((0, import_drizzle_orm2.eq)(carProfiles.userId, existing.userId));
    }
  }
  const [profile] = await db.update(carProfiles).set(data).where((0, import_drizzle_orm2.eq)(carProfiles.id, id)).returning();
  return profile || null;
}
async function deleteCarProfile(id) {
  const [deleted] = await db.delete(carProfiles).where((0, import_drizzle_orm2.eq)(carProfiles.id, id)).returning();
  return deleted || null;
}
async function setDefaultCarProfile(userId, profileId) {
  await db.update(carProfiles).set({ isDefault: false }).where((0, import_drizzle_orm2.eq)(carProfiles.userId, userId));
  await db.update(carProfiles).set({ isDefault: true }).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(carProfiles.id, profileId), (0, import_drizzle_orm2.eq)(carProfiles.userId, userId)));
}
async function getEventsByBbox(minLat, maxLat, minLng, maxLng) {
  return db.select({
    id: events.id,
    userId: events.userId,
    title: events.title,
    description: events.description,
    eventType: events.eventType,
    lat: events.lat,
    lng: events.lng,
    date: events.date,
    endDate: events.endDate,
    maxAttendees: events.maxAttendees,
    rsvpCount: events.rsvpCount,
    status: events.status,
    createdAt: events.createdAt,
    creatorUsername: users.username
  }).from(events).leftJoin(users, (0, import_drizzle_orm2.eq)(events.userId, users.id)).where(
    (0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.between)(events.lat, minLat, maxLat),
      (0, import_drizzle_orm2.between)(events.lng, minLng, maxLng)
    )
  );
}
async function getEventById(id) {
  const [event] = await db.select({
    id: events.id,
    userId: events.userId,
    title: events.title,
    description: events.description,
    eventType: events.eventType,
    lat: events.lat,
    lng: events.lng,
    date: events.date,
    endDate: events.endDate,
    maxAttendees: events.maxAttendees,
    rsvpCount: events.rsvpCount,
    status: events.status,
    createdAt: events.createdAt,
    creatorUsername: users.username
  }).from(events).leftJoin(users, (0, import_drizzle_orm2.eq)(events.userId, users.id)).where((0, import_drizzle_orm2.eq)(events.id, id));
  return event || null;
}
async function createEvent(data) {
  const [event] = await db.insert(events).values({
    userId: data.userId,
    title: data.title,
    description: data.description,
    eventType: data.eventType,
    lat: data.lat,
    lng: data.lng,
    date: data.date,
    endDate: data.endDate ?? null,
    maxAttendees: data.maxAttendees ?? null
  }).returning();
  return event;
}
async function updateEvent(id, data) {
  const [event] = await db.update(events).set(data).where((0, import_drizzle_orm2.eq)(events.id, id)).returning();
  return event || null;
}
async function deleteEvent(id) {
  await db.delete(eventRsvps).where((0, import_drizzle_orm2.eq)(eventRsvps.eventId, id));
  const [deleted] = await db.delete(events).where((0, import_drizzle_orm2.eq)(events.id, id)).returning();
  return deleted || null;
}
async function toggleRsvp(userId, eventId) {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(eventRsvps).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(eventRsvps.userId, userId), (0, import_drizzle_orm2.eq)(eventRsvps.eventId, eventId)));
    if (existing) {
      await tx.delete(eventRsvps).where((0, import_drizzle_orm2.eq)(eventRsvps.id, existing.id));
      const [{ count }] = await tx.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(eventRsvps).where((0, import_drizzle_orm2.eq)(eventRsvps.eventId, eventId));
      await tx.update(events).set({ rsvpCount: count }).where((0, import_drizzle_orm2.eq)(events.id, eventId));
      return { rsvped: false };
    } else {
      await tx.insert(eventRsvps).values({ userId, eventId });
      const [{ count }] = await tx.select({ count: import_drizzle_orm2.sql`count(*)::int` }).from(eventRsvps).where((0, import_drizzle_orm2.eq)(eventRsvps.eventId, eventId));
      await tx.update(events).set({ rsvpCount: count }).where((0, import_drizzle_orm2.eq)(events.id, eventId));
      return { rsvped: true };
    }
  });
}
async function getUserRsvp(userId, eventId) {
  const [rsvp] = await db.select().from(eventRsvps).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(eventRsvps.userId, userId), (0, import_drizzle_orm2.eq)(eventRsvps.eventId, eventId)));
  return !!rsvp;
}
async function getUpcomingEvents(limit = 20) {
  return db.select({
    id: events.id,
    userId: events.userId,
    title: events.title,
    description: events.description,
    eventType: events.eventType,
    lat: events.lat,
    lng: events.lng,
    date: events.date,
    endDate: events.endDate,
    maxAttendees: events.maxAttendees,
    rsvpCount: events.rsvpCount,
    status: events.status,
    createdAt: events.createdAt,
    creatorUsername: users.username
  }).from(events).leftJoin(users, (0, import_drizzle_orm2.eq)(events.userId, users.id)).where((0, import_drizzle_orm2.gte)(events.date, /* @__PURE__ */ new Date())).orderBy(events.date).limit(limit);
}
async function saveRoute(data) {
  const [route] = await db.insert(savedRoutes).values(data).returning();
  return route;
}
async function getSavedRoutesByUser(userId) {
  return db.select().from(savedRoutes).where((0, import_drizzle_orm2.eq)(savedRoutes.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(savedRoutes.createdAt));
}
async function getSavedRouteById(id) {
  const [route] = await db.select().from(savedRoutes).where((0, import_drizzle_orm2.eq)(savedRoutes.id, id));
  return route || null;
}
async function deleteSavedRoute(id) {
  const [deleted] = await db.delete(savedRoutes).where((0, import_drizzle_orm2.eq)(savedRoutes.id, id)).returning();
  return deleted || null;
}
async function getAllEvents() {
  return db.select({
    id: events.id,
    userId: events.userId,
    title: events.title,
    description: events.description,
    eventType: events.eventType,
    lat: events.lat,
    lng: events.lng,
    date: events.date,
    endDate: events.endDate,
    maxAttendees: events.maxAttendees,
    rsvpCount: events.rsvpCount,
    status: events.status,
    createdAt: events.createdAt,
    creatorUsername: users.username
  }).from(events).leftJoin(users, (0, import_drizzle_orm2.eq)(events.userId, users.id)).orderBy((0, import_drizzle_orm2.desc)(events.date));
}

// server/timezone.ts
function parseDateEndOfDayMST(dateStr) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const endOfDayMST = /* @__PURE__ */ new Date(`${y}-${m}-${d}T23:59:59-07:00`);
  if (isNaN(endOfDayMST.getTime())) return null;
  return endOfDayMST;
}

// server/routes.ts
var loginAttempts = /* @__PURE__ */ new Map();
var RATE_LIMIT_MAX = 10;
var RATE_LIMIT_WINDOW_MS = 15 * 60 * 1e3;
function checkRateLimit(key) {
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
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx2 = px - ax;
    const ddy2 = py - ay;
    return Math.sqrt(ddx2 * ddx2 + ddy2 * ddy2);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}
var pool2 = new import_pg2.Pool({ connectionString: process.env.DATABASE_URL });
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}
async function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await getUserById(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}
function calculateRouteRisk(hazards2, riskMultiplier = 1) {
  const SEVERITY_PENALTIES = [0, 5, 20, 100, 1e3];
  let score = 0;
  const counts = [0, 0, 0, 0, 0];
  for (const h of hazards2) {
    if (h.confidenceScore < 0.4) continue;
    const tier = Math.max(1, Math.min(4, h.severity));
    score += Math.round(SEVERITY_PENALTIES[tier] * riskMultiplier);
    counts[tier]++;
  }
  const highestTier = counts[4] > 0 ? 4 : counts[3] > 0 ? 3 : counts[2] > 0 ? 2 : counts[1] > 0 ? 1 : 0;
  const totalHazards = counts[1] + counts[2] + counts[3] + counts[4];
  return { score, counts, highestTier, totalHazards };
}
var HAZARD_BUFFER_DEG = 15e-4;
function hazardsNearPolyline(allHazards, polyline) {
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
        h.lat,
        h.lng,
        polyline[i].lat,
        polyline[i].lng,
        polyline[i + 1].lat,
        polyline[i + 1].lng
      );
      if (d < HAZARD_BUFFER_DEG) return true;
    }
    return false;
  });
}
async function fetchOSRMRoutes(sLat, sLng, eLat, eLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?alternatives=true&overview=full&geometries=polyline`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(1e4) });
  if (!resp.ok) throw new Error(`OSRM returned ${resp.status}`);
  const data = await resp.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("OSRM could not find routes");
  }
  return data.routes.map((r) => ({
    geometry: r.geometry,
    distance: r.distance,
    duration: r.duration
  }));
}
function safeUserResponse(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    reputation: user.reputation,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null
  };
}
async function registerRoutes(app2) {
  const PgStore = (0, import_connect_pg_simple.default)(import_express_session.default);
  app2.use(
    (0, import_express_session.default)({
      store: new PgStore({ pool: pool2, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "lowroute-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1e3,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
      }
    })
  );
  await seedDemoHazards();
  if (process.env.NODE_ENV === "production") {
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      const adminHash = await import_bcryptjs.default.hash(process.env.ADMIN_PASSWORD, 10);
      await seedAdminUser(process.env.ADMIN_USERNAME, adminHash);
    }
  } else {
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "lowroute-admin";
    const adminHash = await import_bcryptjs.default.hash(adminPassword, 10);
    await seedAdminUser(adminUsername, adminHash);
  }
  app2.post("/api/auth/register", async (req, res) => {
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
      const existingEmail = await getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ message: "Email already in use" });
      const existingUsername = await getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken" });
      const passwordHash = await import_bcryptjs.default.hash(password, 10);
      const user = await createUser({ username, email, passwordHash });
      req.session.userId = user.id;
      res.json(safeUserResponse(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Registration failed" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkRateLimit(`login:${ip}`)) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "All fields required" });
      const user = await getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      const valid = await import_bcryptjs.default.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      req.session.userId = user.id;
      const freshUser = await checkAndDowngradeExpiredSubscription(user.id);
      res.json(safeUserResponse(freshUser ?? user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Login failed" });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });
  app2.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) return res.json(null);
    const user = await checkAndDowngradeExpiredSubscription(req.session.userId);
    if (!user) return res.json(null);
    res.json(safeUserResponse(user));
  });
  app2.get("/api/hazards", async (req, res) => {
    try {
      const { minLat, maxLat, minLng, maxLng } = req.query;
      let hazards2;
      if (minLat && maxLat && minLng && maxLng) {
        hazards2 = await getHazardsByBbox(
          parseFloat(minLat),
          parseFloat(maxLat),
          parseFloat(minLng),
          parseFloat(maxLng)
        );
      } else {
        hazards2 = await getAllActiveHazards();
      }
      res.json(hazards2);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch hazards" });
    }
  });
  app2.post("/api/hazards", requireAuth, async (req, res) => {
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
      const hazard = await createHazard({
        userId: req.session.userId,
        lat: parsedLat,
        lng: parsedLng,
        type,
        severity: parsedSeverity,
        title: title.trim(),
        description: description.trim(),
        photoUrl: photoUrl && typeof photoUrl === "string" ? photoUrl.trim() : null
      });
      await updateUserReputation(req.session.userId, 10);
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create hazard" });
    }
  });
  app2.get("/api/hazards/nearby", async (req, res) => {
    try {
      const { lat, lng, radius } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ message: "lat and lng are required" });
      }
      const radiusKm = radius ? parseFloat(radius) : 0.5;
      const hazards2 = await getHazardsNearby(
        parseFloat(lat),
        parseFloat(lng),
        radiusKm
      );
      res.json(hazards2);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch nearby hazards" });
    }
  });
  app2.get("/api/hazards/:id", async (req, res) => {
    const hazard = await getHazardById(req.params.id);
    if (!hazard) return res.status(404).json({ message: "Not found" });
    res.json(hazard);
  });
  app2.post("/api/hazards/:id/vote", requireAuth, async (req, res) => {
    try {
      const { voteType } = req.body;
      if (!["confirm", "downvote", "clear"].includes(voteType)) {
        return res.status(400).json({ message: "Invalid vote type" });
      }
      const hazard = await voteOnHazard(req.session.userId, req.params.id, voteType);
      if (!hazard) return res.status(404).json({ message: "Hazard not found" });
      const repDelta = voteType === "confirm" ? 2 : voteType === "clear" ? 3 : 0;
      if (repDelta > 0) await updateUserReputation(req.session.userId, repDelta);
      res.json(hazard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Vote failed" });
    }
  });
  app2.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const users2 = await getAllUsers();
      res.json(users2);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app2.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const user = await updateUserRole(req.params.id, role);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update role" });
    }
  });
  app2.delete("/api/admin/hazards/:id", requireAdmin, async (req, res) => {
    try {
      const hazard = await deleteHazard(req.params.id);
      if (!hazard) return res.status(404).json({ message: "Hazard not found" });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete hazard" });
    }
  });
  app2.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await getStats();
      res.json(stats);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });
  app2.get("/api/routes", async (req, res) => {
    try {
      const { startLat, startLng, endLat, endLng, carProfileId } = req.query;
      if (!startLat || !startLng || !endLat || !endLng) {
        return res.status(400).json({ message: "Start and end coordinates required" });
      }
      const sLat = parseFloat(startLat);
      const sLng = parseFloat(startLng);
      const eLat = parseFloat(endLat);
      const eLng = parseFloat(endLng);
      if ([sLat, sLng, eLat, eLng].some(isNaN)) {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      let riskMultiplier = 1;
      let carProfileInfo = null;
      if (carProfileId && typeof carProfileId === "string" && req.session.userId) {
        const carProfile = await getCarProfileById(carProfileId);
        if (carProfile && carProfile.userId === req.session.userId) {
          const modeData = CLEARANCE_MODES.find((m) => m.value === carProfile.clearanceMode);
          riskMultiplier = modeData?.riskMultiplier ?? 1;
          carProfileInfo = {
            make: carProfile.make,
            model: carProfile.model,
            year: carProfile.year,
            clearanceMode: carProfile.clearanceMode
          };
        }
      }
      const allHazards = await getAllActiveHazards();
      let osrmRoutes;
      try {
        osrmRoutes = await fetchOSRMRoutes(sLat, sLng, eLat, eLng);
      } catch (osrmErr) {
        console.error("OSRM fetch failed:", osrmErr);
        return res.status(502).json({ message: "Routing service temporarily unavailable. Please try again." });
      }
      const ROUTE_LABELS = [
        { id: "fastest", label: "Fastest", description: "Shortest travel time" },
        { id: "safest", label: "Low-Car Safe", description: "Alternate route, may avoid hazards" },
        { id: "balanced", label: "Balanced", description: "Balance between time and safety" }
      ];
      const routes = osrmRoutes.slice(0, 3).map((osrmRoute, i) => {
        const polyline = decodePolyline(osrmRoute.geometry);
        const routeHazards = hazardsNearPolyline(allHazards, polyline);
        const risk = calculateRouteRisk(routeHazards, riskMultiplier);
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
          waypoints: polyline
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
      res.json({ routes, carProfile: carProfileInfo, riskMultiplier });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Route calculation failed" });
    }
  });
  app2.post("/api/routes/save", requireAuth, async (req, res) => {
    try {
      const { name, startLat, startLng, endLat, endLng, startAddress, endAddress, riskScore, carProfileId, routeData } = req.body;
      if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ message: "Name must be 1-100 characters" });
      }
      if (startLat == null || startLng == null || endLat == null || endLng == null) {
        return res.status(400).json({ message: "Start and end coordinates are required" });
      }
      const route = await saveRoute({
        userId: req.session.userId,
        name: name.trim(),
        startLat: parseFloat(startLat),
        startLng: parseFloat(startLng),
        endLat: parseFloat(endLat),
        endLng: parseFloat(endLng),
        startAddress: startAddress || null,
        endAddress: endAddress || null,
        riskScore: parseInt(riskScore) || 0,
        carProfileId: carProfileId || null,
        routeData: routeData || null
      });
      res.json(route);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to save route" });
    }
  });
  app2.get("/api/routes/saved", requireAuth, async (req, res) => {
    try {
      const routes = await getSavedRoutesByUser(req.session.userId);
      res.json(routes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch saved routes" });
    }
  });
  app2.delete("/api/routes/saved/:id", requireAuth, async (req, res) => {
    try {
      const route = await getSavedRouteById(req.params.id);
      if (!route) return res.status(404).json({ message: "Route not found" });
      if (route.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your route" });
      }
      await deleteSavedRoute(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete route" });
    }
  });
  app2.post("/api/subscription", requireAuth, async (req, res) => {
    try {
      const { tier } = req.body;
      if (tier === "pro") {
        return res.status(403).json({ message: "Pro upgrades require a subscription or promo code" });
      }
      if (tier !== "free") {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }
      await updateSubscriptionTier(req.session.userId, "free", null);
      const user = await getUserById(req.session.userId);
      res.json(safeUserResponse(user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  });
  app2.post("/api/admin/promo-codes", requireAdmin, async (req, res) => {
    try {
      const { type, maxUses, expiresAt, code: customCode } = req.body;
      if (!type || !["7_day", "30_day", "permanent"].includes(type)) {
        return res.status(400).json({ message: "Invalid promo type. Use 7_day, 30_day, or permanent." });
      }
      const parsedUses = maxUses ? parseInt(maxUses) : 1;
      const uses = isNaN(parsedUses) ? 1 : Math.max(1, Math.min(1e4, parsedUses));
      let code;
      if (customCode && typeof customCode === "string" && customCode.trim()) {
        code = customCode.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "");
        if (code.length < 3 || code.length > 20) {
          return res.status(400).json({ message: "Custom code must be 3-20 characters (letters, numbers, hyphens)" });
        }
        const existing = await getPromoCodeByCode(code);
        if (existing) {
          return res.status(409).json({ message: `Code "${code}" is already taken` });
        }
      } else {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        code = "LOWPRO-";
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      }
      let parsedExpiry = null;
      if (expiresAt && typeof expiresAt === "string" && expiresAt.trim()) {
        parsedExpiry = parseDateEndOfDayMST(expiresAt.trim());
        if (!parsedExpiry) {
          return res.status(400).json({ message: "Invalid expiry date. Use YYYY-MM-DD format." });
        }
        if (parsedExpiry < /* @__PURE__ */ new Date()) {
          return res.status(400).json({ message: "Expiry date must be in the future" });
        }
      }
      const promo = await createPromoCode({
        code,
        type,
        maxUses: uses,
        createdBy: req.session.userId,
        expiresAt: parsedExpiry
      });
      res.json(promo);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });
  app2.get("/api/admin/promo-codes", requireAdmin, async (_req, res) => {
    try {
      const codes = await getAllPromoCodes();
      res.json(codes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch promo codes" });
    }
  });
  app2.patch("/api/admin/promo-codes/:id/deactivate", requireAdmin, async (req, res) => {
    try {
      const promo = await deactivatePromoCode(req.params.id);
      if (!promo) return res.status(404).json({ message: "Promo code not found" });
      res.json(promo);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to deactivate promo code" });
    }
  });
  app2.post("/api/promo/redeem", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Promo code is required" });
      }
      const promo = await getPromoCodeByCode(code.trim().toUpperCase());
      if (!promo) return res.status(404).json({ message: "Invalid promo code" });
      if (!promo.isActive) return res.status(400).json({ message: "This promo code is no longer active" });
      if (promo.expiresAt && new Date(promo.expiresAt) < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ message: "This promo code has expired" });
      }
      if (promo.currentUses >= promo.maxUses) {
        return res.status(400).json({ message: "This promo code has reached its usage limit" });
      }
      const hasRedeemed = await hasUserRedeemedAnyPromo(req.session.userId);
      if (hasRedeemed) return res.status(400).json({ message: "Promo codes are limited to one per account" });
      await redeemPromoCode(req.session.userId, promo.id);
      const currentUser = await getUserById(req.session.userId);
      let expiresAt = null;
      if (promo.type === "7_day" || promo.type === "30_day") {
        const days = promo.type === "7_day" ? 7 : 30;
        const baseTime = currentUser?.subscriptionExpiresAt && new Date(currentUser.subscriptionExpiresAt) > /* @__PURE__ */ new Date() ? new Date(currentUser.subscriptionExpiresAt).getTime() : Date.now();
        expiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1e3);
      }
      if (currentUser?.subscriptionTier === "pro" && !currentUser.subscriptionExpiresAt && promo.type !== "permanent") {
        expiresAt = null;
      }
      await updateSubscriptionTier(req.session.userId, "pro", expiresAt);
      const user = await getUserById(req.session.userId);
      res.json({
        message: promo.type === "permanent" ? "Permanent Pro access activated!" : `Pro access activated for ${promo.type === "7_day" ? "7 days" : "30 days"}!`,
        user: safeUserResponse(user)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to redeem promo code" });
    }
  });
  app2.get("/api/cars", requireAuth, async (req, res) => {
    try {
      const profiles = await getCarProfilesByUser(req.session.userId);
      res.json(profiles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch car profiles" });
    }
  });
  app2.get("/api/cars/:id", requireAuth, async (req, res) => {
    try {
      const profile = await getCarProfileById(req.params.id);
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
  app2.post("/api/cars", requireAuth, async (req, res) => {
    try {
      const { make, model, year, rideHeight, suspensionType, hasFrontLip, wheelSize, clearanceMode, isDefault } = req.body;
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
      const profile = await createCarProfile({
        userId: req.session.userId,
        make: make.trim(),
        model: model.trim(),
        year: parsedYear,
        rideHeight: rideHeight ? parseFloat(rideHeight) : null,
        suspensionType: suspensionType || "stock",
        hasFrontLip: !!hasFrontLip,
        wheelSize: wheelSize ? parseInt(wheelSize) : null,
        clearanceMode: clearanceMode || "normal",
        isDefault: !!isDefault
      });
      res.json(profile);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create car profile" });
    }
  });
  app2.put("/api/cars/:id", requireAuth, async (req, res) => {
    try {
      const existing = await getCarProfileById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Car profile not found" });
      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      const { make, model, year, rideHeight, suspensionType, hasFrontLip, wheelSize, clearanceMode, isDefault } = req.body;
      const validSuspension = ["stock", "lowered", "coilovers", "air_ride", "bagged"];
      const validClearance = ["normal", "lowered", "very_lowered", "show_car"];
      const updates = {};
      if (make !== void 0) {
        if (typeof make !== "string" || make.trim().length < 1 || make.trim().length > 50) {
          return res.status(400).json({ message: "Make must be 1-50 characters" });
        }
        updates.make = make.trim();
      }
      if (model !== void 0) {
        if (typeof model !== "string" || model.trim().length < 1 || model.trim().length > 50) {
          return res.status(400).json({ message: "Model must be 1-50 characters" });
        }
        updates.model = model.trim();
      }
      if (year !== void 0) {
        const parsedYear = parseInt(year);
        if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2030) {
          return res.status(400).json({ message: "Year must be between 1900 and 2030" });
        }
        updates.year = parsedYear;
      }
      if (rideHeight !== void 0) updates.rideHeight = rideHeight ? parseFloat(rideHeight) : null;
      if (suspensionType !== void 0) {
        if (!validSuspension.includes(suspensionType)) {
          return res.status(400).json({ message: "Invalid suspension type" });
        }
        updates.suspensionType = suspensionType;
      }
      if (hasFrontLip !== void 0) updates.hasFrontLip = !!hasFrontLip;
      if (wheelSize !== void 0) updates.wheelSize = wheelSize ? parseInt(wheelSize) : null;
      if (clearanceMode !== void 0) {
        if (!validClearance.includes(clearanceMode)) {
          return res.status(400).json({ message: "Invalid clearance mode" });
        }
        updates.clearanceMode = clearanceMode;
      }
      if (isDefault !== void 0) updates.isDefault = !!isDefault;
      const profile = await updateCarProfile(req.params.id, updates);
      res.json(profile);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update car profile" });
    }
  });
  app2.delete("/api/cars/:id", requireAuth, async (req, res) => {
    try {
      const existing = await getCarProfileById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Car profile not found" });
      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      await deleteCarProfile(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete car profile" });
    }
  });
  app2.post("/api/cars/:id/default", requireAuth, async (req, res) => {
    try {
      const existing = await getCarProfileById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Car profile not found" });
      if (existing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your car profile" });
      }
      await setDefaultCarProfile(req.session.userId, req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to set default car" });
    }
  });
  app2.get("/api/events", async (req, res) => {
    try {
      const { minLat, maxLat, minLng, maxLng } = req.query;
      let evts;
      if (minLat && maxLat && minLng && maxLng) {
        evts = await getEventsByBbox(
          parseFloat(minLat),
          parseFloat(maxLat),
          parseFloat(minLng),
          parseFloat(maxLng)
        );
      } else {
        evts = await getUpcomingEvents();
      }
      if (req.session?.userId) {
        const enriched = await Promise.all(evts.map(async (e) => ({
          ...e,
          hasRsvped: await getUserRsvp(req.session.userId, e.id)
        })));
        return res.json(enriched);
      }
      res.json(evts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });
  app2.get("/api/events/upcoming", async (req, res) => {
    try {
      const evts = await getUpcomingEvents();
      if (req.session?.userId) {
        const enriched = await Promise.all(evts.map(async (e) => ({
          ...e,
          hasRsvped: await getUserRsvp(req.session.userId, e.id)
        })));
        return res.json(enriched);
      }
      res.json(evts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch upcoming events" });
    }
  });
  app2.get("/api/events/:id", async (req, res) => {
    try {
      const event = await getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const result = { ...event };
      if (req.session?.userId) {
        result.hasRsvped = await getUserRsvp(req.session.userId, event.id);
      }
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });
  app2.post("/api/events", requireAuth, async (req, res) => {
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
      const validEventTypes = ["car_meet", "show_and_shine", "cruise", "photo_spot", "shop_garage", "warning"];
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
      const event = await createEvent({
        userId: req.session.userId,
        title: title.trim(),
        description: description.trim(),
        eventType,
        lat: parsedLat,
        lng: parsedLng,
        date: parsedDate,
        endDate: endDate ? new Date(endDate) : null,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null
      });
      await updateUserReputation(req.session.userId, 15);
      res.json(event);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create event" });
    }
  });
  app2.put("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const event = await getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not your event" });
      }
      const { title, description, eventType, date, endDate, maxAttendees, status } = req.body;
      const validEventTypes = ["car_meet", "cruise", "car_show", "photo_spot", "other"];
      const validStatuses = ["active", "cancelled", "completed"];
      const updates = {};
      if (title !== void 0) {
        if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 100) {
          return res.status(400).json({ message: "Title must be 3-100 characters" });
        }
        updates.title = title.trim();
      }
      if (description !== void 0) {
        if (typeof description !== "string" || description.trim().length < 5 || description.trim().length > 500) {
          return res.status(400).json({ message: "Description must be 5-500 characters" });
        }
        updates.description = description.trim();
      }
      if (eventType !== void 0) {
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
      if (endDate !== void 0) updates.endDate = endDate ? new Date(endDate) : null;
      if (maxAttendees !== void 0) updates.maxAttendees = maxAttendees ? parseInt(maxAttendees) : null;
      if (status !== void 0) {
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        updates.status = status;
      }
      const updated = await updateEvent(req.params.id, updates);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });
  app2.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
      const event = await getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const user = await getUserById(req.session.userId);
      if (event.userId !== req.session.userId && user?.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }
      await deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });
  app2.post("/api/events/:id/rsvp", requireAuth, async (req, res) => {
    try {
      const event = await getEventById(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (event.maxAttendees && event.rsvpCount >= event.maxAttendees) {
        const hasRsvp = await getUserRsvp(req.session.userId, req.params.id);
        if (!hasRsvp) {
          return res.status(400).json({ message: "Event is full" });
        }
      }
      const result = await toggleRsvp(req.session.userId, req.params.id);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update RSVP" });
    }
  });
  app2.get("/api/admin/events", requireAdmin, async (_req, res) => {
    try {
      const evts = await getAllEvents();
      res.json(evts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });
  app2.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
    try {
      const event = await deleteEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });
  app2.patch("/api/admin/events/:id/status", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !["upcoming", "active", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const event = await updateEvent(req.params.id, { status });
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json(event);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update event status" });
    }
  });
  const uploadsDir = import_node_path.default.resolve(process.cwd(), "public", "uploads");
  if (!import_node_fs.default.existsSync(uploadsDir)) {
    import_node_fs.default.mkdirSync(uploadsDir, { recursive: true });
  }
  const uploadStorage = import_multer.default.diskStorage({
    destination: function(_req, _file, cb) {
      cb(null, uploadsDir);
    },
    filename: function(_req, file, cb) {
      const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
      const ext = import_node_path.default.extname(file.originalname).toLowerCase();
      cb(null, uniqueSuffix + ext);
    }
  });
  const upload = (0, import_multer.default)({
    storage: uploadStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [".jpg", ".jpeg", ".png", ".webp"];
      const ext = import_node_path.default.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Only jpg, png, and webp files are allowed"));
      }
    }
  });
  const express2 = require("express");
  app2.use("/uploads", express2.static(uploadsDir));
  app2.post("/api/upload", requireAuth, upload.single("photo"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    res.json({ url: photoUrl });
  });
  const httpServer = (0, import_node_http.createServer)(app2);
  return httpServer;
}

// server/index.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var app = (0, import_express.default)();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    import_express.default.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(import_express.default.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", import_express.default.static(path2.resolve(process.cwd(), "assets")));
  app2.use(import_express.default.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
