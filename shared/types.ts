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

export interface Hazard {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  type: string;
  severity: number;
  title: string;
  description: string;
  status: "active" | "cleared";
  upvotes: number;
  downvotes: number;
  confidenceScore: number;
  createdAt: string | Date;
  expiresAt: string | Date | null;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  reputation: number;
  role: "user" | "admin";
  subscriptionTier: "free" | "pro";
  subscriptionExpiresAt: string | Date | null;
}

export interface PromoCode {
  id: string;
  code: string;
  type: "7_day" | "30_day" | "permanent";
  maxUses: number;
  currentUses: number;
  createdBy: string;
  expiresAt: string | Date | null;
  isActive: boolean;
  createdAt: string | Date;
}

export const PROMO_TYPES = [
  { value: "7_day", label: "7-Day Trial", days: 7 },
  { value: "30_day", label: "30-Day Trial", days: 30 },
  { value: "permanent", label: "Permanent Access", days: null },
] as const;
