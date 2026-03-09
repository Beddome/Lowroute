import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Colors } from "@/constants/colors";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      setIsOffline(!navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const NetInfo = await import("@react-native-community/netinfo");
        unsubscribe = NetInfo.default.addEventListener((state) => {
          setIsOffline(!(state.isConnected ?? true));
        });
      } catch {
        // NetInfo not available
      }
    })();
    return () => unsubscribe?.();
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.error,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
