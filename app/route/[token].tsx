import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface SharedRoute {
  id: string;
  name: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startAddress: string | null;
  endAddress: string | null;
  riskScore: number;
  routeData: any;
  createdAt: string;
  sharedBy: string;
}

export default function SharedRouteScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [route, setRoute] = useState<SharedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const baseUrl = getApiUrl();
        const res = await fetch(`${baseUrl}/api/routes/shared/${token}`, { credentials: "include" });
        if (!res.ok) {
          setError("This shared route is no longer available.");
          return;
        }
        const data = await res.json();
        setRoute(data);
      } catch {
        setError("Failed to load shared route.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topPad + 40 }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (error || !route) {
    return (
      <View style={[styles.container, { paddingTop: topPad + 40 }]}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={styles.errorTitle}>Route Not Found</Text>
          <Text style={styles.errorDesc}>{error || "This route doesn't exist or is no longer shared."}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.backBtnText}>Go to Map</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad + 20 }]}>
      <View style={styles.card}>
        <View style={styles.sharedBadge}>
          <Ionicons name="link" size={14} color={Colors.accent} />
          <Text style={styles.sharedBadgeText}>Shared Route</Text>
        </View>

        <Text style={styles.routeName}>{route.name}</Text>

        <View style={styles.sharedBy}>
          <Ionicons name="person-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.sharedByText}>Shared by {route.sharedBy}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={16} color={Colors.tier1} />
            <Text style={styles.infoLabel}>From</Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {route.startAddress || `${route.startLat.toFixed(4)}, ${route.startLng.toFixed(4)}`}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="flag-outline" size={16} color={Colors.error} />
            <Text style={styles.infoLabel}>To</Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {route.endAddress || `${route.endLat.toFixed(4)}, ${route.endLng.toFixed(4)}`}
            </Text>
          </View>
        </View>

        <View style={styles.riskRow}>
          <Ionicons name="speedometer-outline" size={18} color={Colors.accent} />
          <Text style={styles.riskLabel}>Risk Score</Text>
          <Text style={styles.riskValue}>{route.riskScore}</Text>
        </View>

        <View style={styles.divider} />

        <Pressable
          style={styles.openBtn}
          onPress={() => {
            router.replace({
              pathname: "/(tabs)",
              params: {
                loadRoute: "shared",
                startLat: String(route.startLat),
                startLng: String(route.startLng),
                endLat: String(route.endLat),
                endLng: String(route.endLng),
                startAddr: route.startAddress || "",
                endAddr: route.endAddress || "",
              },
            });
          }}
        >
          <Ionicons name="navigate" size={18} color={Colors.bg} />
          <Text style={styles.openBtnText}>Open in Map</Text>
        </Pressable>
      </View>

      <Pressable style={styles.dismissBtn} onPress={() => router.back()}>
        <Text style={styles.dismissBtnText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 20,
  },
  errorCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  errorDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
  },
  backBtn: {
    marginTop: 12,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sharedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  sharedBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  routeName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  sharedBy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sharedByText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: "row",
    gap: 16,
  },
  infoItem: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    padding: 12,
    borderRadius: 10,
  },
  riskLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    flex: 1,
  },
  riskValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
  },
  openBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.bg,
  },
  dismissBtn: {
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 12,
  },
  dismissBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
});
