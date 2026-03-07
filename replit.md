# LowRoute

A community-powered GPS and hazard-reporting app for low-clearance vehicles (lowriders, slammed cars, sports cars). Helps drivers find routes that avoid road hazards like potholes, speed bumps, and construction.

## Architecture

**Frontend:** Expo Router (React Native) with TypeScript, targeting iOS/Android/Web via Expo Go
**Backend:** Express.js + TypeScript on port 5000
**Database:** PostgreSQL via Drizzle ORM
**Auth:** express-session with connect-pg-simple store, bcryptjs for password hashing

## Key Features

- Interactive map with hazard markers colored by severity tier (1-4)
- 3 route options: Fastest, Low-Car Safe, Balanced — each with a Low Clearance Risk Score
- Community hazard reporting (10 hazard types, 4 severity tiers)
- Community validation: confirm, downvote, or mark hazards as cleared
- Confidence scoring based on community votes
- User accounts with reputation/XP system and badges
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
  _layout.tsx          # Root layout with QueryClient, AuthProvider, ErrorBoundary
  (tabs)/
    _layout.tsx        # NativeTabs (iOS 26+) or classic BlurView Tabs
    index.tsx          # Main map screen with search, routing, hazard markers
    profile.tsx        # User profile, reputation, badges
  (auth)/
    _layout.tsx        # Modal stack for auth flow
    login.tsx
    register.tsx
  report.tsx           # formSheet for reporting a new hazard
  hazard/[id].tsx      # formSheet for hazard detail + community votes
contexts/
  AuthContext.tsx      # Auth state, login/register/logout
server/
  index.ts             # Express setup with CORS, sessions
  routes.ts            # API routes: auth, hazards, route calculation
  storage.ts           # Drizzle DB operations + seed data
shared/
  schema.ts            # Drizzle schema: users, hazards, hazard_votes
constants/
  colors.ts            # Dark car-culture theme (obsidian bg, amber accent)
```

## Color Theme

- Background: `#0A0A0B` (deep obsidian)
- Card: `#111114`
- Accent: `#F59E0B` (amber/gold — car culture)
- Tier 1: `#22C55E` (green)
- Tier 2: `#EAB308` (yellow)
- Tier 3: `#F97316` (orange)
- Tier 4: `#EF4444` (red)

## Database Tables

- `users`: id, username, email, password_hash, reputation, created_at
- `hazards`: id, user_id, lat, lng, type (enum), severity (1-4), title, description, status, upvotes, downvotes, confidence_score, created_at, expires_at
- `hazard_votes`: id, user_id, hazard_id, vote_type (confirm/downvote/clear)
- `session` (auto-created by connect-pg-simple)

## Seed Data

10 sample hazards seeded around downtown Los Angeles (lat 34.05, lng -118.24) on first startup.

## Dependencies Added

- `react-native-maps@1.18.0` — pinned for Expo Go compatibility
- `bcryptjs` — password hashing
- `express-session` + `connect-pg-simple` — session management
