import { ExpoConfig, ConfigContext } from "expo/config";
import appJson from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = appJson.expo as ExpoConfig;

  return {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      config: {
        ...((baseConfig.android as any)?.config ?? {}),
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
        },
      },
    },
  };
};
