---
name: Apple 2.3.10 store references in binary
description: Apple rejects iOS apps whose binary/UI text mentions "Google Play"; cross-platform store wording must be platform-gated.
---

# Apple Guideline 2.3.10 — third-party store references in the binary

Apple App Review flags ANY user-visible mention of "Google Play" / "Play Store" in
the iOS **binary** (not just screenshots) under Guideline 2.3.10. For a cross-platform
Expo app, every store-name string shown in the UI must be `Platform.OS`-gated so an
iPhone/iPad only ever sees "App Store" while Android sees "Google Play".

**Why:** True Maps was rejected twice on metadata grounds; the second cited the binary
explicitly ("Revise the app's binary to remove Google Play references"). Static strings
in the paywall, manage-subscription, and terms-of-service screens were the cause.

**How to apply:** When adding subscription/legal/store copy, never hardcode
"App Store or Google Play". Use a `Platform.OS === "ios" ? "App Store" : "Google Play"`
(three-way with a web fallback) conditional. Data-driven labels (e.g. RevenueCat's
purchase `store` field) and Android-only branches are fine — they won't render
"Google Play" on iOS. Public web legal pages (server templates) are separate from the
binary and may mention both stores.
