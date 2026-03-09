# LowRoute

## Overview

LowRoute is a community-powered GPS and hazard-reporting application designed for low-clearance vehicles such as lowriders, slammed cars, and sports cars. Its primary purpose is to help drivers identify and navigate routes that avoid road hazards like potholes, speed bumps, and construction, thus protecting their vehicles. The project aims to create a comprehensive platform that combines real-time navigation with community-sourced hazard data, personalized route safety scoring, and social features like car meets and friend tracking, ultimately enhancing the driving experience for enthusiasts of low-clearance vehicles.

## User Preferences

I prefer iterative development, with a focus on delivering core features first. I value clear and concise communication. For any significant architectural changes or complex implementations, please ask for my approval before proceeding. I prefer detailed explanations for new features or complex bug fixes.

## System Architecture

LowRoute utilizes a full-stack architecture with a React Native frontend (Expo Router) for cross-platform mobile and web, an Express.js backend, and a PostgreSQL database managed with Drizzle ORM.

### UI/UX Decisions

The application features an interactive map displaying hazard markers colored by severity and type-specific icons. The design adopts a dark, car-culture-inspired theme with an obsidian background, amber accents, and specific colors for hazard severity tiers (green for minor, yellow for caution, orange for major, red for no-go). The map UI is decluttered, with search panels collapsing and route panels defaulting to compact views. Car avatars are customizable with various styles and colors, displayed in user profiles and on the map for friends.

### Technical Implementations

- **Frontend:** Built with Expo Router and TypeScript, targeting iOS, Android, and Web. It uses `react-native-maps` for interactive maps on mobile and Leaflet for the web version.
- **Backend:** An Express.js server in TypeScript handles API requests, authentication, and interactions with the database and external services.
- **Database:** PostgreSQL is used for data persistence, with Drizzle ORM for type-safe database interactions.
- **Authentication:** `express-session` with `connect-pg-simple` manages sessions, and `bcryptjs` handles password hashing.
- **Routing & Geocoding:** Integrates Google Maps Directions API for real road-following routes and Google Places Autocomplete + Google Geocoding API for location services.
- **Navigation:** Features live GPS navigation, continuous position tracking, speed/heading display, and voice navigation via `expo-speech` with Bluetooth support. Background location tracking is enabled.
- **Hazard System:** Community-powered reporting with 10 types and 4 severity tiers, validation, confidence scoring based on votes (confirm, downvote, clear), and photo uploads via `expo-image-picker` and `multer`.
- **Route Safety Logic:** Routes are scored based on proximity to hazards and their severity, with scores amplified by the user's car profile clearance mode. Routes are sorted safety-first, then by severity, hazard count, and time.
- **Car Profiles/Garage:** Users can manage multiple car profiles with details like make, model, ride height, suspension type, and clearance mode, which influences route risk scoring.
- **Social Features:** Includes a friends system with live location sharing (Snap Maps-style), car avatars, and event creation/RSVP functionality (car meets, cruises).
- **Marketplace:** A car parts marketplace allows users to browse, create, and manage listings with photos, category/condition filters, radius-based search, shipping options (pickup only/shipping available/shipping only), pin-based location with privacy jitter (~500m), and "My Listings" management. Listing detail shows approximate location with 2km privacy circle and "Contact Seller" messaging button.
- **Messaging/Inbox:** Server-based messaging system for buyer-seller communication (listing-scoped), friend DMs, and group chats. Inbox tab shows conversations grouped by listing/friend/group, with unread count badges. Compose button opens a friend picker for creating new DMs or group chats (multi-select with optional group naming). Group chat uses per-member `lastReadAt` timestamp tracking on `group_chat_members` table. Chat UI with message bubbles, sender names in group mode, polling for new messages every 10s.
- **Subscription System:** Free and Pro tiers managed via RevenueCat SDK (`react-native-purchases`), initialized in `_layout.tsx` with `initializeRevenueCat()`. Subscription context in `lib/revenuecat.tsx` provides `useSubscription()` hook with `isSubscribed`, `offerings`, `purchase`, `restore`. Entitlement ID: "Lowroute Pro". Pricing: $10 CAD/month, $96 CAD/year (20% off). Paywall at `app/paywall.tsx` shows monthly/yearly plans with RevenueCat offerings (fallback to hardcoded prices). Manage subscription screen at `app/manage-subscription.tsx` (Customer Center). Feature gating checks both server-side `subscriptionTier` and RevenueCat entitlements. RevenueCat integration was set up without the Replit connector — uses `EXPO_PUBLIC_REVENUECAT_API_KEY` env var directly.
- **Admin Panel:** Provides tools for stats, hazard management, user role management (promote/demote), promo code creation, event management, content moderation (Reports tab with review/resolve/dismiss actions), and account management (suspend/unsuspend/ban/delete/cancel-membership per user with search).
- **Content Moderation:** Users can report content via ReportModal (listings, conversations) with 6 reason types. Reports tracked in `reports` table with reporter/target user references, admin review workflow.
- **Account Management:** Password change, forgot password (email reset), account deletion (Apple 5.1.1 compliance), data export (GDPR/CCPA). Legal pages (Privacy Policy, Terms of Service) accessible in-app and via public URLs.
- **Push Notifications:** Expo Push Notification service integration for new messages (DM and group) and friend requests. Token registration on app launch.
- **Safety Disclaimer:** First-launch safety disclaimer screen stored via AsyncStorage, must accept before using app.
- **Offline Handling:** OfflineBanner component using NetInfo (native) and online/offline events (web). React Query retry logic for transient network errors (2 retries with exponential backoff, no retry on 4xx).
- **Security:** Global write rate limiting (60 req/min per user on all POST/PUT/PATCH/DELETE), per-endpoint auth rate limiting (10 attempts/15 min), input sanitization, image magic number validation, file type/size restrictions (10MB max, jpg/png/webp only), session security (secure cookies, httpOnly, sameSite), production CORS configuration.
- **EAS Build:** `eas.json` configured with development, preview, and production profiles for App Store/Play Store submission.
- **App Store Metadata:** Store listing guide at `docs/app-store-listing.md` with descriptions, keywords, categories, screenshots dimensions.

## External Dependencies

- **Google Maps Platform:**
    - Google Maps Directions API (for route calculation)
    - Google Places Autocomplete API (for geocoding input)
    - Google Geocoding API (for precise geocoding)
- **RevenueCat SDK (`react-native-purchases`):** For managing in-app subscriptions (Free and Pro tiers).
- **PostgreSQL:** Primary database.
- **`expo-task-manager`:** For background location tracking and other background tasks.
- **`multer`:** For handling multipart form data, specifically photo uploads.
- **`leaflet`:** JavaScript library for interactive maps on the web platform.
- **`expo-image-picker`:** For accessing device camera and photo library.
- **`expo-speech`:** For text-to-speech functionality in voice navigation.
- **`bcryptjs`:** For hashing user passwords.
- **`express-session`:** Middleware for session management in Express.
- **`connect-pg-simple`:** PostgreSQL session store for `express-session`.
- **`react-native-maps`:** For interactive maps on mobile platforms (pinned to `1.18.0` for Expo Go compatibility).