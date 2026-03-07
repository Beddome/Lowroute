import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { SEVERITY_TIERS, HAZARD_TYPES } from "@/shared/types";
import type { Hazard } from "@/shared/types";

function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function HazardCard({ hazard, onPress }: { hazard: Hazard; onPress: () => void }) {
  const tier = SEVERITY_TIERS[hazard.severity - 1];
  const hazardType = HAZARD_TYPES.find((t) => t.value === hazard.type);
  const tierIcon =
    hazard.severity >= 4 ? "skull-outline" :
    hazard.severity >= 3 ? "warning-outline" :
    hazard.severity >= 2 ? "alert-circle-outline" :
    "information-circle-outline";

  return (
    <Pressable
      style={({ pressed }) => [styles.hazardCard, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      <View style={[styles.hazardTierDot, { backgroundColor: tier?.color ?? Colors.tier1 }]}>
        <Ionicons name={tierIcon} size={16} color="#000" />
      </View>
      <View style={styles.hazardCardBody}>
        <View style={styles.hazardCardHeader}>
          <Text style={styles.hazardTitle} numberOfLines={1}>{hazard.title}</Text>
          <View style={[styles.tierBadge, { backgroundColor: tier?.bg, borderColor: tier?.color }]}>
            <Text style={[styles.tierBadgeText, { color: tier?.color }]}>T{hazard.severity}</Text>
          </View>
        </View>
        <Text style={styles.hazardType}>{hazardType?.label}</Text>
        <View style={styles.hazardMeta}>
          <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.hazardMetaText}>{formatRelativeTime(hazard.createdAt)}</Text>
          <Ionicons name="thumbs-up" size={12} color={Colors.textMuted} />
          <Text style={styles.hazardMetaText}>{hazard.upvotes}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function MapScreenWeb() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<number | null>(null);

  const { data: hazards = [], isLoading } = useQuery<Hazard[]>({
    queryKey: ["/api/hazards"],
  });

  const filtered = hazards.filter((h) => {
    if (selectedFilter !== null && h.severity !== selectedFilter) return false;
    if (search && !h.title.toLowerCase().includes(search.toLowerCase()) &&
        !h.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tierCounts = SEVERITY_TIERS.map((t) => ({
    ...t,
    count: hazards.filter((h) => h.severity === t.tier).length,
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 67 }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBox}>
            <Ionicons name="car-sport" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.appTitle}>LowRoute</Text>
            <Text style={styles.appSubtitle}>Road Hazard Map</Text>
          </View>
        </View>
        <Pressable
          style={styles.reportFab}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: "/report", params: { lat: "34.0522", lng: "-118.2437" } });
          }}
        >
          <Ionicons name="warning" size={16} color={Colors.bg} />
          <Text style={styles.reportFabText}>Report</Text>
        </Pressable>
      </View>

      {/* Map placeholder */}
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapPlaceholderContent}>
          <Ionicons name="map" size={48} color={Colors.textMuted} />
          <Text style={styles.mapPlaceholderTitle}>Interactive Map</Text>
          <Text style={styles.mapPlaceholderText}>
            Use the Expo Go app on your phone to access the full interactive map with hazard overlays and route planning.
          </Text>
        </View>
        <View style={styles.statsRow}>
          {tierCounts.map((t) => (
            <View key={t.tier} style={[styles.statPill, { borderColor: t.color + "44" }]}>
              <View style={[styles.statDot, { backgroundColor: t.color }]}>
                <Text style={styles.statTierNum}>{t.tier}</Text>
              </View>
              <Text style={[styles.statCount, { color: t.color }]}>{t.count}</Text>
            </View>
          ))}
          <View style={[styles.statPill, { borderColor: Colors.border }]}>
            <Ionicons name="flag" size={14} color={Colors.textSecondary} />
            <Text style={styles.statCountTotal}>{hazards.length}</Text>
          </View>
        </View>
      </View>

      {/* Search + Filter */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search hazards..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, selectedFilter === null && styles.filterChipActive]}
            onPress={() => setSelectedFilter(null)}
          >
            <Text style={[styles.filterChipText, selectedFilter === null && styles.filterChipTextActive]}>
              All
            </Text>
          </Pressable>
          {SEVERITY_TIERS.map((t) => (
            <Pressable
              key={t.tier}
              style={[
                styles.filterChip,
                selectedFilter === t.tier && { borderColor: t.color, backgroundColor: t.bg },
              ]}
              onPress={() => setSelectedFilter(selectedFilter === t.tier ? null : t.tier)}
            >
              <View style={[styles.filterDot, { backgroundColor: t.color }]} />
              <Text style={[styles.filterChipText, selectedFilter === t.tier && { color: t.color }]}>
                T{t.tier} {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Hazard list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 34 + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.accent} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.tier1} />
            <Text style={styles.emptyTitle}>No hazards found</Text>
            <Text style={styles.emptyText}>
              {search || selectedFilter !== null ? "Try adjusting your filters" : "This area looks clear for low cars"}
            </Text>
          </View>
        ) : (
          filtered.map((h) => (
            <HazardCard
              key={h.id}
              hazard={h}
              onPress={() => router.push({ pathname: "/hazard/[id]", params: { id: h.id } })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  appTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  appSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  reportFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  reportFabText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.bg },

  mapPlaceholder: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  mapPlaceholderContent: {
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  mapPlaceholderTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  mapPlaceholderText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 8,
    justifyContent: "center",
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: Colors.bgElevated,
  },
  statDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statTierNum: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#000" },
  statCount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statCountTotal: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.textSecondary },

  searchSection: { paddingHorizontal: 16, marginBottom: 8, gap: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row" },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  filterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },

  list: { flex: 1, paddingHorizontal: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center" },

  hazardCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  hazardTierDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hazardCardBody: { flex: 1, gap: 4 },
  hazardCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hazardTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tierBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  hazardType: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  hazardMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  hazardMetaText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});
