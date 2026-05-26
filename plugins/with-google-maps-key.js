const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

module.exports = function withGoogleMapsKey(config) {
  return withAndroidManifest(config, (cfg) => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      console.warn(
        "[with-google-maps-key] GOOGLE_MAPS_API_KEY env var not set. " +
          "Skipping Android Google Maps key injection. " +
          "Native Android maps will not render until this secret is provided to the build environment."
      );
      return cfg;
    }
    const mainApp = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApp,
      "com.google.android.geo.API_KEY",
      key
    );
    console.log("[with-google-maps-key] Injected Google Maps Android API key into AndroidManifest.");
    return cfg;
  });
};
