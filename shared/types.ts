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
  photoUrl: string | null;
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

export interface CarProfile {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  rideHeight: number | null;
  suspensionType: "stock" | "lowered" | "coilovers" | "air_ride" | "bagged";
  hasFrontLip: boolean;
  wheelSize: number | null;
  clearanceMode: "normal" | "lowered" | "very_lowered" | "show_car";
  isDefault: boolean;
  createdAt: string | Date;
}

export interface AppEvent {
  id: string;
  userId: string;
  title: string;
  description: string;
  eventType: "car_meet" | "show_and_shine" | "cruise" | "photo_spot" | "shop_garage" | "warning";
  lat: number;
  lng: number;
  date: string | Date;
  endDate: string | Date | null;
  maxAttendees: number | null;
  rsvpCount: number;
  status: string;
  createdAt: string | Date;
  creatorUsername?: string;
  hasRsvped?: boolean;
}

export interface SavedRoute {
  id: string;
  userId: string;
  name: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string | null;
  endAddress: string | null;
  riskScore: number;
  carProfileId: string | null;
  routeData: any;
  shareToken: string | null;
  isPublic: boolean;
  createdAt: string | Date;
}

export const EVENT_TYPES = [
  { value: "car_meet", label: "Car Meet", icon: "people" },
  { value: "show_and_shine", label: "Show & Shine", icon: "trophy" },
  { value: "cruise", label: "Cruise", icon: "car-sport" },
  { value: "photo_spot", label: "Photo Spot", icon: "camera" },
  { value: "shop_garage", label: "Shop / Garage", icon: "build" },
  { value: "warning", label: "Road Warning", icon: "warning" },
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

const MST_TIMEZONE = "America/Phoenix";

export function formatMSTDateClient(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    timeZone: MST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " MST";
}

export function formatMSTClient(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    timeZone: MST_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " MST";
}
