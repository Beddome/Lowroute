#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const APP_JSON = path.resolve(__dirname, "..", "app.json");
const KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!KEY) {
  console.warn(
    "[inject-google-maps-key] GOOGLE_MAPS_API_KEY env var not set. " +
      "Skipping Android Google Maps key injection. " +
      "Native Android maps will fail to render in this build."
  );
  process.exit(0);
}

const raw = fs.readFileSync(APP_JSON, "utf8");
const cfg = JSON.parse(raw);

cfg.expo = cfg.expo || {};
cfg.expo.android = cfg.expo.android || {};
cfg.expo.android.config = cfg.expo.android.config || {};
cfg.expo.android.config.googleMaps = { apiKey: KEY };

fs.writeFileSync(APP_JSON, JSON.stringify(cfg, null, 2) + "\n", "utf8");
console.log("[inject-google-maps-key] Injected Google Maps Android key into app.json");
