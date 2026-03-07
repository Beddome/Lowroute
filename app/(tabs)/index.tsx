import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Animated,
  ScrollView,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { SEVERITY_TIERS, HAZARD_TYPES } from "@/shared/types";
import type { Hazard } from "@/shared/types";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function HazardMarker({ hazard, onPress }: { hazard: Hazard; onPress: () => void }) {
  const tier = SEVERITY_TIERS[hazard.severity - 1];
  const size = hazard.severity >= 3 ? 36 : 30;
  return (
    <Marker
      coordinate={{ latitude: hazard.lat, longitude: hazard.lng }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View
        style={[
          styles.markerContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tier?.color ?? Colors.tier1,
            borderColor: "rgba(0,0,0,0.6)",
          },
        ]}
      >
        <Ionicons
          name={hazard.severity >= 4 ? "skull" : hazard.severity >= 3 ? "warning" : "alert-circle-outline"}
          size={size * 0.55}
          color="#000"
        />
      </View>
    </Marker>
  );
}

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface RouteOption {
  id: string;
  label: string;
  description: string;
  estimatedMinutes: number;
  timePenaltyMinutes: number;
  riskScore: number;
  highestSeverity: number;
  totalHazards: number;
  hazards: Hazard[];
  waypoints: Array<{ lat: number; lng: number }>;
}

async function geocode(query: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
  const res = await fetch(url, { headers: { "User-Agent": "LowRoute/1.0" } });
  return res.json();
}

