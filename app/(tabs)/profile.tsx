import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Share,
  Alert,
  Switch,
  Modal,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/contexts/UnitsContext";
import { Colors } from "@/constants/colors";
import { formatMSTDateClient, CarProfile, SavedRoute, SUSPENSION_TYPES, CLEARANCE_MODES } from "@/shared/types";
import { apiRequest, queryClient } from "@/lib/query-client";
import CarAvatar from "@/components/CarAvatar";
import { useSubscription } from "@/lib/revenuecat";

const BADGES = [
  { id: "first_report", icon: "flag" as const, label: "First Report", desc: "Submitted your first hazard", minRep: 10, color: Colors.accent },
  { id: "community_hero", icon: "shield-checkmark" as const, label: "Road Guardian", desc: "10+ confirmed reports", minRep: 100, color: Colors.tier1 },
  { id: "veteran", icon: "star" as const, label: "Veteran Spotter", desc: "50+ reputation points", minRep: 50, color: Colors.tier2 },
  { id: "top_tier", icon: "trophy" as const, label: "Top Contributor", desc: "200+ reputation points", minRep: 200, color: Colors.tier3 },
];

function RepBar({ rep }: { rep: number }) {
  const levels = [
    { min: 0, max: 50, label: "Rookie" },
    { min: 50, max: 200, label: "Spotter" },
    { min: 200, max: 500, label: "Road Guardian" },
    { min: 500, max: 1000, label: "Low Rider Legend" },
    { min: 1000, max: 9999, label: "Community Elder" },
  ];
  const current = levels.findIndex((l) => rep < l.max) ?? levels.length - 1;
  const level = levels[Math.min(current, levels.length - 1)];
  const progress = level ? Math.min(1, (rep - level.min) / (level.max - level.min)) : 1;

  return (
    <View style={repStyles.container}>
      <View style={repStyles.header}>
        <Text style={repStyles.levelLabel}>{level?.label ?? "Legend"}</Text>
        <Text style={repStyles.repCount}>{rep} XP</Text>
      </View>
      <View style={repStyles.track}>
        <View style={[repStyles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      {level && level.min < 9999 && (
        <Text style={repStyles.nextLevel}>
          {level.max - rep} XP to next rank
        </Text>
      )}
    </View>
  );
}

const repStyles = StyleSheet.create({
  container: { marginTop: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  levelLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  repCount: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  track: {
    height: 8,
    backgroundColor: Colors.bgElevated,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  nextLevel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 6 },
});

function GarageCard({ car }: { car: CarProfile }) {
  const suspLabel = SUSPENSION_TYPES.find((s) => s.value === car.suspensionType)?.label ?? car.suspensionType;
  const clearLabel = CLEARANCE_MODES.find((c) => c.value === car.clearanceMode)?.label ?? car.clearanceMode;

  return (
    <Pressable
      style={({ pressed }) => [garageStyles.carCard, pressed && { opacity: 0.85 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/car-profile?id=${car.id}`);
      }}
    >
      <View style={garageStyles.carHeader}>
        <CarAvatar style={car.avatarStyle} color={car.avatarColor} size={44} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={garageStyles.carName}>{car.year} {car.make} {car.model}</Text>
          {car.rideHeight != null && (
            <Text style={garageStyles.carDetail}>{car.rideHeight}" ride height</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
      <View style={garageStyles.badgeRow}>
        <View style={garageStyles.badge}>
          <Text style={garageStyles.badgeText}>{suspLabel}</Text>
        </View>
        <View style={garageStyles.badge}>
          <Text style={garageStyles.badgeText}>{clearLabel}</Text>
        </View>
        {car.isDefault && (
          <View style={[garageStyles.badge, garageStyles.defaultBadge]}>
            <Text style={[garageStyles.badgeText, { color: Colors.accent }]}>Default</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const garageStyles = StyleSheet.create({
  carCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 8,
  },
  carHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  carName: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  carDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  defaultBadge: {
    backgroundColor: Colors.accent + "18",
    borderColor: Colors.accent + "44",
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
});

export default function ProfileScreen() {
  const { user, logout, isLoading } = useAuth();
  const { system, toggleSystem } = useUnits();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleLogout = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await logout();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This action cannot be undone. You will be asked to confirm with your password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            setDeletePassword("");
            setDeleteModalVisible(true);
          },
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword) {
      Alert.alert("Error", "Please enter your password.");
      return;
    }
    try {
      await apiRequest("DELETE", "/api/auth/account", { password: deletePassword });
      setDeleteModalVisible(false);
      await logout();
    } catch (e: any) {
      Alert.alert("Error", e.message?.replace(/^\d+: /, "") || "Failed to delete account.");
    }
  };

  const handleExportData = async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/export");
      const data = await res.json();
      Alert.alert("Data Exported", "Your data export has been prepared successfully.");
    } catch (e: any) {
      Alert.alert("Error", e.message?.replace(/^\d+: /, "") || "Failed to export data.");
    }
  };

  const [shareLocation, setShareLocation] = useState<boolean>(user?.shareLocation ?? true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (user) setShareLocation(user.shareLocation ?? true);
  }, [user?.shareLocation]);

  const locationSharingMutation = useMutation({
    mutationFn: async (value: boolean) => {
      await apiRequest("PATCH", "/api/settings/location-sharing", { shareLocation: value });
    },
    onMutate: async (newValue: boolean) => {
      const previousValue = shareLocation;
      return { previousValue };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      Haptics.selectionAsync();
    },
    onError: (_err, _newValue, context) => {
      if (context?.previousValue !== undefined) {
        setShareLocation(context.previousValue);
      }
      Alert.alert("Error", "Could not update location sharing setting.");
    },
  });

  const { data: cars } = useQuery<CarProfile[]>({
    queryKey: ["/api/cars"],
    enabled: !!user,
  });

  const { data: savedRoutes = [] } = useQuery<SavedRoute[]>({
    queryKey: ["/api/routes/saved"],
    enabled: !!user,
  });

  const deleteRouteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/routes/saved/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes/saved"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const shareRouteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/routes/saved/${id}/share`);
      return res.json();
    },
    onSuccess: async (data: { shareToken: string; isPublic: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/routes/saved"] });
      if (data.isPublic) {
        const domain = process.env.EXPO_PUBLIC_DOMAIN || "";
        const shareUrl = `https://${domain}/route/${data.shareToken}`;
        try {
          await Share.share({
            message: `Check out my LowRoute! ${shareUrl}`,
            url: shareUrl,
          });
        } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    onError: () => {
      Alert.alert("Error", "Could not share route.");
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false} bounces={true} alwaysBounceVertical={true}>
          <View style={styles.guestContainer}>
            <View style={styles.guestIconContainer}>
              <Ionicons name="car-sport" size={60} color={Colors.accent} />
            </View>
            <Text style={styles.guestTitle}>Join the LowRoute Community</Text>
            <Text style={styles.guestSubtitle}>
              Sign in to report hazards, earn reputation, and help protect every low car on the road.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/(auth)/login");
              }}
            >
              <Ionicons name="log-in-outline" size={20} color={Colors.bg} />
              <Text style={styles.primaryBtnText}>Sign In</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
              onPress={() => router.push("/(auth)/register")}
            >
              <Text style={styles.secondaryBtnText}>Create Account</Text>
            </Pressable>

            <View style={styles.featureList}>
              {[
                { icon: "flag-outline" as const, text: "Report road hazards" },
                { icon: "shield-checkmark-outline" as const, text: "Confirm community reports" },
                { icon: "trophy-outline" as const, text: "Earn reputation badges" },
                { icon: "map-outline" as const, text: "Access safe route history" },
              ].map((f) => (
                <View key={f.text} style={styles.featureItem}>
                  <View style={styles.featureIconBox}>
                    <Ionicons name={f.icon} size={18} color={Colors.accent} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const earnedBadges = BADGES.filter((b) => user.reputation >= b.minRep);
  const unearned = BADGES.filter((b) => user.reputation < b.minRep);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{user.username[0]?.toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.username}>{user.username}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
          <Pressable style={styles.logoutBtn} onPress={handleLogout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Reputation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reputation</Text>
          <RepBar rep={user.reputation} />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{Math.floor(user.reputation / 10)}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{Math.floor(user.reputation / 2)}</Text>
            <Text style={styles.statLabel}>Votes Cast</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.accent }]}>{user.reputation}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
        </View>

        {/* My Garage */}
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={styles.cardTitle}>My Garage</Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/car-profile");
              }}
            >
              <Ionicons name="add-circle" size={24} color={Colors.accent} />
            </Pressable>
          </View>
          {(!cars || cars.length === 0) ? (
            <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
              <Ionicons name="car-sport-outline" size={36} color={Colors.textMuted} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textMuted }}>
                Add your first ride
              </Text>
            </View>
          ) : (
            cars.map((car) => <GarageCard key={car.id} car={car} />)
          )}
        </View>

        {/* Saved Routes */}
        {savedRoutes.length > 0 && (
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={styles.cardTitle}>Saved Routes</Text>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountText}>{savedRoutes.length}</Text>
              </View>
            </View>
            {savedRoutes.map((route) => (
              <View key={route.id} style={styles.savedRouteCard}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({ pathname: "/(tabs)", params: {
                      loadRoute: route.id,
                      startLat: String(route.startLat),
                      startLng: String(route.startLng),
                      endLat: String(route.endLat),
                      endLng: String(route.endLng),
                      startAddr: route.startAddress || "",
                      endAddr: route.endAddress || "",
                    }});
                  }}
                >
                  <Text style={styles.savedRouteName} numberOfLines={1}>{route.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Ionicons name="speedometer-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.savedRouteDetail}>Risk: {route.riskScore}</Text>
                    </View>
                    {route.startAddress && (
                      <Text style={styles.savedRouteDetail} numberOfLines={1}>
                        {route.startAddress} → {route.endAddress || "Dest"}
                      </Text>
                    )}
                  </View>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      shareRouteMutation.mutate(route.id);
                    }}
                  >
                    <Ionicons
                      name={route.isPublic ? "link" : "share-outline"}
                      size={18}
                      color={route.isPublic ? Colors.accent : Colors.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      deleteRouteMutation.mutate(route.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Badges */}
        {earnedBadges.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Earned Badges</Text>
            <View style={styles.badgeGrid}>
              {earnedBadges.map((badge) => (
                <View key={badge.id} style={[styles.badgeItem, { borderColor: badge.color }]}>
                  <View style={[styles.badgeIcon, { backgroundColor: badge.color + "22" }]}>
                    <Ionicons name={badge.icon} size={24} color={badge.color} />
                  </View>
                  <Text style={[styles.badgeLabel, { color: badge.color }]}>{badge.label}</Text>
                  <Text style={styles.badgeDesc}>{badge.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Next badge */}
        {unearned.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Next Badge</Text>
            <View style={styles.nextBadgeRow}>
              <View style={[styles.badgeIconLg, { backgroundColor: Colors.bgElevated }]}>
                <Ionicons name={unearned[0].icon} size={28} color={Colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextBadgeName}>{unearned[0].label}</Text>
                <Text style={styles.nextBadgeDesc}>{unearned[0].desc}</Text>
                <Text style={styles.nextBadgeXP}>
                  {unearned[0].minRep - user.reputation} XP needed
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Subscription */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>
          <View style={styles.subRow}>
            <View style={styles.subInfo}>
              <View style={[styles.subBadge, user.subscriptionTier === "pro" ? { backgroundColor: Colors.accent + "22", borderColor: Colors.accent } : {}]}>
                <Ionicons
                  name={user.subscriptionTier === "pro" ? "rocket" : "person"}
                  size={16}
                  color={user.subscriptionTier === "pro" ? Colors.accent : Colors.textMuted}
                />
                <Text style={[styles.subBadgeText, user.subscriptionTier === "pro" ? { color: Colors.accent } : {}]}>
                  {user.subscriptionTier === "pro" ? "Pro" : "Free"}
                </Text>
              </View>
              <Text style={styles.subDesc}>
                {user.subscriptionTier === "pro"
                  ? "Live GPS navigation, hazard alerts, ad-free"
                  : "Upgrade for live navigation & hazard alerts"}
              </Text>
              {user.subscriptionTier === "pro" && user.subscriptionExpiresAt && (
                <Text style={styles.subExpiry}>
                  Pro until {formatMSTDateClient(user.subscriptionExpiresAt)}
                </Text>
              )}
            </View>
            {user.subscriptionTier === "pro" ? (
              <Pressable
                style={({ pressed }) => [styles.upgradeBtn, { backgroundColor: Colors.bgElevated }, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/manage-subscription");
                }}
              >
                <Text style={[styles.upgradeBtnText, { color: Colors.text }]}>Manage</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/paywall");
                }}
              >
                <Text style={styles.upgradeBtnText}>Upgrade</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Friends */}
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.friendsRow, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/friends");
            }}
          >
            <View style={styles.friendsIconBox}>
              <Ionicons name="people" size={20} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.friendsLabel}>Friends</Text>
              <Text style={styles.friendsDesc}>Find and manage friends, share live location</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>

        {/* Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>
          <View style={styles.settingsRow}>
            <Ionicons name="speedometer-outline" size={18} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Use Metric Units</Text>
              <Text style={styles.settingsDesc}>{system === "metric" ? "km, m, km/h" : "mi, ft, mph"}</Text>
            </View>
            <Switch
              value={system === "metric"}
              onValueChange={() => {
                Haptics.selectionAsync();
                toggleSystem();
              }}
              trackColor={{ false: Colors.bgElevated, true: Colors.accent + "66" }}
              thumbColor={system === "metric" ? Colors.accent : Colors.textMuted}
            />
          </View>
          <View style={[styles.settingsRow, { marginTop: 16 }]}>
            <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Share Live Location</Text>
              <Text style={styles.settingsDesc}>Show your location to friends on the map</Text>
            </View>
            <Switch
              value={shareLocation}
              onValueChange={(val) => {
                setShareLocation(val);
                locationSharingMutation.mutate(val);
              }}
              trackColor={{ false: Colors.bgElevated, true: Colors.accent + "66" }}
              thumbColor={shareLocation ? Colors.accent : Colors.textMuted}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.settingsRow, { marginTop: 16 }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/change-password");
            }}
          >
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Change Password</Text>
              <Text style={styles.settingsDesc}>Update your account password</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.settingsRow, { marginTop: 16 }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleExportData();
            }}
          >
            <Ionicons name="download-outline" size={18} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Export My Data</Text>
              <Text style={styles.settingsDesc}>Download a copy of your data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.settingsRow, { marginTop: 16 }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleDeleteAccount();
            }}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsLabel, { color: Colors.error }]}>Delete Account</Text>
              <Text style={styles.settingsDesc}>Permanently delete your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>

        {/* Legal */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legal</Text>
          <Pressable
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/privacy-policy");
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.legalLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.legalRow, { marginTop: 10 }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/terms-of-service");
            }}
          >
            <Ionicons name="document-text-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.legalLabel}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>

        {/* Community tips */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to Earn XP</Text>
          <View style={styles.tipList}>
            {[
              { icon: "add-circle-outline" as const, text: "Submit a hazard report", xp: "+10 XP" },
              { icon: "checkmark-circle-outline" as const, text: "Confirm a hazard", xp: "+2 XP" },
              { icon: "close-circle-outline" as const, text: "Mark a hazard as cleared", xp: "+3 XP" },
            ].map((t) => (
              <View key={t.text} style={styles.tipRow}>
                <Ionicons name={t.icon} size={18} color={Colors.textMuted} />
                <Text style={styles.tipText}>{t.text}</Text>
                <Text style={styles.tipXP}>{t.xp}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.deleteModalTitle}>Confirm Deletion</Text>
            <Text style={styles.deleteModalDesc}>Enter your password to permanently delete your account.</Text>
            <TextInput
              style={styles.deleteModalInput}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
              autoFocus
            />
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.deleteModalCancel} onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteModalConfirm} onPress={confirmDeleteAccount}>
                <Text style={styles.deleteModalConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  guestContainer: { padding: 24, alignItems: "center" },
  guestIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 24,
  },
  guestTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginBottom: 12 },
  guestSubtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    marginBottom: 12,
  },
  primaryBtnText: { color: Colors.bg, fontSize: 16, fontFamily: "Inter_700Bold" },
  secondaryBtn: {
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 36,
  },
  secondaryBtnText: { color: Colors.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  featureList: { width: "100%", gap: 12 },
  featureItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    gap: 14,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.bg },
  profileInfo: { flex: 1 },
  username: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  email: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  logoutBtn: { padding: 8 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeItem: {
    flex: 1,
    minWidth: "44%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.bgElevated,
  },
  badgeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badgeLabel: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  badgeDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },

  nextBadgeRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  badgeIconLg: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  nextBadgeName: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.text },
  nextBadgeDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  nextBadgeXP: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginTop: 4 },

  subRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  subInfo: { flex: 1, gap: 6 },
  subBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary },
  subDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  subExpiry: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginTop: 4 },
  upgradeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  upgradeBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.bg },

  tipList: { gap: 10 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tipText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  tipXP: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.tier1 },

  settingsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingsLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  settingsDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },

  legalRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  legalLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },

  sectionCount: {
    backgroundColor: Colors.accent + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountText: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.accent },
  savedRouteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  savedRouteName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  savedRouteDetail: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  friendsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  friendsIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  friendsLabel: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  friendsDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  deleteModalContent: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  deleteModalDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  deleteModalInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  deleteModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
  },
  deleteModalCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  deleteModalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: "center",
  },
  deleteModalConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
