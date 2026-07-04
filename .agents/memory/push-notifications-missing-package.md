---
name: Push notifications silently dead — package not installed
description: Why a fully-coded push feature never worked; the underlying native package was missing.
---

The push-notification feature (server senders, client register, token column, /api/push-token route) was fully coded, yet no notification ever fired. Root cause: `expo-notifications` was **not installed** at all — `lib/notifications.ts` loads it via `await import("expo-notifications")` inside a try/catch that returns `null` on failure, so registration silently no-oped forever.

**Why:** A dynamic `import()` guarded by try/catch hides a missing dependency. "The code imports it" is not "the package is installed."

**How to apply:** When a native/optional feature "is implemented but does nothing," first verify the package actually exists (`ls node_modules/<pkg>`), not just that it's imported. For Expo, install the SDK-matched version — look it up in `node_modules/expo/bundledNativeModules.json` (SDK 54 → `expo-notifications ~0.32.16`) rather than guessing.

Secondary gotchas fixed alongside:
- `getExpoPushTokenAsync({ projectId: undefined })` fails in real builds — pass the real EAS id from `Constants.expoConfig.extra.eas.projectId`.
- Register the push token on **session restore**, not just fresh login, or returning users never get a token.
- Remote push does not work in Expo Go / web — only real dev/production builds.
