# LowRoute

A community-powered GPS and hazard-reporting app for low-clearance vehicles (lowriders, slammed cars, sports cars). Helps drivers find routes that avoid road hazards like potholes, speed bumps, and construction.

## Architecture

**Frontend:** Expo Router (React Native) with TypeScript, targeting iOS/Android/Web via Expo Go
**Backend:** Express.js + TypeScript on port 5000
**Database:** PostgreSQL via Drizzle ORM
**Auth:** express-session with connect-pg-simple store, bcryptjs for password hashing
**Payments:** RevenueCat SDK (react-native-purchases) — runs in Preview API Mode in Expo Go

## Key Features

- Interactive map with hazard markers colored by severity tier (1-4)
- 3 route options: Fastest, Low-Car Safe, Balanced — each with a Low Clearance Risk Score
- **Live GPS navigation** with continuous position tracking, speed, heading display
- **Hazard proximity alerts** — vibration + visual warning when within 200m of a hazard during navigation
- Community hazard reporting (10 hazard types, 4 severity tiers)
- Community validation: confirm, downvote, or mark hazards as cleared
- Confidence scoring based on community votes
- User accounts with reputation/XP system and badges
- **Admin panel** with stats dashboard, hazard management, user role management
- **Subscription system** with Free and Pro tiers (Pro gates live navigation + hazard alerts)
- Geocoding via OpenStreetMap Nominatim (free, no API key required)

## Route Safety Logic

The route scoring system (see `server/routes.ts`) applies severity penalties:
- Tier 1 (Minor): +5 points
- Tier 2 (Caution): +20 points
- Tier 3 (Major): +100 points
- Tier 4 (No-Go): +1000 points

Only hazards with confidence >= 0.4 count. Routes with more Tier 3/4 hazards score higher (worse). The "Low-Car Safe" route uses alternate waypoints to reduce hazard exposure.

## Project Structure

```
app/
  _layout.tsx          # Root layout with QueryClient, AuthProvider, LocationProvider, ErrorBoundary
  (tabs)/
    _layout.tsx        # NativeTabs (iOS 26+) or classic BlurView Tabs, conditional admin tab
    index.tsx          # Main map screen with search, routing, hazard markers, live navigation
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
contexts/
  AuthContext.tsx      # Auth state with role + subscriptionTier
  LocationContext.tsx  # Live GPS tracking: watchPositionAsync, heading, speed
server/
  index.ts             # Express setup with CORS, sessions
  routes.ts            # API routes: auth, hazards, route calc, admin, subscription, nearby
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
- Admin account: username `admin`, password `lowroute-admin`
- Live navigation is gated behind Pro subscription (or admin role)

## Color Theme

- Background: `#0A0A0B` (deep obsidian)
- Card: `#111114`
- Accent: `#F59E0B` (amber/gold — car culture)
- Tier 1: `#22C55E` (green)
- Tier 2: `#EAB308` (yellow)
- Tier 3: `#F97316` (orange)
- Tier 4: `#EF4444` (red)

## Database Tables

- `users`: id, username, email, password_hash, reputation, role, subscription_tier, created_at
- `hazards`: id, user_id, lat, lng, type (enum), severity (1-4), title, description, status, upvotes, downvotes, confidence_score, created_at, expires_at
- `hazard_votes`: id, user_id, hazard_id, vote_type (confirm/downvote/clear)
- `session` (auto-created by connect-pg-simple)

## API Endpoints

Auth: POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
Hazards: GET /api/hazards, POST /api/hazards, GET /api/hazards/:id, POST /api/hazards/:id/vote, GET /api/hazards/nearby
Routes: GET /api/routes
Admin: GET /api/admin/stats, GET /api/admin/users, PATCH /api/admin/users/:id/role, DELETE /api/admin/hazards/:id
Subscription: POST /api/subscription

## Seed Data

10 sample hazards seeded around downtown Los Angeles (lat 34.05, lng -118.24) on first startup.
Admin user seeded on startup (admin / lowroute-admin).

## Dependencies

- `react-native-maps@1.18.0` — pinned for Expo Go compatibility
- `react-native-purchases` — RevenueCat SDK for subscriptions
- `bcryptjs` — password hashing
- `express-session` + `connect-pg-simple` — session management
