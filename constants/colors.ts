const ACCENT = "#F59E0B";
const ACCENT_DARK = "#D97706";
const DANGER = "#EF4444";
const WARNING = "#F97316";
const CAUTION = "#EAB308";
const SAFE = "#22C55E";

export const Colors = {
  bg: "#0A0A0B",
  bgCard: "#111114",
  bgElevated: "#1A1A1F",
  bgInput: "#1E1E24",
  border: "#2A2A32",
  borderLight: "#333340",
  text: "#F5F5F5",
  textSecondary: "#9A9AAF",
  textMuted: "#5A5A6A",
  accent: ACCENT,
  accentDark: ACCENT_DARK,
  tier1: SAFE,
  tier2: CAUTION,
  tier3: WARNING,
  tier4: DANGER,
  tierColors: [SAFE, CAUTION, WARNING, DANGER],
  tierBg: ["#052e16", "#422006", "#431407", "#450a0a"],
  success: SAFE,
  error: DANGER,
  white: "#FFFFFF",
  mapStyle: [
    { elementType: "geometry", stylers: [{ color: "#0f0f13" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0f0f13" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1a24" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#252530" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1f2040" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#292940" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#050a17" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0d0d14" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0a1a0a" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#0f0f18" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1a1a2a" }] },
    { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  ],
};

export default {
  light: {
    text: Colors.text,
    background: Colors.bg,
    tint: Colors.accent,
    tabIconDefault: Colors.textMuted,
    tabIconSelected: Colors.accent,
  },
};
