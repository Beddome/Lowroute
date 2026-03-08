# LowRoute

A community-powered GPS and hazard-reporting app for low-clearance vehicles (lowriders, slammed cars, sports cars). Helps drivers find routes that avoid road hazards like potholes, speed bumps, and construction.

## Architecture

**Frontend:** Expo Router (React Native) with TypeScript, targeting iOS/Android/Web via Expo Go
**Backend:** Express.js + TypeScript on port 5000
**Database:** PostgreSQL via Drizzle ORM
**Auth:** express-session with connect-pg-simple store, bcryptjs for password hashing
**Routing:** OSRM (Open Source Routing Machine) via public API — real road-following routes
**Payments:** RevenueCat SDK (react-native-purchases) — runs in Preview API Mode in Expo Go

## Key Features

- Interactive map with hazard markers colored by severity tier (1-4)
- **Real road-following routes** via OSRM with multiple alternatives, distance, and duration
- 3 route options: Fastest, Low-Car Safe, Balanced — each with a Low Clearance Risk Score
- **Live GPS navigation** with continuous position tracking, speed, heading display
- **Background location tracking** — navigation continues when app is minimized
- **Hazard proximity alerts** — vibration + visual warning when within 200m of a hazard during navigation
- Community hazard reporting (10 hazard types, 4 severity tiers) with input validation
- Community validation: confirm, downvote, or mark hazards as cleared
- Confidence scoring based on community votes
- User accounts with reputation/XP system and badges
- **Car Profile / Garage system** — add/edit/delete vehicles with make, model, year, ride height, suspension type, clearance mode, front lip, wheel size; set a default car
- **Events / Meet-ups** — create car meets, cruises, shows, photo spots with RSVP; purple event pins on map; admin event management (cancel/delete)
- **Personalized route risk scoring** — default car profile's clearance mode applies risk multipliers (1.0x normal to 2.0x show car) to route hazard penalties
- **Hazard photo uploads** — camera/gallery photo support on hazard reports via expo-image-picker + multer; photos displayed in hazard detail
- **Interactive web map** — Leaflet-based map on web with dark CartoDB tiles, hazard/event markers, search, routing, and right-click to report
- **Route saving & sharing** — save calculated routes to profile, view/delete saved routes, re-load on map; toggle public sharing with shareable links via native Share API
- **Admin panel** with stats dashboard, hazard management, user role management, promo code management, event management
- **Subscription system** with Free and Pro tiers (Pro gates live navigation + hazard alerts)
- **Security hardening**: rate limiting on auth endpoints, input validation, env-configurable admin credentials
- Geocoding via OpenStreetMap Nominatim (free, no API key required)

## Route Safety Logic

Routes are fetched from OSRM (real road geometry), then scored based on nearby hazards:
- Tier 1 (Minor): +5 points
- Tier 2 (Caution): +20 points
- Tier 3 (Major): +100 points
- Tier 4 (No-Go): +1000 points

Hazard proximity to route is calculated using point-to-segment distance (not bounding box). Only hazards with confidence >= 0.4 count.

## Project Structure

```
app/
  _layout.tsx          # Root layout with QueryClient, AuthProvider, LocationProvider, ErrorBoundary
  (tabs)/
    _layout.tsx        # NativeTabs (iOS 26+) or classic BlurView Tabs, conditional admin tab
    index.tsx          # Main map screen with search, OSRM routing, hazard markers, live navigation
    index.web.tsx      # Web fallback for map (no react-native-maps on web)
    profile.tsx        # User profile, reputation, badges, subscription upgrade
    admin.tsx          # Admin dashboard: stats, hazard mgmt, user mgmt (admin only)
  (auth)/
    _layout.tsx        # Modal stack for auth flow
    login.tsx
    register.tsx
  report.tsx           # formSheet for reporting a new hazard
  hazard/[id].tsx      # formSheet for hazard detail + community votes
  paywall.tsx          # Subscription/upgrade screen with Free & Pro tiers
  car-profile.tsx      # formSheet for add/edit car profiles (garage)
  event-detail.tsx     # formSheet for event details + RSVP
  create-event.tsx     # formSheet for creating/editing events
contexts/
  AuthContext.tsx      # Auth state with role + subscriptionTier
  LocationContext.tsx  # Live GPS tracking + background location via expo-task-manager
server/
  index.ts             # Express setup with CORS, sessions
  routes.ts            # API routes: OSRM routing, auth (rate limited), hazards (validated), admin, subscription
  storage.ts           # Drizzle DB operations + seed data + admin ops
shared/
  schema.ts            # Drizzle schema: users (with role, subscriptionTier), hazards, hazard_votes
  types.ts             # Frontend-safe types (MUST be used by frontend instead of schema.ts)
constants/
  colors.ts            # Dark car-culture theme (obsidian bg, amber accent)
stubs/
  react-native-maps-stub.js  # Web stub for react-native-maps (used by metro.config.js)
metro.config.js        # Custom resolver to stub react-native-maps on web
```

