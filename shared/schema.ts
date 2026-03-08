import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, doublePrecision, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const hazardTypeEnum = pgEnum("hazard_type", [
  "pothole",
  "speed_bump",
  "construction",
  "large_bump_dip",
  "raised_manhole",
  "railroad_crossing",
  "debris",
  "steep_driveway",
  "flooded_road",
  "other",
]);

export const hazardStatusEnum = pgEnum("hazard_status", ["active", "cleared"]);

export const voteTypeEnum = pgEnum("vote_type", ["confirm", "downvote", "clear"]);

export const suspensionTypeEnum = pgEnum("suspension_type", [
  "stock",
  "lowered",
  "coilovers",
  "air_ride",
  "bagged",
]);

export const clearanceModeEnum = pgEnum("clearance_mode", [
  "normal",
  "lowered",
  "very_lowered",
  "show_car",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "car_meet",
  "show_and_shine",
  "cruise",
  "photo_spot",
  "shop_garage",
  "warning",
]);

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  reputation: integer("reputation").notNull().default(0),
  role: text("role").notNull().default("user"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  shareLocation: boolean("share_location").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const hazards = pgTable("hazards", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  type: hazardTypeEnum("type").notNull(),
  severity: integer("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: hazardStatusEnum("status").notNull().default("active"),
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  confidenceScore: real("confidence_score").notNull().default(0.5),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const hazardVotes = pgTable("hazard_votes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  hazardId: varchar("hazard_id").references(() => hazards.id).notNull(),
  voteType: voteTypeEnum("vote_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  currentUses: integer("current_uses").notNull().default(0),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const promoRedemptions = pgTable("promo_redemptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  promoCodeId: varchar("promo_code_id").references(() => promoCodes.id).notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
});

export const carProfiles = pgTable("car_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  rideHeight: real("ride_height"),
  suspensionType: suspensionTypeEnum("suspension_type").notNull().default("stock"),
  hasFrontLip: boolean("has_front_lip").notNull().default(false),
  wheelSize: integer("wheel_size"),
  clearanceMode: clearanceModeEnum("clearance_mode").notNull().default("normal"),
  isDefault: boolean("is_default").notNull().default(false),
  avatarStyle: varchar("avatar_style", { length: 20 }).notNull().default("sedan"),
  avatarColor: varchar("avatar_color", { length: 10 }).notNull().default("#F97316"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  date: timestamp("date").notNull(),
  endDate: timestamp("end_date"),
  maxAttendees: integer("max_attendees"),
  rsvpCount: integer("rsvp_count").notNull().default(0),
  status: text("status").notNull().default("upcoming"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const eventRsvps = pgTable("event_rsvps", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const savedRoutes = pgTable("saved_routes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  startLat: doublePrecision("start_lat").notNull(),
  startLng: doublePrecision("start_lng").notNull(),
  endLat: doublePrecision("end_lat").notNull(),
  endLng: doublePrecision("end_lng").notNull(),
  startAddress: text("start_address"),
  endAddress: text("end_address"),
  riskScore: integer("risk_score").notNull().default(0),
  carProfileId: varchar("car_profile_id").references(() => carProfiles.id),
  routeData: jsonb("route_data"),
  shareToken: varchar("share_token", { length: 32 }).unique(),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted", "blocked"]);

export const friendships = pgTable("friendships", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").references(() => users.id).notNull(),
  addresseeId: varchar("addressee_id").references(() => users.id).notNull(),
  status: friendshipStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userLocations = pgTable("user_locations", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  activeCarId: varchar("active_car_id").references(() => carProfiles.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const listingCategoryEnum = pgEnum("listing_category", [
  "wheels_tires",
  "suspension",
  "body_kits",
  "exhaust",
  "interior",
  "electronics",
  "engine",
  "misc",
]);

export const listingConditionEnum = pgEnum("listing_condition", [
  "new",
  "like_new",
  "good",
  "fair",
  "parts_only",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "sold",
  "removed",
]);

export const shippingOptionEnum = pgEnum("shipping_option", [
  "pickup_only",
  "shipping_available",
  "shipping_only",
]);

export const marketplaceListings = pgTable("marketplace_listings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  category: listingCategoryEnum("category").notNull(),
  condition: listingConditionEnum("condition").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  city: text("city"),
  photos: jsonb("photos").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: listingStatusEnum("status").notNull().default("active"),
  shippingOption: shippingOptionEnum("shipping_option").notNull().default("pickup_only"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").references(() => users.id).notNull(),
  receiverId: varchar("receiver_id"),
  listingId: varchar("listing_id").references(() => marketplaceListings.id),
  groupChatId: varchar("group_chat_id"),
  content: text("content").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groupChats = pgTable("group_chats", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groupChatMembers = pgTable("group_chat_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  groupChatId: varchar("group_chat_id").references(() => groupChats.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  passwordHash: true,
});

export const insertHazardSchema = createInsertSchema(hazards).pick({
  userId: true,
  lat: true,
  lng: true,
  type: true,
  severity: true,
  title: true,
  description: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Hazard = typeof hazards.$inferSelect;
export type HazardVote = typeof hazardVotes.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;
export type CarProfile = typeof carProfiles.$inferSelect;
export type InsertCarProfile = typeof carProfiles.$inferInsert;
export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;
export type EventRsvp = typeof eventRsvps.$inferSelect;
export type SavedRoute = typeof savedRoutes.$inferSelect;
export type InsertSavedRoute = typeof savedRoutes.$inferInsert;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = typeof marketplaceListings.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type UserLocation = typeof userLocations.$inferSelect;

export const HAZARD_TYPES = [
  { value: "pothole", label: "Pothole" },
  { value: "speed_bump", label: "Speed Bump" },
  { value: "construction", label: "Construction Zone" },
  { value: "large_bump_dip", label: "Large Bump / Dip" },
  { value: "raised_manhole", label: "Raised Manhole" },
  { value: "railroad_crossing", label: "Railroad Crossing" },
  { value: "debris", label: "Debris in Road" },
  { value: "steep_driveway", label: "Steep Driveway Angle" },
  { value: "flooded_road", label: "Flooded Road" },
  { value: "other", label: "Other" },
] as const;

export const SEVERITY_TIERS = [
  {
    tier: 1,
    label: "Minor",
    description: "Dodgeable obstacle",
    color: "#22C55E",
    bg: "#052e16",
    detail: "Small pothole, small debris. Driver can usually avoid or slow down.",
  },
  {
    tier: 2,
    label: "Caution",
    description: "Scrape risk",
    color: "#EAB308",
    bg: "#422006",
    detail: "Moderate bump, bad dip, rough crossing. Slow down significantly.",
  },
  {
    tier: 3,
    label: "Major",
    description: "Detour recommended",
    color: "#F97316",
    bg: "#431407",
    detail: "Severe pothole, deep dip, blocking construction. Strong warning.",
  },
  {
    tier: 4,
    label: "No-Go",
    description: "Full detour required",
    color: "#EF4444",
    bg: "#450a0a",
    detail: "Road inaccessible for low vehicles. Routing will avoid this road.",
  },
] as const;

export const EVENT_TYPES = [
  { value: "car_meet", label: "Car Meet", icon: "people" },
  { value: "show_and_shine", label: "Show & Shine", icon: "trophy" },
  { value: "cruise", label: "Cruise", icon: "car-sport" },
  { value: "photo_spot", label: "Photo Spot", icon: "camera" },
  { value: "shop_garage", label: "Shop / Garage", icon: "build" },
] as const;

export const SUSPENSION_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "lowered", label: "Lowered Springs" },
  { value: "coilovers", label: "Coilovers" },
  { value: "air_ride", label: "Air Ride" },
  { value: "bagged", label: "Bagged" },
] as const;

export const CLEARANCE_MODES = [
  { value: "normal", label: "Normal", riskMultiplier: 1.0 },
  { value: "lowered", label: "Lowered", riskMultiplier: 1.3 },
  { value: "very_lowered", label: "Very Lowered", riskMultiplier: 1.6 },
  { value: "show_car", label: "Show Car", riskMultiplier: 2.0 },
] as const;
