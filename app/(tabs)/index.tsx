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
  Alert,
  Modal,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { SEVERITY_TIERS, HAZARD_TYPES, EVENT_TYPES } from "@/shared/types";
import type { Hazard, AppEvent, CarProfile, UserLocation } from "@/shared/types";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/contexts/UnitsContext";

const FRIEND_COLOR = "#3B82F6";
const EVENT_COLOR = "#8B5CF6";

function getEventIcon(eventType: string): string {
  const found = EVENT_TYPES.find((t) => t.value === eventType);
  return found?.icon ?? "calendar";
}

function EventMarker({ event, onPress }: { event: AppEvent; onPress: () => void }) {
  const [tracksChanges, setTracksChanges] = useState(Platform.OS !== "web");
  useEffect(() => {
    if (Platform.OS !== "web") {
      const timer = setTimeout(() => setTracksChanges(false), 500);
      return () => clearTimeout(timer);
    }
  }, []);
  return (
    <Marker
      coordinate={{ latitude: event.lat, longitude: event.lng }}
      onPress={onPress}
      tracksViewChanges={tracksChanges}
    >
      <View
        style={[
          styles.markerContainer,
          {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: EVENT_COLOR,
            borderColor: "rgba(0,0,0,0.6)",
          },
        ]}
      >
        <Ionicons
          name={getEventIcon(event.eventType) as any}
          size={16}
          color="#fff"
        />
      </View>
    </Marker>
  );
}

function getHazardIcon(hazardType: string): string {
  const found = HAZARD_TYPES.find((t) => t.value === hazardType);
  return found?.icon ?? "alert-circle-outline";
}

function HazardMarker({ hazard, onPress }: { hazard: Hazard; onPress: () => void }) {
  const tier = SEVERITY_TIERS[hazard.severity - 1];
  const size = hazard.severity >= 3 ? 36 : 30;
  const isNative = Platform.OS !== "web";
  const [ready, setReady] = useState(!isNative);

  useEffect(() => {
    if (!isNative) return;
    const timer = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(timer);
  }, [isNative]);

  return (
    <Marker
      coordinate={{ latitude: hazard.lat, longitude: hazard.lng }}
      onPress={onPress}
      tracksViewChanges={!ready}
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
          name={getHazardIcon(hazard.type) as any}
          size={size * 0.55}
          color="#000"
        />
      </View>
    </Marker>
  );
}

const CLEARANCE_MODE_COLORS: Record<string, string> = {
  normal: "#22C55E",
  lowered: "#EAB308",
  very_lowered: "#F97316",
  show_car: "#EF4444",
};