## Important Notes

- **Frontend files MUST import from `shared/types.ts`** NOT `shared/schema.ts` (schema uses drizzle-orm which is Node.js-only and breaks the Expo web bundle)
- `react-native-maps@1.18.0` is pinned for Expo Go compatibility
- Metro config stubs react-native-maps for web platform via custom resolver
- Admin credentials configurable via ADMIN_USERNAME / ADMIN_PASSWORD env vars (defaults: admin / lowroute-admin)
- Live navigation is gated behind Pro subscription (or admin role)
- **Promo codes**: one redemption per account lifetime; admin can set custom codes (e.g. influencer codes), date expiry, usage limit, or both
- **Timezone**: All promo/subscription dates use Mountain Standard Time (MST, UTC-7); helper functions in `server/timezone.ts` and `shared/types.ts`
- Auth endpoints rate-limited: 10 attempts per 15 minutes per IP
- Hazard reports validated: coordinate bounds, severity 1-4, title 3-100 chars, description 5-500 chars
- Bundle identifiers: `com.lowroute.app` (iOS and Android)
- Background location configured for both iOS (UIBackgroundModes) and Android (foreground service)

## Color Theme

- Background: `#0A0A0B` (deep obsidian)
- Card: `#111114`
- Accent: `#F59E0B` (amber/gold — car culture)
- Tier 1: `#22C55E` (green)
- Tier 2: `#EAB308` (yellow)
- Tier 3: `#F97316` (orange)
- Tier 4: `#EF4444` (red)

## Database Tables

- `users`: id, username, email, password_hash, reputation, role, subscription_tier, subscription_expires_at, created_at
- `hazards`: id, user_id, lat, lng, type (enum), severity (1-4), title, description, photo_url, status, upvotes, downvotes, confidence_score, created_at, expires_at
- `hazard_votes`: id, user_id, hazard_id, vote_type (confirm/downvote/clear)
- `promo_codes`: id, code (unique), type (7_day/30_day/permanent), max_uses, current_uses, created_by (FK users), expires_at, is_active, created_at
- `promo_redemptions`: id, user_id (FK users), promo_code_id (FK promo_codes), redeemed_at
- `car_profiles`: id, user_id, make, model, year, ride_height, suspension_type (enum), front_lip, wheel_size, clearance_mode (enum), is_default, created_at
- `events`: id, creator_id, title, description, event_type (enum), lat, lng, event_date, max_attendees, rsvp_count, status, created_at
- `event_rsvps`: id, event_id, user_id, created_at
- `saved_routes`: id, user_id, name, start_lat, start_lng, end_lat, end_lng, start_address, end_address, risk_score, car_profile_id, route_data (jsonb), created_at
- `session` (auto-created by connect-pg-simple)

## API Endpoints

Auth: POST /api/auth/register (rate limited), POST /api/auth/login (rate limited), POST /api/auth/logout, GET /api/auth/me
Hazards: GET /api/hazards, POST /api/hazards (validated), GET /api/hazards/:id, POST /api/hazards/:id/vote, GET /api/hazards/nearby
Routes: GET /api/routes (OSRM-powered)
Cars: GET /api/cars, POST /api/cars, PUT /api/cars/:id, DELETE /api/cars/:id
Events: GET /api/events (bbox filter), GET /api/events/:id, POST /api/events, PUT /api/events/:id, DELETE /api/events/:id, POST /api/events/:id/rsvp
Saved Routes: POST /api/routes/save, GET /api/routes/saved, DELETE /api/routes/saved/:id, POST /api/routes/saved/:id/share (toggle), GET /api/routes/shared/:token (public)
Upload: POST /api/upload (multipart, photo field, max 5MB)
Admin: GET /api/admin/stats, GET /api/admin/users, PATCH /api/admin/users/:id/role, DELETE /api/admin/hazards/:id
Admin Promos: POST /api/admin/promo-codes, GET /api/admin/promo-codes, PATCH /api/admin/promo-codes/:id/deactivate
Admin Events: GET /api/admin/events, PATCH /api/admin/events/:id/status, DELETE /api/admin/events/:id
Subscription: POST /api/subscription
Promo: POST /api/promo/redeem

## Seed Data

10 sample hazards seeded around downtown Los Angeles (lat 34.05, lng -118.24) on first startup.
Admin user seeded on startup (configurable via env vars).

## Dependencies

- `react-native-maps@1.18.0` — pinned for Expo Go compatibility
- `react-native-purchases` — RevenueCat SDK for subscriptions
- `expo-task-manager` — background location task registration
- `multer` — file upload middleware for hazard photos
- `leaflet` — interactive web map (web platform only)
- `expo-image-picker` — camera/gallery photo selection for hazard reports
- `bcryptjs` — password hashing
- `express-session` + `connect-pg-simple` — session management
