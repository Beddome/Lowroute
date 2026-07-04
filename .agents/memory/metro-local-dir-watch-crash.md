---
name: Metro crashes watching .local ephemeral dirs
description: Expo dev server (Start Frontend) crashes on boot with ENOENT watch errors on .local/state/workflow-logs; fix is a metro blockList exclusion.
---

# Metro fatal watch crash on `.local/state/workflow-logs`

Symptom: `Start Frontend` (Expo/Metro) crashes on startup with a fatal
`Error: ENOENT: no such file or directory, watch '.../.local/state/workflow-logs/<id>'`
from `metro-file-map` FallbackWatcher, killing the Node process. It reproduces
reliably when workflows are being restarted (those log dirs are ephemeral and get
deleted mid-crawl, so `fs.watch()` races and throws).

Fix: exclude `.local` from Metro's file map via `config.resolver.blockList` in
`metro.config.js` (append a `/[/\\]\.local[/\\].*/` regex, preserving any existing
blockList as array or single regex). After this, Metro no longer watches those
churning dirs and boots cleanly.

**Why:** No watchman is installed in this environment, so Metro uses the fallback
recursive watcher which is not resilient to a directory vanishing between crawl and
watch. `.local` holds agent/workflow ephemeral state, never app source, so excluding
it is safe.

**How to apply:** If the Expo frontend won't boot and the log shows an ENOENT
`watch` error under `.local`, add/verify the blockList exclusion rather than just
retrying the restart (retrying alone does not fix it).
