---
name: iOS on-device name went stale vs app.json
description: Apple 2.3.8 rejection — home-screen name didn't match a renamed app.json; fix by explicitly pinning CFBundleDisplayName
---

# iOS on-device app name can lag behind `app.json` `expo.name`

Apple rejected a build under **Guideline 2.3.8 (Accurate Metadata)** because the
home-screen (SpringBoard) label showed the **old** app name even though
`app.json` `expo.name` had already been changed to the new name, with **no**
native overrides (no committed `ios/` folder, no `CFBundleDisplayName`, no
config plugin touching the name). The reviewed binary had the old name baked in
— a stale/derived value from an earlier prebuild in the EAS/Expo Launch
pipeline.

**Rule:** When renaming an Expo app, don't rely solely on `expo.name` to drive
the iOS home-screen label. Explicitly pin it in `app.json`:
`expo.ios.infoPlist.CFBundleDisplayName` (and optionally `CFBundleName`) to the
new name.

**Why:** `CFBundleDisplayName` is what SpringBoard shows. Leaving it derived
lets a cached prebuild keep the old value, which Apple flags as a
marketplace-vs-device name mismatch. Spaces in these values are fine; they need
NOT match the bundle identifier.

**How to apply:** Any time the user reports the app icon label is wrong after a
rename, or Apple cites 2.3.8 "Name displayed on the device", set
`CFBundleDisplayName` explicitly, rebuild with a fresh build number, and verify
the installed icon label before resubmitting.