function FriendMarker({ location, onPress }: { location: UserLocation; onPress: () => void }) {
  const initial = location.username?.[0]?.toUpperCase() ?? "?";
  const hasCar = !!location.activeCar;
  const markerBg = hasCar
    ? CLEARANCE_MODE_COLORS[location.activeCar!.clearanceMode] ?? FRIEND_COLOR
    : FRIEND_COLOR;
  return (
    <Marker
      coordinate={{ latitude: location.lat, longitude: location.lng }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={[styles.markerContainer, { width: 32, height: 32, borderRadius: 16, backgroundColor: markerBg, borderColor: "rgba(255,255,255,0.6)" }]}>
        {hasCar ? (
          <Ionicons name="car-sport" size={16} color="#fff" />
        ) : (
          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>{initial}</Text>
        )}
      </View>
    </Marker>
  );
}

interface GeoResult {
  description: string;
  placeId: string;
}

interface GeocodedLocation {
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface RouteStep {
  html_instructions: string;
  distance: number;
  duration: number;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  maneuver?: string;
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
  steps?: RouteStep[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const STEP_ANNOUNCE_METERS = 100;

async function searchPlaces(query: string, lat?: number, lng?: number): Promise<GeoResult[]> {
  const baseUrl = getApiUrl();
  let url = `${baseUrl}/api/places/autocomplete?input=${encodeURIComponent(query)}`;
  if (lat != null && lng != null) {
    url += `&lat=${lat}&lng=${lng}`;
  }
  const res = await fetch(url, { credentials: "include" });
  return res.json();
}

async function geocodePlace(placeId: string): Promise<GeocodedLocation | null> {
  const baseUrl = getApiUrl();
  const res = await fetch(`${baseUrl}/api/geocode?placeId=${encodeURIComponent(placeId)}`, { credentials: "include" });
  return res.json();
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


const ROUTE_COLORS = ["#60A5FA", "#34D399", "#FBBF24"];
const PROXIMITY_ALERT_METERS = 200;
const OFF_ROUTE_THRESHOLD_METERS = 30;
const OFF_ROUTE_CONSECUTIVE_COUNT = 3;
const REROUTE_COOLDOWN_MS = 15000;

function distanceToPolyline(lat: number, lng: number, polyline: Array<{ lat: number; lng: number }>): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return getDistance(lat, lng, polyline[0].lat, polyline[0].lng);
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const aLat = polyline[i].lat;
    const aLng = polyline[i].lng;
    const bLat = polyline[i + 1].lat;
    const bLng = polyline[i + 1].lng;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dx = (bLng - aLng) * cosLat;
    const dy = bLat - aLat;
    const px = (lng - aLng) * cosLat;
    const py = lat - aLat;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? (px * dx + py * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const projLat = aLat + t * (bLat - aLat);
    const projLng = aLng + t * (bLng - aLng);
    const d = getDistance(lat, lng, projLat, projLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams<{ loadRoute?: string; startLat?: string; startLng?: string; endLat?: string; endLng?: string; startAddr?: string; endAddr?: string }>();
  const { user } = useAuth();
  const { currentPosition, heading, speed, isTracking, startTracking, stopTracking, startBackgroundTracking, stopBackgroundTracking } = useLocation();
  const { formatDistance, formatSpeed, formatRouteDistance, speedUnit } = useUnits();

  const [locationGranted, setLocationGranted] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 49.6935,
    longitude: -112.8418,
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
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [routePanelExpanded, setRoutePanelExpanded] = useState(false);

  const panelExpanded = useRef(new Animated.Value(0)).current;
  const [panelOpen, setPanelOpen] = useState(false);

  const [isNavigating, setIsNavigating] = useState(false);
  const [nearbyHazard, setNearbyHazard] = useState<Hazard | null>(null);
  const alertedHazardsRef = useRef<Set<string>>(new Set());
  const navStartTimeRef = useRef<number>(0);
  const [showEvents, setShowEvents] = useState(true);
  const [activeCarProfile, setActiveCarProfile] = useState<CarProfile | null>(null);
  const activeCarProfileRef = useRef<CarProfile | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<UserLocation | null>(null);
  const [carSelectorOpen, setCarSelectorOpen] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const currentStepIdxRef = useRef(0);
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null);
  const spokenStepsRef = useRef<Set<number>>(new Set());
  const spokenHazardsVoiceRef = useRef<Set<string>>(new Set());
  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const offRouteCountRef = useRef(0);
  const lastRerouteTimeRef = useRef(0);
  const [isRerouting, setIsRerouting] = useState(false);
  const hazardTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { data: hazards = [] } = useQuery<Hazard[]>({
    queryKey: ["/api/hazards"],
  });

  const { data: carProfiles = [] } = useQuery<CarProfile[]>({
    queryKey: ["/api/cars"],
    enabled: !!user,
  });

  const { data: friendLocations = [] } = useQuery<UserLocation[]>({
    queryKey: ["/api/friends/locations"],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const locationUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    activeCarProfileRef.current = activeCarProfile;
  }, [activeCarProfile]);

  useEffect(() => {
    if (!user || !userLocation) return;
    const sendLocation = () => {
      const loc = userLocationRef.current;
      if (!loc) return;
      apiRequest("POST", "/api/location/update", {
        lat: loc.latitude,
        lng: loc.longitude,
        activeCarId: activeCarProfileRef.current?.id,
      }).catch(() => {});
    };
    sendLocation();
    locationUpdateRef.current = setInterval(sendLocation, 30000);
    return () => {
      if (locationUpdateRef.current) clearInterval(locationUpdateRef.current);
    };
  }, [user, !!userLocation]);

  useEffect(() => {
    if (carProfiles.length > 0) {
      const defaultCar = carProfiles.find((c) => c.isDefault) || carProfiles[0];
      setActiveCarProfile(defaultCar);
    } else {
      setActiveCarProfile(null);
    }
  }, [carProfiles]);

  useEffect(() => {
    if (params.loadRoute && params.startLat && params.startLng && params.endLat && params.endLng) {
      const sLat = parseFloat(params.startLat);
      const sLng = parseFloat(params.startLng);
      const eLat = parseFloat(params.endLat);
      const eLng = parseFloat(params.endLng);
      if (!isNaN(sLat) && !isNaN(sLng) && !isNaN(eLat) && !isNaN(eLng)) {
        setOriginText(params.startAddr || `${sLat.toFixed(4)}, ${sLng.toFixed(4)}`);
        setDestText(params.endAddr || `${eLat.toFixed(4)}, ${eLng.toFixed(4)}`);
        setOriginCoords({ lat: sLat, lng: sLng });
        setDestCoords({ lat: eLat, lng: eLng });
      }
    }
  }, [params.loadRoute]);

  const eventsQueryKey = [
    "/api/events",
    `minLat=${(mapRegion.latitude - mapRegion.latitudeDelta).toFixed(4)}`,
    `maxLat=${(mapRegion.latitude + mapRegion.latitudeDelta).toFixed(4)}`,
    `minLng=${(mapRegion.longitude - mapRegion.longitudeDelta).toFixed(4)}`,
    `maxLng=${(mapRegion.longitude + mapRegion.longitudeDelta).toFixed(4)}`,
  ];

  const { data: events = [] } = useQuery<AppEvent[]>({
    queryKey: eventsQueryKey,
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/events", baseUrl);
      url.searchParams.set("minLat", (mapRegion.latitude - mapRegion.latitudeDelta).toFixed(4));
      url.searchParams.set("maxLat", (mapRegion.latitude + mapRegion.latitudeDelta).toFixed(4));
      url.searchParams.set("minLng", (mapRegion.longitude - mapRegion.longitudeDelta).toFixed(4));
      url.searchParams.set("maxLng", (mapRegion.longitude + mapRegion.longitudeDelta).toFixed(4));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showEvents,
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

  useEffect(() => {
    if (currentPosition) {
      setUserLocation({ latitude: currentPosition.latitude, longitude: currentPosition.longitude });
    }
  }, [currentPosition]);

  const processQueue = useCallback(() => {
    if (isSpeakingRef.current || speechQueueRef.current.length === 0) return;
    const text = speechQueueRef.current.shift()!;
    isSpeakingRef.current = true;
    Speech.speak(text, {
      rate: 0.95,
      pitch: 1.0,
      onDone: () => { isSpeakingRef.current = false; processQueue(); },
      onError: () => { isSpeakingRef.current = false; processQueue(); },
      onStopped: () => { isSpeakingRef.current = false; },
    });
  }, []);

  const speak = useCallback((text: string, priority: boolean = false) => {
    if (!voiceEnabled) return;
    if (priority) {
      Speech.stop();
      isSpeakingRef.current = false;
      speechQueueRef.current = [text, ...speechQueueRef.current];
    } else {
      speechQueueRef.current.push(text);
    }
    processQueue();
  }, [voiceEnabled, processQueue]);

  const isNavigatingRef = useRef(false);
  useEffect(() => { isNavigatingRef.current = isNavigating; }, [isNavigating]);

  const rerouteFromCurrentPosition = useCallback(async () => {
    if (!currentPosition || !destCoords || isRerouting) return;
    setIsRerouting(true);
    lastRerouteTimeRef.current = Date.now();
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/routes", baseUrl);
      url.searchParams.set("startLat", String(currentPosition.latitude));
      url.searchParams.set("startLng", String(currentPosition.longitude));
      url.searchParams.set("endLat", String(destCoords.lat));
      url.searchParams.set("endLng", String(destCoords.lng));
      if (activeCarProfile?.id) {
        url.searchParams.set("carProfileId", activeCarProfile.id);
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return;
      if (!isNavigatingRef.current) return;
      const data = await res.json();
      const routeList = data.routes || data;
      if (!Array.isArray(routeList) || routeList.length === 0) return;
      if (!isNavigatingRef.current) return;
      setRoutes(routeList);
      setSelectedRouteIdx(0);
      currentStepIdxRef.current = 0;
      spokenStepsRef.current = new Set();
      alertedHazardsRef.current = new Set();
      spokenHazardsVoiceRef.current = new Set();
      offRouteCountRef.current = 0;
      setCurrentInstruction(null);
      speak("Rerouting. Taking the safest route.", true);
    } catch (e) {
      console.error("Reroute error:", e);
    } finally {
      setIsRerouting(false);
    }
  }, [currentPosition, destCoords, activeCarProfile, isRerouting, speak]);

  useEffect(() => {
    if (!isNavigating || !currentPosition) return;

    mapRef.current?.animateToRegion(
      {
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      300
    );

    const route = routes[selectedRouteIdx];
    if (!route) return;

    if (route.steps && route.steps.length > 0) {
      const steps = route.steps;
      let bestIdx = currentStepIdxRef.current;

      for (let i = bestIdx; i < steps.length; i++) {
        const distToEnd = getDistance(
          currentPosition.latitude, currentPosition.longitude,
          steps[i].end_location.lat, steps[i].end_location.lng
        );
        if (distToEnd < 50) {
          bestIdx = Math.max(bestIdx, Math.min(i + 1, steps.length - 1));
          continue;
        }
        break;
      }

      if (bestIdx > currentStepIdxRef.current) {
        currentStepIdxRef.current = bestIdx;
      }

      if (bestIdx < steps.length) {
        const step = steps[bestIdx];
        const instruction = stripHtml(step.html_instructions);
        setCurrentInstruction(instruction);

        const distToStep = getDistance(
          currentPosition.latitude, currentPosition.longitude,
          step.start_location.lat, step.start_location.lng
        );
        if (distToStep <= STEP_ANNOUNCE_METERS && !spokenStepsRef.current.has(bestIdx)) {
          spokenStepsRef.current.add(bestIdx);
          speak(instruction);
        }
      }
    }

    for (const hazard of route.hazards) {
      const dist = getDistance(
        currentPosition.latitude,
        currentPosition.longitude,
        hazard.lat,
        hazard.lng
      );
      if (dist <= PROXIMITY_ALERT_METERS && !alertedHazardsRef.current.has(hazard.id)) {
        alertedHazardsRef.current.add(hazard.id);
        setNearbyHazard(hazard);
        Haptics.notificationAsync(
          hazard.severity >= 3
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Warning
        );
        if (!spokenHazardsVoiceRef.current.has(hazard.id)) {
          spokenHazardsVoiceRef.current.add(hazard.id);
          const tierLabel = SEVERITY_TIERS[hazard.severity - 1]?.label ?? "Unknown";
          speak(`Warning: ${tierLabel} hazard ahead. ${hazard.title}`, true);
        }
        const timer = setTimeout(() => setNearbyHazard(null), 5000);
        hazardTimersRef.current.push(timer);
      }
    }

    if (route.waypoints && route.waypoints.length >= 2) {
      const distToRoute = distanceToPolyline(
        currentPosition.latitude,
        currentPosition.longitude,
        route.waypoints
      );
      if (distToRoute > OFF_ROUTE_THRESHOLD_METERS) {
        offRouteCountRef.current += 1;
      } else {
        offRouteCountRef.current = 0;
      }
      const timeSinceLastReroute = Date.now() - lastRerouteTimeRef.current;
      if (
        offRouteCountRef.current >= OFF_ROUTE_CONSECUTIVE_COUNT &&
        timeSinceLastReroute > REROUTE_COOLDOWN_MS &&
        !isRerouting
      ) {
        offRouteCountRef.current = 0;
        rerouteFromCurrentPosition();
      }
    }
  }, [currentPosition, isNavigating, speak, rerouteFromCurrentPosition, isRerouting]);

  const startNavigation = useCallback(async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    if (user.subscriptionTier !== "pro" && user.role !== "admin") {
      router.push("/paywall");
      return;
    }

    try {
      await startTracking();
      setIsNavigating(true);
      alertedHazardsRef.current.clear();
      currentStepIdxRef.current = 0;
      spokenStepsRef.current.clear();
      spokenHazardsVoiceRef.current.clear();
      offRouteCountRef.current = 0;
      lastRerouteTimeRef.current = 0;
      setCurrentInstruction(null);
      navStartTimeRef.current = Date.now();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speak("Navigation started");
      startBackgroundTracking().catch(() => {});
    } catch (err) {
      Alert.alert("Location Error", "Unable to start navigation. Please ensure location permissions are granted.");
    }
  }, [user, startTracking, startBackgroundTracking, speak]);

  const endNavigation = useCallback(() => {
    Speech.stop();
    speechQueueRef.current = [];
    isSpeakingRef.current = false;
    hazardTimersRef.current.forEach(clearTimeout);
    hazardTimersRef.current = [];
    if (voiceEnabled) Speech.speak("Navigation ended");
    setIsNavigating(false);
    setIsRerouting(false);
    setNearbyHazard(null);
    setCurrentInstruction(null);
    alertedHazardsRef.current.clear();
    spokenStepsRef.current.clear();
    spokenHazardsVoiceRef.current.clear();
    currentStepIdxRef.current = 0;
    offRouteCountRef.current = 0;
    lastRerouteTimeRef.current = 0;
    stopTracking();
    stopBackgroundTracking().catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [stopTracking, stopBackgroundTracking, voiceEnabled]);

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
        const results = await searchPlaces(
          text,
          userLocation?.latitude,
          userLocation?.longitude,
        );
        setGeocodeResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  };

  const selectGeoResult = async (result: GeoResult) => {
    setGeocodeResults([]);
    setIsSearching(true);
    try {
      const location = await geocodePlace(result.placeId);
      if (!location) return;
      const coords = { lat: location.lat, lng: location.lng };
      const shortName = result.description.split(",")[0];
      if (activeSearchField === "origin") {
        setOriginText(shortName);
        setOriginCoords(coords);
      } else {
        setDestText(shortName);
        setDestCoords(coords);
      }
    } finally {
      setIsSearching(false);
      setActiveSearchField(null);
    }
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
      if (activeCarProfile?.id) {
        url.searchParams.set("carProfileId", activeCarProfile.id);
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Route calculation failed" }));
        Alert.alert("Routing Error", err.message || "Could not calculate routes. Please try again.");
        return;
      }
      const data = await res.json();
      const routeList = data.routes || data;
      if (!Array.isArray(routeList) || routeList.length === 0) {
        Alert.alert("No Routes", "No routes found between these locations.");
        return;
      }
      setRoutes(routeList);
      setSelectedRouteIdx(0);
      setPanelOpen(true);
      Animated.spring(panelExpanded, { toValue: 1, useNativeDriver: false }).start();

      const centerLat = (originCoords.lat + destCoords.lat) / 2;
      const centerLng = (originCoords.lng + destCoords.lng) / 2;
      const latDelta = Math.abs(originCoords.lat - destCoords.lat) * 2.5;
      const lngDelta = Math.abs(originCoords.lng - destCoords.lng) * 2.5;
      mapRef.current?.animateToRegion(
        {
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: Math.max(latDelta, 0.04),
          longitudeDelta: Math.max(lngDelta, 0.04),
        },
        800
      );
    } catch (e) {
      console.error("Route calculation error:", e);
      Alert.alert("Connection Error", "Unable to reach the routing service. Check your internet connection and try again.");
    } finally {
      setIsRoutingLoading(false);
    }
  }, [originCoords, destCoords, activeCarProfile]);

  useEffect(() => {
    if (originCoords && destCoords) {
      calculateRoutes();
    }
  }, [originCoords, destCoords]);

  useEffect(() => {
    return () => {
      Speech.stop();
      speechQueueRef.current = [];
      isSpeakingRef.current = false;
      hazardTimersRef.current.forEach(clearTimeout);
      hazardTimersRef.current = [];
    };
  }, []);

  const handleSaveRoute = useCallback(async () => {
    if (!user) {
      Alert.alert("Sign In", "Sign in to save routes.");
      return;
    }
    const sel = routes[selectedRouteIdx];
    if (!sel || !originCoords || !destCoords) return;
    const defaultName = `${originText || "Start"} → ${destText || "End"}`;
    Alert.prompt
      ? Alert.prompt("Save Route", "Name this route:", async (name: string) => {
          if (!name?.trim()) return;
          try {
            await apiRequest("POST", "/api/routes/save", {
              name: name.trim(),
              startLat: originCoords.lat,
              startLng: originCoords.lng,
              endLat: destCoords.lat,
              endLng: destCoords.lng,
              startAddress: originText || null,
              endAddress: destText || null,
              riskScore: sel.riskScore,
              carProfileId: activeCarProfile?.id || null,
              routeData: { waypoints: sel.waypoints?.slice(0, 200) },
            });
            queryClient.invalidateQueries({ queryKey: ["/api/routes/saved"] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Saved!", "Route saved to your profile.");
          } catch {
            Alert.alert("Error", "Could not save route.");
          }
        }, "plain-text", defaultName)
      : (async () => {
          try {
            await apiRequest("POST", "/api/routes/save", {
              name: defaultName,
              startLat: originCoords.lat,
              startLng: originCoords.lng,
              endLat: destCoords.lat,
              endLng: destCoords.lng,
              startAddress: originText || null,
              endAddress: destText || null,
              riskScore: sel.riskScore,
              carProfileId: activeCarProfile?.id || null,
              routeData: { waypoints: sel.waypoints?.slice(0, 200) },
            });
            queryClient.invalidateQueries({ queryKey: ["/api/routes/saved"] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Saved!", "Route saved to your profile.");
          } catch {
            Alert.alert("Error", "Could not save route.");
          }
        })();
  }, [routes, selectedRouteIdx, originCoords, destCoords, originText, destText, user, activeCarProfile]);

  const clearRoute = () => {
    if (isNavigating) endNavigation();
    setOriginText("");
    setDestText("");
    setOriginCoords(null);
    setDestCoords(null);
    setRoutes([]);
    setPanelOpen(false);
    setSearchExpanded(false);
    setRoutePanelExpanded(false);
    Animated.spring(panelExpanded, { toValue: 0, useNativeDriver: false }).start();
  };

  const selectedRoute = routes[selectedRouteIdx] ?? null;
  const topPadding = Platform.OS === "web" ? 67 : 0;

  const distToDestination =
    destCoords && userLocation
      ? getDistance(userLocation.latitude, userLocation.longitude, destCoords.lat, destCoords.lng)
      : null;

  const navElapsedMin = isNavigating ? Math.floor((Date.now() - navStartTimeRef.current) / 60000) : 0;

  const bottomPanelHeight = isNavigating ? 0 : routes.length > 0 ? (routePanelExpanded ? 320 : 100) : 140;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        region={isNavigating ? undefined : mapRegion}
        onRegionChangeComplete={isNavigating ? undefined : setMapRegion}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        showsCompass={false}
        userInterfaceStyle="dark"
        followsUserLocation={isNavigating}
        onPress={() => {
          if (!isNavigating) {
            setActiveSearchField(null);
            setGeocodeResults([]);
          }
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

        {showEvents && routes.length === 0 && events
          .filter((e) => e.status !== "cancelled")
          .map((e) => (
            <EventMarker
              key={`event-${e.id}`}
              event={e}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/event-detail", params: { id: e.id } });
              }}
            />
          ))}

        {routes.length === 0 && friendLocations.map((fl) => (
          <FriendMarker
            key={`friend-${fl.userId}`}
            location={fl}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedFriend(fl);
              setTimeout(() => setSelectedFriend(null), 3000);
            }}
          />
        ))}

        {originCoords && !isNavigating && (
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

        {!isNavigating && routes.map((route, i) => {
          if (i === selectedRouteIdx || !route.waypoints || route.waypoints.length < 2) return null;
          const color = ROUTE_COLORS[i] ?? Colors.accent;
          return (
            <Polyline
              key={`route-alt-${i}`}
              coordinates={route.waypoints.map((w) => ({ latitude: w.lat, longitude: w.lng }))}
              strokeColor={color + "80"}
              strokeWidth={3}
              tappable
              onPress={() => {
                setSelectedRouteIdx(i);
                Haptics.selectionAsync();
              }}
            />
          );
        })}
        {selectedRoute?.waypoints && selectedRoute.waypoints.length >= 2 && (
          <>
            {!isNavigating && (
              <Polyline
                key={`route-glow-${selectedRouteIdx}`}
                coordinates={selectedRoute.waypoints.map((w) => ({ latitude: w.lat, longitude: w.lng }))}
                strokeColor={(ROUTE_COLORS[selectedRouteIdx] ?? Colors.accent) + "40"}
                strokeWidth={12}
              />
            )}
            <Polyline
              key={`route-selected-${selectedRouteIdx}`}
              coordinates={selectedRoute.waypoints.map((w) => ({ latitude: w.lat, longitude: w.lng }))}
              strokeColor={ROUTE_COLORS[selectedRouteIdx] ?? Colors.accent}
              strokeWidth={isNavigating ? 6 : 5}
            />
          </>
        )}
      </MapView>

      {/* Friend name tooltip */}
      {selectedFriend && (
        <View style={[styles.friendTooltip, { bottom: insets.bottom + bottomPanelHeight + 70 }]}>
          <View style={styles.friendTooltipDot} />
          <Text style={styles.friendTooltipText}>
            {selectedFriend.activeCar
              ? `${selectedFriend.username ?? "Friend"} — ${selectedFriend.activeCar.year} ${selectedFriend.activeCar.make} ${selectedFriend.activeCar.model}`
              : (selectedFriend.username ?? "Friend")}
          </Text>
        </View>
      )}

      {/* Hazard proximity alert banner */}
      {nearbyHazard && (
        <View
          style={[
            styles.alertBanner,
            {
              top: insets.top + topPadding + 12,
              backgroundColor: SEVERITY_TIERS[nearbyHazard.severity - 1]?.bg ?? Colors.bgCard,
              borderColor: SEVERITY_TIERS[nearbyHazard.severity - 1]?.color ?? Colors.accent,
            },
          ]}
        >
          <Ionicons
            name={nearbyHazard.severity >= 3 ? "warning" : "alert-circle"}
            size={24}
            color={SEVERITY_TIERS[nearbyHazard.severity - 1]?.color ?? Colors.accent}
          />
          <View style={styles.alertTextContainer}>
            <Text style={[styles.alertTitle, { color: SEVERITY_TIERS[nearbyHazard.severity - 1]?.color }]}>
              {SEVERITY_TIERS[nearbyHazard.severity - 1]?.label} Hazard Ahead
            </Text>
            <Text style={styles.alertDesc} numberOfLines={1}>
              {nearbyHazard.title}
            </Text>
          </View>
          <Pressable onPress={() => setNearbyHazard(null)} hitSlop={8}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {/* Navigation HUD */}
      {isNavigating && (
        <View style={[styles.navHud, { top: insets.top + topPadding + (nearbyHazard ? 80 : 12) }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.navHudContent}>
              <View style={styles.navStat}>
                <Ionicons name="navigate" size={18} color={Colors.accent} />
                <Text style={styles.navStatValue}>
                  {distToDestination != null ? formatDistance(distToDestination) : "--"}
                </Text>
                <Text style={styles.navStatLabel}>to dest</Text>
              </View>
              <View style={styles.navDivider} />
              <View style={styles.navStat}>
                <Ionicons name="speedometer" size={18} color={Colors.accent} />
                <Text style={styles.navStatValue}>
                  {speed != null && speed >= 0 ? formatSpeed(speed) : "0"}
                </Text>
                <Text style={styles.navStatLabel}>{speedUnit}</Text>
              </View>
              <View style={styles.navDivider} />
              <View style={styles.navStat}>
                <Ionicons name="time" size={18} color={Colors.accent} />
                <Text style={styles.navStatValue}>{navElapsedMin}</Text>
                <Text style={styles.navStatLabel}>min</Text>
              </View>
            </View>
            {isRerouting && (
              <View style={[styles.instructionStrip, { backgroundColor: "#7C3AED" }]}>
                <Ionicons name="refresh" size={14} color="#FFF" />
                <Text style={[styles.instructionText, { color: "#FFF" }]}>Rerouting...</Text>
              </View>
            )}
            {!isRerouting && currentInstruction && (
              <View style={styles.instructionStrip}>
                <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
                <Text style={styles.instructionText} numberOfLines={2}>{currentInstruction}</Text>
              </View>
            )}
          </View>
          <View style={styles.navButtons}>
            <Pressable
              style={[styles.voiceBtn, !voiceEnabled && styles.voiceBtnMuted]}
              onPress={() => {
                setVoiceEnabled((v) => !v);
                if (voiceEnabled) Speech.stop();
              }}
              hitSlop={8}
            >
              <Ionicons name={voiceEnabled ? "volume-high" : "volume-mute"} size={18} color={voiceEnabled ? Colors.accent : Colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.endNavBtn}
              onPress={endNavigation}
            >
              <Ionicons name="stop-circle" size={20} color={Colors.white} />
              <Text style={styles.endNavText}>End</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Top search panel - hidden during navigation */}
      {!isNavigating && (
        <View
          style={[
            styles.topPanel,
            { top: insets.top + topPadding + 12, marginHorizontal: 16 },
          ]}
        >
          {routes.length > 0 && !searchExpanded ? (
            <Pressable
              style={styles.collapsedSearchBar}
              onPress={() => setSearchExpanded(true)}
            >
              <Ionicons name="navigate-circle" size={20} color={Colors.accent} />
              <Text style={styles.collapsedSearchText} numberOfLines={1}>
                {destText || "Destination"}
              </Text>
              <Pressable onPress={clearRoute} style={styles.actionBtn} hitSlop={8}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </Pressable>
            </Pressable>
          ) : (
            <>
              {carProfiles.length >= 2 && activeCarProfile && routes.length === 0 && (
                <Pressable
                  style={styles.carSelectorPill}
                  onPress={() => setCarSelectorOpen(true)}
                >
                  <Ionicons name="car-sport" size={14} color={Colors.accent} />
                  <Text style={styles.carSelectorText} numberOfLines={1}>
                    {activeCarProfile.year} {activeCarProfile.make} {activeCarProfile.model}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
                </Pressable>
              )}
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
                      <Pressable onPress={() => { clearRoute(); setSearchExpanded(false); }} style={styles.actionBtn} hitSlop={8}>
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
                            mapRef.current?.animateToRegion({
                              latitude: userLocation.latitude,
                              longitude: userLocation.longitude,
                              latitudeDelta: 0.02,
                              longitudeDelta: 0.02,
                            }, 800);
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
                        {r.description}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Floating action buttons — on map edge, not inside panels */}
      {!isNavigating && (
        <View style={[styles.mapFabColumn, { bottom: insets.bottom + bottomPanelHeight + 90, right: 16 }]}>
          <Pressable
            style={[styles.mapFab, { backgroundColor: Colors.bgCard }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const lat = userLocation?.latitude ?? mapRegion.latitude;
              const lng = userLocation?.longitude ?? mapRegion.longitude;
              router.push({ pathname: "/create-event", params: { lat: String(lat), lng: String(lng) } });
            }}
          >
            <Ionicons name="calendar" size={18} color={Colors.accent} />
          </Pressable>
          <Pressable
            style={[styles.mapFab, { backgroundColor: Colors.accent }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const lat = userLocation?.latitude ?? mapRegion.latitude;
              const lng = userLocation?.longitude ?? mapRegion.longitude;
              router.push({ pathname: "/report", params: { lat: String(lat), lng: String(lng) } });
            }}
          >
            <Ionicons name="warning" size={18} color={Colors.bg} />
          </Pressable>
        </View>
      )}

      {/* Bottom panel */}
      {!isNavigating && (
        <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 80 }]} pointerEvents="box-none">
          {routes.length > 0 ? (
            <RoutePanel
              routes={routes}
              selectedIdx={selectedRouteIdx}
              onSelect={(i) => {
                setSelectedRouteIdx(i);
                Haptics.selectionAsync();
              }}
              onStartNav={startNavigation}
              carProfile={activeCarProfile}
              onSaveRoute={handleSaveRoute}
              expanded={routePanelExpanded}
              onToggleExpand={() => {
                setRoutePanelExpanded((v) => !v);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              onCarSelect={carProfiles.length >= 2 ? () => setCarSelectorOpen(true) : undefined}
              activeCarProfile={activeCarProfile}
            />
          ) : (
            <TierLegend
              hazards={hazards}
              showEvents={showEvents}
              onToggleEvents={() => setShowEvents((v) => !v)}
              eventCount={events.length}
            />
          )}
        </View>
      )}

      {/* Location button - positioned below search bar, hidden when geocode dropdown open */}
      {locationGranted && !isNavigating && geocodeResults.length === 0 && (
        <Pressable
          style={[styles.locBtn, { top: insets.top + topPadding + 120, right: 16, zIndex: 101 }]}
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

      <Modal
        visible={carSelectorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCarSelectorOpen(false)}
      >
        <Pressable style={styles.carModalOverlay} onPress={() => setCarSelectorOpen(false)}>
          <View style={styles.carModalContent}>
            <Text style={styles.carModalTitle}>Select Vehicle</Text>
            {carProfiles.map((car) => {
              const isActive = activeCarProfile?.id === car.id;
              return (
                <Pressable
                  key={car.id}
                  style={[styles.carModalItem, isActive && styles.carModalItemActive]}
                  onPress={() => {
                    setActiveCarProfile(car);
                    setCarSelectorOpen(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <Ionicons name="car-sport" size={18} color={isActive ? Colors.accent : Colors.textSecondary} />
                  <Text style={[styles.carModalItemText, isActive && { color: Colors.accent }]}>
                    {car.year} {car.make} {car.model}
                  </Text>
                  {isActive && <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function RoutePanel({
  routes,
  selectedIdx,
  onSelect,
  onStartNav,
  carProfile,
  onSaveRoute,
  expanded,
  onToggleExpand,
  onCarSelect,
  activeCarProfile,
}: {
  routes: RouteOption[];
  selectedIdx: number;
  onSelect: (i: number) => void;
  onStartNav: () => void;
  carProfile: CarProfile | null;
  onSaveRoute: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onCarSelect?: () => void;
  activeCarProfile: CarProfile | null;
}) {
  const { formatRouteDistance } = useUnits();
  const selected = routes[selectedIdx];
  const selectedTier = selected && selected.highestSeverity > 0 ? SEVERITY_TIERS[selected.highestSeverity - 1] : null;
  return (
    <View style={styles.routePanel}>
      <Pressable style={styles.routePanelHandle} onPress={onToggleExpand}>
        <View style={styles.routePanelDragBar} />
      </Pressable>
      <View style={styles.routePanelCompact}>
        <View style={styles.routePanelCompactLeft}>
          <View style={[styles.routeColorDot, { backgroundColor: ROUTE_COLORS[selectedIdx] ?? Colors.accent, marginRight: 8 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.routeLabel} numberOfLines={1}>{selected?.label ?? "Route"}</Text>
            <Text style={styles.routeTime} numberOfLines={1}>
              {selected?.estimatedMinutes ?? 0} min
              {selected?.distanceKm ? ` · ${formatRouteDistance(selected.distanceKm)}` : ""}
              {selected?.totalHazards ? ` · ${selected.totalHazards} hazards` : ""}
            </Text>
          </View>
        </View>
        <Pressable style={styles.startNavButton} onPress={onStartNav}>
          <Ionicons name="navigate" size={16} color={Colors.bg} />
          <Text style={styles.startNavText}>Go</Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={{ marginTop: 8 }}>
          {onCarSelect && activeCarProfile && (
            <Pressable style={styles.carSelectorPillInline} onPress={onCarSelect}>
              <Ionicons name="car-sport" size={14} color={Colors.accent} />
              <Text style={styles.carSelectorText} numberOfLines={1}>
                {activeCarProfile.year} {activeCarProfile.make} {activeCarProfile.model}
              </Text>
              <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
            </Pressable>
          )}
          {carProfile && !onCarSelect && (
            <View style={styles.carProfileBadge}>
              <Ionicons name="car-sport" size={14} color={Colors.accent} />
              <Text style={styles.carProfileBadgeText}>
                Risk for: {carProfile.year} {carProfile.make} {carProfile.model}
              </Text>
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {routes.map((route, i) => {
              const tier = route.highestSeverity > 0 ? SEVERITY_TIERS[route.highestSeverity - 1] : null;
              const isSelected = i === selectedIdx;
              return (
                <Pressable
                  key={`route-card-${i}`}
                  accessibilityState={{ selected: isSelected }}
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
                    {route.estimatedMinutes} min
                    {route.distanceKm ? ` · ${formatRouteDistance(route.distanceKm)}` : ""}
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
          {selected && (
            <View style={styles.routeSummary}>
              <View style={styles.routeSummaryItem}>
                <Ionicons name="speedometer-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.routeSummaryText}>Risk: {selected.riskScore}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.saveRouteBtn, pressed && { opacity: 0.7 }]}
                onPress={onSaveRoute}
              >
                <Ionicons name="bookmark-outline" size={14} color={Colors.accent} />
                <Text style={styles.saveRouteBtnText}>Save</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function TierLegend({ hazards, showEvents, onToggleEvents, eventCount, routeHazardCount }: { hazards: Hazard[]; showEvents: boolean; onToggleEvents: () => void; eventCount: number; routeHazardCount?: number }) {
  const [expanded, setExpanded] = useState(false);
  const animVal = useRef(new Animated.Value(0)).current;

  const toggleExpanded = () => {
    Animated.timing(animVal, {
      toValue: expanded ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setExpanded(!expanded);
    Haptics.selectionAsync();
  };

  const expandedHeight = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  const hazardLabel = routeHazardCount != null
    ? `${routeHazardCount} hazard${routeHazardCount !== 1 ? "s" : ""} on route`
    : `${hazards.length} hazard${hazards.length !== 1 ? "s" : ""} nearby`;

  return (
    <View style={styles.legendPanel}>
      <Pressable style={styles.legendCompact} onPress={toggleExpanded}>
        <View style={styles.legendCompactLeft}>
          <Ionicons name="warning" size={18} color={Colors.tier3} />
          <Text style={styles.legendCompactText}>{hazardLabel}</Text>
        </View>
        <View style={styles.legendCompactRight}>
          <Pressable
            onPress={(e) => { e.stopPropagation(); onToggleEvents(); }}
            style={[styles.eventsToggleBtn, showEvents && styles.eventsToggleBtnActive]}
            hitSlop={8}
          >
            <Ionicons name={showEvents ? "eye" : "eye-off"} size={14} color={showEvents ? EVENT_COLOR : Colors.textMuted} />
          </Pressable>
          <Ionicons name={expanded ? "chevron-down" : "chevron-up"} size={18} color={Colors.textMuted} />
        </View>
      </Pressable>
      <Animated.View style={{ height: expandedHeight, overflow: "hidden" }}>
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
              <Text style={styles.legendDesc}>{eventCount} nearby</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "visible" as const,
  },
  originPin: { alignItems: "center", justifyContent: "center" },
  destPin: { alignItems: "center", justifyContent: "center" },

  alertBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    gap: 12,
    zIndex: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 20,
  },
  alertTextContainer: { flex: 1 },
  alertTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  alertDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },

  navHud: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 150,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 15,
  },
  navHudContent: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-around" as const },
  navStat: { alignItems: "center" as const, gap: 2 },
  navStatValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  navStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  navDivider: { width: 1, height: 30, backgroundColor: Colors.border },
  navButtons: { alignItems: "center" as const, gap: 8 },
  voiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(96,165,250,0.15)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  voiceBtnMuted: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  endNavBtn: {
    backgroundColor: Colors.tier4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  endNavText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.white },
  instructionStrip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },

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
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },

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

  collapsedSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  collapsedSearchText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  routePanel: { padding: 16, paddingTop: 0 },
  routePanelHandle: {
    alignItems: "center",
    paddingVertical: 8,
  },
  routePanelDragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted + "60",
  },
  routePanelCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  routePanelCompactLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  carSelectorPillInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent + "18",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  mapFabColumn: {
    position: "absolute",
    zIndex: 102,
    gap: 10,
  },
  mapFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  carProfileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent + "18",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  carProfileBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  saveRouteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },
  saveRouteBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  routePanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  routePanelTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  startNavButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  startNavText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.bg },
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
  routeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  routeTime: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  routeStats: { gap: 4, marginTop: 4 },
  routeStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  routeStatText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  routeTierBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  routeTierText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  routeSummary: { flexDirection: "row", gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  routeSummaryItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeSummaryText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  legendPanel: { paddingHorizontal: 16, paddingVertical: 12 },
  legendActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  legendActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    paddingVertical: 10,
  },
  legendActionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  legendCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  legendCompactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendCompactText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  legendCompactRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legendGrid: { gap: 10, marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  legendDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  legendTierNum: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  legendItemText: { flex: 1 },
  legendLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  legendDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  legendCount2: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.textMuted },

  eventsToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  eventsToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eventsToggleBtnActive: {
    borderColor: EVENT_COLOR,
    backgroundColor: EVENT_COLOR + "18",
  },

  friendTooltip: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FRIEND_COLOR,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 10,
    zIndex: 200,
  },
  friendTooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  friendTooltipText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },

  carSelectorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  carSelectorText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    maxWidth: 180,
  },

  carModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  carModalContent: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    width: "100%",
    maxWidth: 340,
  },
  carModalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 12,
  },
  carModalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  carModalItemActive: {
    backgroundColor: Colors.accent + "18",
  },
  carModalItemText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
});
