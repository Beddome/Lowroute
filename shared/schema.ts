import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
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

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  reputation: integer("reputation").notNull().default(0),
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
