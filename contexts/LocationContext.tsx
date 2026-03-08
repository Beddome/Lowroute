import React, { createContext, useContext, useState, useRef, useMemo, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";

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
  permissionStatus: Location.PermissionStatus | null;
  requestPermission: () => Promise<void>;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [currentPosition, setCurrentPosition] = useState<LocationPosition | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);

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

  const value = useMemo(
    () => ({
      currentPosition,
      heading,
      speed,
      isTracking,
      permissionStatus,
      requestPermission,
      startTracking,
      stopTracking,
    }),
    [currentPosition, heading, speed, isTracking, permissionStatus, requestPermission, startTracking, stopTracking]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
