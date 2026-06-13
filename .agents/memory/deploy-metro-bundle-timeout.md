---
name: Deploy Metro bundle timeout
description: Why "failed to publish" with a Metro "Download timeout" is a cold-build slowness issue, not broken code
---

# Deploy "failed to publish" → Metro bundle download timeout

When a publish fails with logs like `Download timeout after Nm: http://localhost:8081/node_modules/expo-router/entry.bundle?...` and progress shown at ~71–80%, the static build (`scripts/build.js`) is aborting the iOS/Android Metro bundle fetch because the per-download / overall download timeout was too short.

**Why:** The deploy builder runs Metro **cold** (the script clears Metro cache before building) on more constrained CPU than the dev workspace. A cold cross-platform (iOS + Android, fetched in parallel) bundle takes much longer than a warm one. Reproducing the pipeline locally will *pass* because the `Start Frontend` workflow keeps Metro warm — so the failure is not reproducible locally and the code is not broken.

**How to apply:** Don't rewrite the build. Raise the download timeouts in `scripts/build.js` (single `DOWNLOAD_TIMEOUT_MS` constant feeds the per-file `downloadFile` AbortController, the per-manifest `downloadManifest` AbortController, and the overall `Promise.race` in `main()`). 15m is comfortable headroom for a build that hit ~75% at 5m. Note `startMetro()` has a separate 60s readiness cap that could bite on very slow builders. Also: `server_dist/` is tracked in git (a build artifact) and is often stale vs a fresh esbuild — the deploy rebuilds it, so its staleness is not the failure.
