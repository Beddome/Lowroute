---
name: Blank paywall / sheet on iOS
description: Why a screen renders blank on iOS even though its JS never returns empty, and how to fix it
---

# Blank paywall (or any sheet) on iOS

A screen that renders blank on a native iOS build — while the JS component has no
code path that returns null/empty (it has an ErrorBoundary fallback, a loading
state, and fallback data) — is almost always a **native presentation-layer**
problem, not a JS problem.

The recurring offender is `presentation: "formSheet"` (with `sheetAllowedDetents` /
`sheetGrabberVisible`) in Expo Router's `Stack.Screen`. With the New Architecture +
`react-native-screens` 4.x it can present an **empty sheet** that shows none of the
screen's content.

**Fix:** switch that screen to `presentation: "modal"` (or `"fullScreenModal"`),
which is reliable in this app — the `(auth)` screen already uses `"modal"`.

**Why this matters:** the paywall blank-screen bug was "fixed" multiple times by
adding *JS-level* hardening (ErrorBoundary, watchdog timeout, fallback pricing).
None of that can fix a blank sheet because the JS was never the cause — the content
just never mounts inside the native sheet. If a blank-screen report survives JS
hardening, suspect the presentation type next, not more try/catch.

**How to apply:** when a user reports a specific screen is blank on iOS, check its
`Stack.Screen` `presentation` in `app/_layout.tsx` first. If it's `formSheet`,
that's the prime suspect. Confirm the screen's JS has no empty render path before
blaming code. Other `formSheet` screens (e.g. car-profile, hazard/[id],
event-detail) are candidates for the same fix if reported blank — check the actual
`presentation` in `app/_layout.tsx` since some screens use `fullScreenModal`.

Note: this also fails on web — `formSheet` is not supported there, and direct
URL loads of a route 404 from the Express static server (no SPA fallback).
