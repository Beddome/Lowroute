import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

if (process.env.EAS_BUILD && !process.env.GOOGLE_MAPS_API_KEY) {
  throw new Error(
    "GOOGLE_MAPS_API_KEY is required for EAS builds. " +
    "Set it with: eas secret:create --name GOOGLE_MAPS_API_KEY --value <your-key>"
  );
}

const config: ExpoConfig = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
      },
    },
  },
};

export default config;
