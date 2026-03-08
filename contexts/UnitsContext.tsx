import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type UnitSystem = "metric" | "imperial";

interface UnitsContextValue {
  system: UnitSystem;
  setSystem: (system: UnitSystem) => void;
  toggleSystem: () => void;
  formatDistance: (meters: number) => string;
  formatSpeed: (metersPerSecond: number) => string;
  formatRouteDistance: (km: number) => string;
  distanceUnit: string;
  speedUnit: string;
}

const STORAGE_KEY = "lowroute_unit_system";

const UnitsContext = createContext<UnitsContextValue | null>(null);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>("imperial");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "metric" || val === "imperial") {
        setSystemState(val);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s);
    AsyncStorage.setItem(STORAGE_KEY, s).catch(() => {});
  }, []);

  const toggleSystem = useCallback(() => {
    setSystem(system === "metric" ? "imperial" : "metric");
  }, [system, setSystem]);

  const formatDistance = useCallback((meters: number): string => {
    if (system === "imperial") {
      const feet = meters * 3.28084;
      if (feet < 1000) return `${Math.round(feet)} ft`;
      const miles = meters / 1609.344;
      return `${miles.toFixed(1)} mi`;
    }
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }, [system]);

  const formatSpeed = useCallback((metersPerSecond: number): string => {
    if (system === "imperial") {
      const mph = metersPerSecond * 2.23694;
      return `${Math.round(mph)}`;
    }
    const kmh = metersPerSecond * 3.6;
    return `${Math.round(kmh)}`;
  }, [system]);

  const formatRouteDistance = useCallback((km: number): string => {
    if (system === "imperial") {
      const miles = km * 0.621371;
      return `${miles.toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
  }, [system]);

  const value = useMemo(() => ({
    system,
    setSystem,
    toggleSystem,
    formatDistance,
    formatSpeed,
    formatRouteDistance,
    distanceUnit: system === "imperial" ? "mi" : "km",
    speedUnit: system === "imperial" ? "mph" : "km/h",
  }), [system, setSystem, toggleSystem, formatDistance, formatSpeed, formatRouteDistance]);

  if (!loaded) return null;

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used within UnitsProvider");
  return ctx;
}
