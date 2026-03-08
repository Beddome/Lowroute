import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { SEVERITY_TIERS, HAZARD_TYPES, EVENT_TYPES } from "@/shared/types";
import type { Hazard, AppEvent } from "@/shared/types";
import { getApiUrl } from "@/lib/query-client";

const EVENT_COLOR = "#8B5CF6";
const ROUTE_COLORS = ["#60A5FA", "#34D399", "#FBBF24"];

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
  distanceKm?: number;
  timePenaltyMinutes: number;
  riskScore: number;
  highestSeverity: number;
  totalHazards: number;
  hazards: Hazard[];
  waypoints: Array<{ lat: number; lng: number }>;
}

function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MapScreenWeb() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const hazardMarkersRef = useRef<any[]>([]);
  const eventMarkersRef = useRef<any[]>([]);
  const routePolylinesRef = useRef<any[]>([]);
  const originMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

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

  const [showEvents, setShowEvents] = useState(true);
  const [mapBounds, setMapBounds] = useState({
    minLat: 49.5,
    maxLat: 49.9,
    minLng: -113.0,
    maxLng: -112.7,
  });

  const { data: hazards = [] } = useQuery<Hazard[]>({
    queryKey: ["/api/hazards"],
  });

  const { data: events = [] } = useQuery<AppEvent[]>({
    queryKey: [
      "/api/events",
      `minLat=${mapBounds.minLat.toFixed(4)}`,
      `maxLat=${mapBounds.maxLat.toFixed(4)}`,
      `minLng=${mapBounds.minLng.toFixed(4)}`,
      `maxLng=${mapBounds.maxLng.toFixed(4)}`,
    ],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/events", baseUrl);
      url.searchParams.set("minLat", mapBounds.minLat.toFixed(4));
      url.searchParams.set("maxLat", mapBounds.maxLat.toFixed(4));
      url.searchParams.set("minLng", mapBounds.minLng.toFixed(4));
      url.searchParams.set("maxLng", mapBounds.maxLng.toFixed(4));
      const res = await globalThis.fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showEvents,
  });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const style = document.createElement("style");
    style.textContent = `
      @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
      .leaflet-container { background: #0A0A0B !important; }
      .leaflet-control-zoom a { background: #111114 !important; color: #F5F5F5 !important; border-color: #2A2A32 !important; }
      .leaflet-control-zoom a:hover { background: #1A1A1F !important; }
      .leaflet-control-attribution { background: rgba(10,10,11,0.8) !important; color: #5A5A6A !important; font-size: 10px !important; }
      .leaflet-control-attribution a { color: #9A9AAF !important; }
      .leaflet-popup-content-wrapper { background: #111114 !important; color: #F5F5F5 !important; border: 1px solid #2A2A32 !important; border-radius: 12px !important; }
      .leaflet-popup-tip { background: #111114 !important; }
      .leaflet-popup-content { margin: 10px 14px !important; font-family: system-ui, -apple-system, sans-serif !important; }
      .hazard-popup-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
      .hazard-popup-type { font-size: 12px; color: #9A9AAF; margin-bottom: 6px; }
      .hazard-popup-meta { font-size: 11px; color: #5A5A6A; }
      .hazard-popup-link { color: #F59E0B; text-decoration: none; font-size: 12px; font-weight: 600; cursor: pointer; }
      .hazard-popup-link:hover { text-decoration: underline; }
      .event-popup-title { font-weight: 700; font-size: 14px; color: #8B5CF6; margin-bottom: 4px; }
      .event-popup-type { font-size: 12px; color: #9A9AAF; margin-bottom: 6px; }
      .event-popup-link { color: #8B5CF6; text-decoration: none; font-size: 12px; font-weight: 600; cursor: pointer; }
      .event-popup-link:hover { text-decoration: underline; }
    `;
    document.head.appendChild(style);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const initMap = async () => {
      const L = await import("leaflet");
      leafletRef.current = L;

      const map = L.map(mapContainerRef.current!, {
        center: [49.6935, -112.8418],
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("moveend", () => {
        const bounds = map.getBounds();
        setMapBounds({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
        });
      });

      map.on("contextmenu", (e: any) => {
        const { lat, lng } = e.latlng;
        router.push({ pathname: "/report", params: { lat: String(lat), lng: String(lng) } });
      });

      mapInstanceRef.current = map;

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 13);
          },
          () => {}
        );
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    hazardMarkersRef.current.forEach((m) => map.removeLayer(m));
    hazardMarkersRef.current = [];

    hazards.forEach((h) => {
      const tier = SEVERITY_TIERS[h.severity - 1];
      const hazardType = HAZARD_TYPES.find((t) => t.value === h.type);
      const size = h.severity >= 3 ? 18 : 14;

      const marker = L.circleMarker([h.lat, h.lng], {
        radius: size,
        fillColor: tier?.color ?? Colors.tier1,
        color: "rgba(0,0,0,0.6)",
        weight: 2,
        fillOpacity: 0.9,
      }).addTo(map);

      const popupContent = `
        <div>
          <div class="hazard-popup-title">${escapeHtml(h.title)}</div>
          <div class="hazard-popup-type">${escapeHtml(hazardType?.label ?? h.type)} &middot; T${h.severity} ${escapeHtml(tier?.label ?? "")}</div>
          <div class="hazard-popup-meta">${formatRelativeTime(h.createdAt)} &middot; ${h.upvotes} upvotes</div>
          <div style="margin-top:8px"><a class="hazard-popup-link" data-hazard-id="${escapeHtml(h.id)}">View Details</a></div>
        </div>
      `;
      marker.bindPopup(popupContent);

      marker.on("popupopen", () => {
        setTimeout(() => {
          const el = document.querySelector(`[data-hazard-id="${h.id}"]`);
          if (el) {
            el.addEventListener("click", (e) => {
              e.preventDefault();
              router.push({ pathname: "/hazard/[id]", params: { id: h.id } });
            });
          }
        }, 50);
      });

      hazardMarkersRef.current.push(marker);
    });
  }, [hazards]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    eventMarkersRef.current.forEach((m) => map.removeLayer(m));
    eventMarkersRef.current = [];

    if (!showEvents) return;

    events
      .filter((e) => e.status !== "cancelled")
      .forEach((e) => {
        const eventType = EVENT_TYPES.find((t) => t.value === e.eventType);

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${EVENT_COLOR};border:2px solid rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([e.lat, e.lng], { icon }).addTo(map);

        const popupContent = `
          <div>
            <div class="event-popup-title">${escapeHtml(e.title)}</div>
            <div class="event-popup-type">${escapeHtml(eventType?.label ?? e.eventType)}</div>
            <div class="hazard-popup-meta">${e.rsvpCount} RSVPs</div>
            <div style="margin-top:8px"><a class="event-popup-link" data-event-id="${escapeHtml(e.id)}">View Details</a></div>
          </div>
        `;
        marker.bindPopup(popupContent);

        marker.on("popupopen", () => {
          setTimeout(() => {
            const el = document.querySelector(`[data-event-id="${e.id}"]`);
            if (el) {
              el.addEventListener("click", (ev) => {
                ev.preventDefault();
                router.push({ pathname: "/event-detail", params: { id: e.id } });
              });
            }
          }, 50);
        });

        eventMarkersRef.current.push(marker);
      });
  }, [events, showEvents]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    routePolylinesRef.current.forEach((p) => map.removeLayer(p));
    routePolylinesRef.current = [];

    if (originMarkerRef.current) {
      map.removeLayer(originMarkerRef.current);
      originMarkerRef.current = null;
    }
    if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    if (originCoords) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${Colors.accent};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      originMarkerRef.current = L.marker([originCoords.lat, originCoords.lng], { icon }).addTo(map);
    }

    if (destCoords) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${Colors.tier4};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      destMarkerRef.current = L.marker([destCoords.lat, destCoords.lng], { icon }).addTo(map);
    }

    routes.forEach((route, i) => {
      if (!route.waypoints || route.waypoints.length < 2) return;
      const coords: [number, number][] = route.waypoints.map((w) => [w.lat, w.lng]);
      const isSelected = i === selectedRouteIdx;
      const polyline = L.polyline(coords, {
        color: ROUTE_COLORS[i] ?? Colors.accent,
        weight: isSelected ? 6 : 3,
        opacity: isSelected ? 1 : 0.3,
      }).addTo(map);
      routePolylinesRef.current.push(polyline);
    });

    if (routes.length > 0 && originCoords && destCoords) {
      const centerLat = (originCoords.lat + destCoords.lat) / 2;
      const centerLng = (originCoords.lng + destCoords.lng) / 2;
      const latDelta = Math.abs(originCoords.lat - destCoords.lat) * 1.5;
      const lngDelta = Math.abs(originCoords.lng - destCoords.lng) * 1.5;
      map.fitBounds([
        [centerLat - latDelta / 2, centerLng - lngDelta / 2],
        [centerLat + latDelta / 2, centerLng + lngDelta / 2],
      ]);
    }
  }, [routes, selectedRouteIdx, originCoords, destCoords]);

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
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=5`;
        const res = await globalThis.fetch(url, { headers: { "User-Agent": "LowRoute/1.0" } });
        const results = await res.json();
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

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 14);
    }
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
      const res = await globalThis.fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const routeList = data.routes || data;
      if (!Array.isArray(routeList) || routeList.length === 0) return;
      setRoutes(routeList);
      setSelectedRouteIdx(routeList.length > 1 ? 1 : 0);
    } catch (e) {
      console.error("Route calculation error:", e);
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
  };

  const useMyLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setOriginText("My Location");
        setOriginCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  };

  const selectedRoute = routes[selectedRouteIdx] ?? null;

  return (
    <View style={styles.container}>
      <View
        ref={(ref) => {
          if (ref) {
            const node = ref as unknown as HTMLDivElement;
            mapContainerRef.current = node;
          }
        }}
        style={styles.mapContainer}
      />

      <View style={styles.topPanel}>
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
                <Pressable onPress={useMyLocation} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="locate" size={20} color={Colors.accent} />
                </Pressable>
              )}
            </View>
          </View>
        </View>

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

      <View style={styles.fabGroup}>
        <Pressable
          style={styles.fabEvent}
          onPress={() => {
            const center = mapInstanceRef.current?.getCenter();
            const lat = center?.lat ?? 49.6935;
            const lng = center?.lng ?? -112.8418;
            router.push({ pathname: "/create-event", params: { lat: String(lat), lng: String(lng) } });
          }}
        >
          <Ionicons name="calendar" size={20} color="#fff" />
          <Text style={styles.fabEventLabel}>Event</Text>
        </Pressable>
        <Pressable
          style={styles.fab}
          onPress={() => {
            const center = mapInstanceRef.current?.getCenter();
            const lat = center?.lat ?? 49.6935;
            const lng = center?.lng ?? -112.8418;
            router.push({ pathname: "/report", params: { lat: String(lat), lng: String(lng) } });
          }}
        >
          <Ionicons name="warning" size={22} color={Colors.bg} />
          <Text style={styles.fabLabel}>Report</Text>
        </Pressable>
      </View>

      <View style={styles.bottomPanel}>
        {routes.length > 0 ? (
          <View style={styles.routePanel}>
            <View style={styles.routePanelHeader}>
              <Text style={styles.routePanelTitle}>Route Options</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {routes.map((route, i) => {
                const tier = route.highestSeverity > 0 ? SEVERITY_TIERS[route.highestSeverity - 1] : null;
                const isSelected = i === selectedRouteIdx;
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
                    onPress={() => setSelectedRouteIdx(i)}
                  >
                    <View style={[styles.routeColorDot, { backgroundColor: ROUTE_COLORS[i] ?? Colors.accent }]} />
                    <Text style={[styles.routeLabel, isSelected && { color: Colors.text }]}>{route.label}</Text>
                    <Text style={styles.routeTime}>
                      {route.estimatedMinutes + route.timePenaltyMinutes} min
                      {route.distanceKm ? ` · ${route.distanceKm} km` : ""}
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
            {selectedRoute && (
              <View style={styles.routeSummary}>
                <View style={styles.routeSummaryItem}>
                  <Ionicons name="speedometer-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.routeSummaryText}>
                    Risk score: {selectedRoute.riskScore}
                  </Text>
                </View>
                <View style={styles.routeSummaryItem}>
                  <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.routeSummaryText}>
                    {selectedRoute.estimatedMinutes} base · +{selectedRoute.timePenaltyMinutes}m risk
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
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
            <View style={styles.eventsToggleRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: EVENT_COLOR }]}>
                  <Ionicons name="calendar" size={14} color="#fff" />
                </View>
                <View style={styles.legendItemText}>
                  <Text style={[styles.legendLabel, { color: EVENT_COLOR }]}>Events</Text>
                  <Text style={styles.legendDesc}>{events.length} nearby</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setShowEvents((v) => !v)}
                style={[styles.eventsToggleBtn, showEvents && styles.eventsToggleBtnActive]}
                hitSlop={8}
              >
                <Ionicons name={showEvents ? "eye" : "eye-off"} size={16} color={showEvents ? EVENT_COLOR : Colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.rightClickHint}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.hintText}>Right-click on map to report a hazard at that location</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  mapContainer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  topPanel: {
    position: "absolute" as const,
    top: 67 + 12,
    left: 16,
    right: 16,
    zIndex: 1000,
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
  },
  searchRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  searchDots: { alignItems: "center" as const, width: 14, gap: 3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLine: { width: 2, height: 22, backgroundColor: Colors.border, borderRadius: 1 },
  searchInputsCol: { flex: 1, gap: 0 },
  searchInput: {
    height: 38,
    color: Colors.text,
    fontSize: 14,
  },
  searchDivider: { height: 1, backgroundColor: Colors.border },
  searchActions: { alignItems: "center" as const, justifyContent: "center" as const, width: 32 },
  actionBtn: { padding: 4 },

  geocodeDropdown: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    overflow: "hidden" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  geocodeSearching: { padding: 12, alignItems: "center" as const },
  geocodeItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  geocodeText: { flex: 1, color: Colors.text, fontSize: 13, lineHeight: 18 },

  fabGroup: {
    position: "absolute" as const,
    right: 16,
    bottom: 280,
    flexDirection: "column" as const,
    alignItems: "flex-end" as const,
    gap: 10,
    zIndex: 1000,
  },
  fab: {
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  fabLabel: { color: Colors.bg, fontSize: 14, fontWeight: "700" as const },
  fabEvent: {
    backgroundColor: EVENT_COLOR,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    shadowColor: EVENT_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  fabEventLabel: { color: "#fff", fontSize: 13, fontWeight: "700" as const },

  bottomPanel: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 34,
    zIndex: 1000,
  },

  routePanel: { padding: 16 },
  routePanelHeader: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },
  routePanelTitle: { fontSize: 13, fontWeight: "600" as const, color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  routeCard: {
    width: 130,
    marginRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    padding: 12,
    gap: 6,
  },
  routeColorDot: { width: 10, height: 10, borderRadius: 5 },
  routeLabel: { fontSize: 14, fontWeight: "600" as const, color: Colors.textSecondary },
  routeTime: { fontSize: 18, fontWeight: "700" as const, color: Colors.text },
  routeStats: { gap: 4, marginTop: 4 },
  routeStat: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  routeStatText: { fontSize: 11, color: Colors.textMuted },
  routeTierBadge: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  routeTierText: { fontSize: 11, fontWeight: "700" as const },
  routeSummary: { flexDirection: "row" as const, gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  routeSummaryItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  routeSummaryText: { fontSize: 12, color: Colors.textMuted },

  legendPanel: { padding: 16 },
  legendHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 14 },
  legendTitle: { fontSize: 13, fontWeight: "600" as const, color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  legendCount: { fontSize: 12, color: Colors.textMuted },
  legendGrid: { gap: 10 },
  legendItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  legendDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  legendTierNum: { fontSize: 13, fontWeight: "700" as const, color: "#000" },
  legendItemText: { flex: 1 },
  legendLabel: { fontSize: 14, fontWeight: "600" as const },
  legendDesc: { fontSize: 12, color: Colors.textMuted },
  legendCount2: { fontSize: 16, fontWeight: "700" as const, color: Colors.textMuted },

  eventsToggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  eventsToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eventsToggleBtnActive: {
    borderColor: EVENT_COLOR,
    backgroundColor: EVENT_COLOR + "18",
  },

  rightClickHint: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  hintText: { fontSize: 11, color: Colors.textMuted },
});