const ROUTE_COLORS = ["#60A5FA", "#34D399", "#FBBF24"];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [locationGranted, setLocationGranted] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 34.0522,
    longitude: -118.2437,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeSearchField, setActiveSearchField] = useState<"origin" | "dest" | null>(null);
  const [geocodeResults, setGeocodeResults] = useState<GeoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  const panelExpanded = useRef(new Animated.Value(0)).current;
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: hazards = [] } = useQuery<Hazard[]>({
    queryKey: ["/api/hazards"],
  });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        setLocationGranted(true);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        setMapRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      }
    })();
  }, []);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchInput = (text: string, field: "origin" | "dest") => {
    if (field === "origin") setOriginText(text);
    else setDestText(text);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.length < 3) {
      setGeocodeResults([]);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await geocode(text);
        setGeocodeResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 600);
  };

  const selectGeoResult = (result: GeoResult) => {
    const coords = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    const shortName = result.display_name.split(",")[0];
    if (activeSearchField === "origin") {
      setOriginText(shortName);
      setOriginCoords(coords);
    } else {
      setDestText(shortName);
      setDestCoords(coords);
    }
    setGeocodeResults([]);
    setActiveSearchField(null);
    Haptics.selectionAsync();
  };

  const calculateRoutes = useCallback(async () => {
    if (!originCoords || !destCoords) return;
    setIsRoutingLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/routes", baseUrl);
      url.searchParams.set("startLat", String(originCoords.lat));
      url.searchParams.set("startLng", String(originCoords.lng));
      url.searchParams.set("endLat", String(destCoords.lat));
      url.searchParams.set("endLng", String(destCoords.lng));
      const res = await fetch(url.toString(), { credentials: "include" });
      const data = await res.json();
      setRoutes(data);
      setSelectedRouteIdx(1);
      setPanelOpen(true);
      Animated.spring(panelExpanded, { toValue: 1, useNativeDriver: false }).start();

      const centerLat = (originCoords.lat + destCoords.lat) / 2;
      const centerLng = (originCoords.lng + destCoords.lng) / 2;
      const latDelta = Math.abs(originCoords.lat - destCoords.lat) * 2.5;
      const lngDelta = Math.abs(originCoords.lng - destCoords.lng) * 2.5;
      mapRef.current?.animateToRegion({
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: Math.max(latDelta, 0.04),
        longitudeDelta: Math.max(lngDelta, 0.04),
      }, 800);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRoutingLoading(false);
    }
  }, [originCoords, destCoords]);

  useEffect(() => {
    if (originCoords && destCoords) {
      calculateRoutes();
    }
  }, [originCoords, destCoords]);

  const clearRoute = () => {
    setOriginText("");
    setDestText("");
    setOriginCoords(null);
    setDestCoords(null);
    setRoutes([]);
    setPanelOpen(false);
    Animated.spring(panelExpanded, { toValue: 0, useNativeDriver: false }).start();
  };

  const selectedRoute = routes[selectedRouteIdx] ?? null;
  const topPadding = Platform.OS === "web" ? 67 : 0;

  const bottomPanelHeight = panelOpen ? 260 : 180;
  const fabBottom = insets.bottom + bottomPanelHeight + 16;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        showsCompass={false}
        userInterfaceStyle="dark"
        onPress={() => {
          setActiveSearchField(null);
          setGeocodeResults([]);
        }}
      >
        {hazards
          .filter((h) => !selectedRoute || selectedRoute.hazards.some((sh) => sh.id === h.id))
          .map((h) => (
            <HazardMarker
              key={h.id}
              hazard={h}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/hazard/[id]", params: { id: h.id } });
              }}
            />
          ))}

        {originCoords && (
          <Marker coordinate={{ latitude: originCoords.lat, longitude: originCoords.lng }}>
            <View style={styles.originPin}>
              <Ionicons name="radio-button-on" size={22} color={Colors.accent} />
            </View>
          </Marker>
        )}
        {destCoords && (
          <Marker coordinate={{ latitude: destCoords.lat, longitude: destCoords.lng }}>
            <View style={styles.destPin}>
              <Ionicons name="location" size={24} color={Colors.tier4} />
            </View>
          </Marker>
        )}

        {selectedRoute?.waypoints && selectedRoute.waypoints.length >= 2 && (
          <Polyline
            coordinates={selectedRoute.waypoints.map((w) => ({ latitude: w.lat, longitude: w.lng }))}
            strokeColor={ROUTE_COLORS[selectedRouteIdx] ?? Colors.accent}
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Top search panel */}
      <View
        style={[
          styles.topPanel,
          { top: insets.top + topPadding + 12, marginHorizontal: 16 },
        ]}
      >
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <View style={styles.searchDots}>
              <View style={[styles.dot, { backgroundColor: Colors.accent }]} />
              <View style={styles.dotLine} />
              <View style={[styles.dot, { backgroundColor: Colors.tier4, borderRadius: 3 }]} />
            </View>
            <View style={styles.searchInputsCol}>
              <TextInput
                style={styles.searchInput}
                placeholder="Starting point..."
                placeholderTextColor={Colors.textMuted}
                value={originText}
                onChangeText={(t) => handleSearchInput(t, "origin")}
                onFocus={() => setActiveSearchField("origin")}
                returnKeyType="search"
              />
              <View style={styles.searchDivider} />
              <TextInput
                style={styles.searchInput}
                placeholder="Destination..."
                placeholderTextColor={Colors.textMuted}
                value={destText}
                onChangeText={(t) => handleSearchInput(t, "dest")}
                onFocus={() => setActiveSearchField("dest")}
                returnKeyType="search"
              />
            </View>
            <View style={styles.searchActions}>
              {routes.length > 0 ? (
                <Pressable onPress={clearRoute} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </Pressable>
              ) : isRoutingLoading ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <Pressable
                  onPress={() => {
                    if (userLocation) {
                      setOriginText("My Location");
                      setOriginCoords({ lat: userLocation.latitude, lng: userLocation.longitude });
                    }
                  }}
                  style={styles.actionBtn}
                  hitSlop={8}
                >
                  <Ionicons name="locate" size={20} color={Colors.accent} />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Geocode results dropdown */}
        {geocodeResults.length > 0 && (
          <View style={styles.geocodeDropdown}>
            {isSearching && (
              <View style={styles.geocodeSearching}>
                <ActivityIndicator size="small" color={Colors.accent} />
              </View>
            )}
            {geocodeResults.map((r, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.geocodeItem, pressed && { opacity: 0.7 }]}
                onPress={() => selectGeoResult(r)}
              >
                <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.geocodeText} numberOfLines={2}>
                  {r.display_name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Location button */}
      {locationGranted && (
        <Pressable
          style={[styles.locBtn, { bottom: fabBottom + 52, right: 16 }]}
          onPress={() => {
            if (userLocation) {
              mapRef.current?.animateToRegion(
                { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 },
                500
              );
            }
          }}
        >
          <Ionicons name="navigate" size={20} color={Colors.text} />
        </Pressable>
      )}

      {/* Report FAB */}
      <Pressable
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const lat = userLocation?.latitude ?? mapRegion.latitude;
          const lng = userLocation?.longitude ?? mapRegion.longitude;
          router.push({ pathname: "/report", params: { lat: String(lat), lng: String(lng) } });
        }}
      >
        <Ionicons name="warning" size={22} color={Colors.bg} />
        <Text style={styles.fabLabel}>Report</Text>
      </Pressable>

      {/* Bottom panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 80 }]}>
        {routes.length > 0 ? (
          <RoutePanel
            routes={routes}
            selectedIdx={selectedRouteIdx}
            onSelect={(i) => {
              setSelectedRouteIdx(i);
              Haptics.selectionAsync();
            }}
          />
        ) : (
          <TierLegend hazards={hazards} />
        )}
      </View>
    </View>
  );
}

function RoutePanel({
  routes,
  selectedIdx,
  onSelect,
}: {
  routes: RouteOption[];
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  return (
    <View style={styles.routePanel}>
      <Text style={styles.routePanelTitle}>Route Options</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        {routes.map((route, i) => {
          const tier = route.highestSeverity > 0 ? SEVERITY_TIERS[route.highestSeverity - 1] : null;
          const isSelected = i === selectedIdx;
          return (
            <Pressable
              key={route.id}
              style={[
                styles.routeCard,
                isSelected && {
                  borderColor: ROUTE_COLORS[i] ?? Colors.accent,
                  backgroundColor: Colors.bgElevated,
                },
              ]}
              onPress={() => onSelect(i)}
            >
              <View style={[styles.routeColorDot, { backgroundColor: ROUTE_COLORS[i] ?? Colors.accent }]} />
              <Text style={[styles.routeLabel, isSelected && { color: Colors.text }]}>{route.label}</Text>
              <Text style={styles.routeTime}>
                {route.estimatedMinutes + route.timePenaltyMinutes} min
              </Text>
              <View style={styles.routeStats}>
                <View style={styles.routeStat}>
                  <Ionicons name="warning-outline" size={12} color={tier?.color ?? Colors.textMuted} />
                  <Text style={[styles.routeStatText, { color: tier?.color ?? Colors.textMuted }]}>
                    {route.totalHazards} hazards
                  </Text>
                </View>
                {route.timePenaltyMinutes > 0 && (
                  <View style={styles.routeStat}>
                    <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.routeStatText}>+{route.timePenaltyMinutes}m risk</Text>
                  </View>
                )}
              </View>
              {tier && (
                <View style={[styles.routeTierBadge, { backgroundColor: tier.bg, borderColor: tier.color }]}>
                  <Text style={[styles.routeTierText, { color: tier.color }]}>
                    T{route.highestSeverity} Max
                  </Text>
                </View>
              )}
              {route.totalHazards === 0 && (
                <View style={[styles.routeTierBadge, { backgroundColor: "#052e16", borderColor: Colors.tier1 }]}>
                  <Text style={[styles.routeTierText, { color: Colors.tier1 }]}>Clear</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {routes[selectedIdx] && (
        <View style={styles.routeSummary}>
          <View style={styles.routeSummaryItem}>
            <Ionicons name="speedometer-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.routeSummaryText}>
              Risk score: {routes[selectedIdx].riskScore}
            </Text>
          </View>
          <View style={styles.routeSummaryItem}>
            <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.routeSummaryText}>
              {routes[selectedIdx].estimatedMinutes} base · +{routes[selectedIdx].timePenaltyMinutes}m risk
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function TierLegend({ hazards }: { hazards: Hazard[] }) {
  return (
    <View style={styles.legendPanel}>
      <View style={styles.legendHeader}>
        <Text style={styles.legendTitle}>Hazard Legend</Text>
        <Text style={styles.legendCount}>{hazards.length} active reports</Text>
      </View>
      <View style={styles.legendGrid}>
        {SEVERITY_TIERS.map((tier) => {
          const count = hazards.filter((h) => h.severity === tier.tier).length;
          return (
            <View key={tier.tier} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: tier.color }]}>
                <Text style={styles.legendTierNum}>{tier.tier}</Text>
              </View>
              <View style={styles.legendItemText}>
                <Text style={[styles.legendLabel, { color: tier.color }]}>{tier.label}</Text>
                <Text style={styles.legendDesc}>{tier.description}</Text>
              </View>
              <Text style={[styles.legendCount2, count > 0 ? { color: tier.color } : {}]}>{count}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  originPin: { alignItems: "center", justifyContent: "center" },
  destPin: { alignItems: "center", justifyContent: "center" },

  topPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 100,
  },
  searchCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchDots: { alignItems: "center", width: 14, gap: 3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLine: { width: 2, height: 22, backgroundColor: Colors.border, borderRadius: 1 },
  searchInputsCol: { flex: 1, gap: 0 },
  searchInput: {
    height: 38,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  searchDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 0 },
  searchActions: { alignItems: "center", justifyContent: "center", width: 32 },
  actionBtn: { padding: 4 },

  geocodeDropdown: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  geocodeSearching: { padding: 12, alignItems: "center" },
  geocodeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  geocodeText: { flex: 1, color: Colors.text, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  locBtn: {
    position: "absolute",
    right: 0,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },

  fab: {
    position: "absolute",
    right: 16,
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabLabel: { color: Colors.bg, fontSize: 14, fontFamily: "Inter_700Bold" },

  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },

  routePanel: { padding: 16 },
  routePanelTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 },
  routeCard: {
    width: 130,
    marginRight: 10,
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 4,
  },
  routeColorDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  routeLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.textSecondary },
  routeTime: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  routeStats: { gap: 2, marginTop: 2 },
  routeStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  routeStatText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  routeTierBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  routeTierText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  routeSummary: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  routeSummaryItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeSummaryText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  legendPanel: { padding: 16 },
  legendHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  legendTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 },
  legendCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  legendItem: {
    flex: 1,
    minWidth: "44%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    padding: 8,
  },
  legendDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  legendTierNum: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#000" },
  legendItemText: { flex: 1 },
  legendLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  legendDesc: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  legendCount2: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.textMuted },
});
