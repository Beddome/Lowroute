import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";

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

export default function ProfileScreen() {
  const { user, logout, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleLogout = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
  };

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
        <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
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

  tipList: { gap: 10 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tipText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  tipXP: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.tier1 },
});
