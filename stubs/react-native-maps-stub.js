const React = require("react");
const { View } = require("react-native");

function Stub() {
  return React.createElement(View, null);
}

module.exports = {
  default: Stub,
  MapView: Stub,
  Marker: Stub,
  Callout: Stub,
  Circle: Stub,
  Polygon: Stub,
  Polyline: Stub,
  Overlay: Stub,
  UrlTile: Stub,
  LocalTile: Stub,
  WMSTile: Stub,
  AnimatedRegion: function () {},
  PROVIDER_DEFAULT: null,
  PROVIDER_GOOGLE: "google",
  MAP_TYPES: {},
};
