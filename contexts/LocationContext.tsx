import React, { createContext, useContext, useState, useRef, useMemo, useCallback, ReactNode } from "react";
import { Platform, Alert, Linking } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const BACKGROUND_LOCATION_TASK = "lowroute-background-location";

interface LocationPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  timestamp: number;
}

interface LocationContextValue {
  currentPosition: LocationPosition | null;
  heading: number | null;
  speed: number | null;
  isTracking: boolean;
  isBackgroundTracking: boolean;
  permissionStatus: Location.PermissionStatus | null;
  backgroundPermissionStatus: Location.PermissionStatus | null;
  requestPermission: () => Promise<void>;
  requestBackgroundPermission: () => Promise<boolean>;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  startBackgroundTracking: () => Promise<void>;
  stopBackgroundTracking: () => Promise<void>;
}

let backgroundLocationCallback: ((position: LocationPosition, heading: number | null, speed: number | null) => void) | null = null;

try {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn("Background location error:", error.message);
      return;
    }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const loc = locations[locations.length - 1];
      const position: LocationPosition = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
        accuracy: loc.coords.accuracy,
        timestamp: loc.timestamp,
      };
      if (backgroundLocationCallback) {
        backgroundLocationCallback(position, loc.coords.heading ?? null, loc.coords.speed ?? null);
      }
    }
  }
  });
} catch (e) {
  console.warn("TaskManager.defineTask failed:", e);
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [currentPosition, setCurrentPosition] = useState<LocationPosition | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [backgroundPermissionStatus, setBackgroundPermissionStatus] = useState<Location.PermissionStatus | null>(null);

  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const webWatchId = useRef<number | null>(null);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      try {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(() => resolve(), () => reject());
        });
        setPermissionStatus(Location.PermissionStatus.GRANTED);
      } catch {
        setPermissionStatus(Location.PermissionStatus.DENIED);
      }
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status);
  }, []);

  const requestBackgroundPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      return false;
    }

    const fgPerm = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(fgPerm.status);
    if (fgPerm.status !== Location.PermissionStatus.GRANTED) {
      return false;
    }

    const { status, canAskAgain } = await Location.requestBackgroundPermissionsAsync();
    setBackgroundPermissionStatus(status);

    if (status === Location.PermissionStatus.GRANTED) {
      return true;
    }

    if (status === Location.PermissionStatus.DENIED && !canAskAgain) {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        Alert.alert(
          "Background Location Required",
          'LowRoute needs "Always" location access to continue tracking your route when the app is in the background. Please enable it in Settings.',
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => { try { Linking.openSettings(); } catch {} } },
          ]
        );
      }
    }

    return false;
  }, []);

  const startTracking = useCallback(async () => {
    if (isTracking) return;

    if (Platform.OS === "web") {
      if (!navigator.geolocation) {
        throw new Error("Geolocation not available");
      }

      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setCurrentPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
          setHeading(pos.coords.heading);
          setSpeed(pos.coords.speed);
        },
        (err) => { console.warn("Geolocation error:", err.message); },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      webWatchId.current = id;
      setIsTracking(true);
      setPermissionStatus(Location.PermissionStatus.GRANTED);
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status);
    if (status !== Location.PermissionStatus.GRANTED) {
      throw new Error("Location permission denied");
    }

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        timeInterval: 1000,
      },
      (loc) => {
        setCurrentPosition({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude,
          accuracy: loc.coords.accuracy,
          timestamp: loc.timestamp,
        });
        setHeading(loc.coords.heading ?? null);
        setSpeed(loc.coords.speed ?? null);
      }
    );

    watchSubscription.current = sub;
    setIsTracking(true);
  }, [isTracking]);

  const stopTracking = useCallback(() => {
    if (Platform.OS === "web") {
      if (webWatchId.current !== null) {
        navigator.geolocation.clearWatch(webWatchId.current);
        webWatchId.current = null;
      }
    } else {
      if (watchSubscription.current) {
        watchSubscription.current.remove();
        watchSubscription.current = null;
      }
    }
    setIsTracking(false);
  }, []);

  const startBackgroundTracking = useCallback(async () => {
    if (Platform.OS === "web") return;
    if (isBackgroundTracking) return;

    const hasPermission = await requestBackgroundPermission();
    if (!hasPermission) return;

    backgroundLocationCallback = (position, h, s) => {
      setCurrentPosition(position);
      setHeading(h);
      setSpeed(s);
    };

    const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    if (!isTaskDefined) {
      console.warn("Background location task not defined");
      return;
    }

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        timeInterval: 2000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "LowRoute Navigation",
          notificationBody: "Tracking your route for hazard alerts",
          notificationColor: "#60A5FA",
        },
      });
    }

    setIsBackgroundTracking(true);
  }, [isBackgroundTracking, requestBackgroundPermission]);

  const stopBackgroundTracking = useCallback(async () => {
    if (Platform.OS === "web") return;

    backgroundLocationCallback = null;

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.warn("Error stopping background location:", e);
    }

    setIsBackgroundTracking(false);
  }, []);

  const value = useMemo(
    () => ({
      currentPosition,
      heading,
      speed,
      isTracking,
      isBackgroundTracking,
      permissionStatus,
      backgroundPermissionStatus,
      requestPermission,
      requestBackgroundPermission,
      startTracking,
      stopTracking,
      startBackgroundTracking,
      stopBackgroundTracking,
    }),
    [currentPosition, heading, speed, isTracking, isBackgroundTracking, permissionStatus, backgroundPermissionStatus, requestPermission, requestBackgroundPermission, startTracking, stopTracking, startBackgroundTracking, stopBackgroundTracking]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
