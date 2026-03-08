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
- **Subscription System:** Free and Pro tiers managed via RevenueCat SDK, gating features like live navigation and hazard alerts.
- **Admin Panel:** Provides tools for stats, hazard management, user role management, promo code creation, and event management.
- **Security:** Implements rate limiting on auth endpoints, robust input validation, and secure storage of API keys.

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