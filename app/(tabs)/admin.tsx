import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TextInput,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/query-client";
import { SEVERITY_TIERS, PROMO_TYPES } from "@/shared/types";
import type { PromoCode } from "@/shared/types";

type Tab = "stats" | "hazards" | "users" | "promos";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  reputation: number;
  role: "user" | "admin";
  subscriptionTier: "free" | "pro";
}

interface AdminStats {
  totalUsers: number;
  totalHazards: number;
  hazardsBySeverity: Array<{ severity: number; count: number }>;
}

interface AdminHazard {
  id: string;
  title: string;
  type: string;
  severity: number;
  status: string;
  lat: number;
  lng: number;
  upvotes: number;
  downvotes: number;
  createdAt: string;
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const isWeb = Platform.OS === "web";

  if (!user || user.role !== "admin") {
    return (
      <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Admin access required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top, paddingBottom: isWeb ? 34 : 0 }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="shield-crown" size={28} color={Colors.accent} />
        <Text style={styles.headerTitle}>Admin</Text>
      </View>
      <View style={styles.tabBar}>
        {(["stats", "hazards", "users", "promos"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === "stats" ? "Overview" : tab === "hazards" ? "Hazards" : tab === "users" ? "Users" : "Promos"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeTab === "stats" && <StatsPanel />}
      {activeTab === "hazards" && <HazardsPanel />}
      {activeTab === "users" && <UsersPanel currentUserId={user.id} />}
      {activeTab === "promos" && <PromoCodesPanel />}
    </View>
  );
}

function StatsPanel() {
  const statsQuery = useQuery<AdminStats>({ queryKey: ["/api/admin/stats"] });

  if (statsQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const stats = statsQuery.data;
  if (!stats) {
    return <View style={styles.centered}><Text style={styles.emptyText}>Failed to load stats</Text></View>;
  }

  const severityMap: Record<number, number> = {};
  if (stats.hazardsBySeverity) {
    for (const entry of stats.hazardsBySeverity) {
      severityMap[entry.severity] = entry.count;
    }
  }

  return (
    <FlatList
      data={[1]}
      keyExtractor={() => "stats"}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={statsQuery.isRefetching} onRefresh={() => statsQuery.refetch()} tintColor={Colors.accent} />}
      renderItem={() => (
        <View>
          <View style={styles.statRow}>
            <StatCard icon="people" label="Total Users" value={stats.totalUsers} color="#6366F1" />
            <StatCard icon="warning" label="Total Hazards" value={stats.totalHazards} color={Colors.accent} />
          </View>
          <Text style={styles.sectionTitle}>Hazards by Severity</Text>
          {SEVERITY_TIERS.map((tier) => (
            <View key={tier.tier} style={[styles.severityRow, { borderLeftColor: tier.color }]}>
              <View style={styles.severityInfo}>
                <Text style={[styles.severityLabel, { color: tier.color }]}>{tier.label}</Text>
                <Text style={styles.severityDesc}>{tier.description}</Text>
              </View>
              <View style={[styles.severityBadge, { backgroundColor: tier.bg }]}>
                <Text style={[styles.severityCount, { color: tier.color }]}>{severityMap[tier.tier] ?? 0}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    />
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderColor: color + "30" }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HazardsPanel() {
  const hazardsQuery = useQuery<AdminHazard[]>({ queryKey: ["/api/hazards"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/hazards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hazards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });

  const confirmDelete = (id: string, title: string) => {
    if (Platform.OS === "web") {
      if (confirm(`Delete hazard "${title}"?`)) {
        deleteMutation.mutate(id);
      }
    } else {
      Alert.alert("Delete Hazard", `Delete "${title}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]);
    }
  };

  if (hazardsQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const hazards = hazardsQuery.data || [];

  return (
    <FlatList
      data={hazards}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, hazards.length === 0 && styles.centered]}
      refreshControl={<RefreshControl refreshing={hazardsQuery.isRefetching} onRefresh={() => hazardsQuery.refetch()} tintColor={Colors.accent} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No hazards reported yet</Text>}
      renderItem={({ item }) => {
        const tier = SEVERITY_TIERS[Math.min(item.severity - 1, 3)];
        return (
          <View style={[styles.hazardCard, { borderLeftColor: tier.color }]}>
            <View style={styles.hazardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hazardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.hazardMeta}>
                  {item.type.replace(/_/g, " ")} {"\u00B7"} {tier.label}
                </Text>
              </View>
              <View style={styles.hazardActions}>
                <View style={styles.voteInfo}>
                  <Ionicons name="arrow-up" size={14} color={Colors.success} />
                  <Text style={styles.voteText}>{item.upvotes}</Text>
                  <Ionicons name="arrow-down" size={14} color={Colors.error} />
                  <Text style={styles.voteText}>{item.downvotes}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => confirmDelete(item.id, item.title)}
                  disabled={deleteMutation.isPending}
                  hitSlop={8}
                >
                  <Ionicons name="trash" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const usersQuery = useQuery<AdminUser[]>({ queryKey: ["/api/admin/users"] });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });

  const toggleRole = (user: AdminUser) => {
    if (user.id === currentUserId) return;
    const newRole = user.role === "admin" ? "user" : "admin";
    const action = newRole === "admin" ? "Promote" : "Demote";

    if (Platform.OS === "web") {
      if (confirm(`${action} ${user.username} to ${newRole}?`)) {
        roleMutation.mutate({ id: user.id, role: newRole });
      }
    } else {
      Alert.alert(`${action} User`, `${action} ${user.username} to ${newRole}?`, [
        { text: "Cancel", style: "cancel" },
        { text: action, onPress: () => roleMutation.mutate({ id: user.id, role: newRole }) },
      ]);
    }
  };

  if (usersQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const users = usersQuery.data || [];

  return (
    <FlatList
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, users.length === 0 && styles.centered]}
      refreshControl={<RefreshControl refreshing={usersQuery.isRefetching} onRefresh={() => usersQuery.refetch()} tintColor={Colors.accent} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
      renderItem={({ item }) => {
        const isSelf = item.id === currentUserId;
        return (
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName} numberOfLines={1}>{item.username}</Text>
                {item.role === "admin" && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>ADMIN</Text>
                  </View>
                )}
                {isSelf && (
                  <View style={styles.selfBadge}>
                    <Text style={styles.selfBadgeText}>YOU</Text>
                  </View>
                )}
              </View>
              <Text style={styles.userMeta}>
                {item.email} {"\u00B7"} Rep: {item.reputation} {"\u00B7"} {item.subscriptionTier}
              </Text>
            </View>
            {!isSelf && (
              <TouchableOpacity onPress={() => toggleRole(item)} disabled={roleMutation.isPending} hitSlop={8}>
                <Ionicons
                  name={item.role === "admin" ? "arrow-down-circle" : "arrow-up-circle"}
                  size={24}
                  color={item.role === "admin" ? Colors.error : Colors.success}
                />
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
  );
}

function PromoCodesPanel() {
  const [promoType, setPromoType] = useState<string>("7_day");
  const [maxUses, setMaxUses] = useState("1");

  const promosQuery = useQuery<PromoCode[]>({ queryKey: ["/api/admin/promo-codes"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/promo-codes", {
        type: promoType,
        maxUses: parseInt(maxUses) || 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setMaxUses("1");
    },
    onError: () => {
      Alert.alert("Error", "Failed to create promo code");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/admin/promo-codes/${id}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    },
  });

  const confirmDeactivate = (id: string, code: string) => {
    if (Platform.OS === "web") {
      if (confirm(`Deactivate promo code "${code}"?`)) {
        deactivateMutation.mutate(id);
      }
    } else {
      Alert.alert("Deactivate Code", `Deactivate "${code}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => deactivateMutation.mutate(id) },
      ]);
    }
  };

  if (promosQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const promos = promosQuery.data || [];

  const getStatusLabel = (p: PromoCode) => {
    if (!p.isActive) return { text: "Inactive", color: Colors.textMuted };
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return { text: "Expired", color: Colors.error };
    if (p.currentUses >= p.maxUses) return { text: "Maxed", color: Colors.tier2 };
    return { text: "Active", color: Colors.tier1 };
  };

  const typeLabel = (type: string) => PROMO_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <FlatList
      data={promos}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, promos.length === 0 && styles.centered]}
      refreshControl={<RefreshControl refreshing={promosQuery.isRefetching} onRefresh={() => promosQuery.refetch()} tintColor={Colors.accent} />}
      ListHeaderComponent={
        <View style={promoStyles.createCard}>
          <Text style={styles.sectionTitle}>Create Promo Code</Text>
          <View style={promoStyles.typeRow}>
            {PROMO_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[promoStyles.typeChip, promoType === t.value && promoStyles.typeChipActive]}
                onPress={() => setPromoType(t.value)}
              >
                <Text style={[promoStyles.typeChipText, promoType === t.value && promoStyles.typeChipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={promoStyles.inputRow}>
            <Text style={promoStyles.inputLabel}>Max Uses</Text>
            <TextInput
              style={promoStyles.input}
              value={maxUses}
              onChangeText={setMaxUses}
              keyboardType="number-pad"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <TouchableOpacity
            style={[promoStyles.createBtn, createMutation.isPending && { opacity: 0.6 }]}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <>
                <Ionicons name="add-circle" size={18} color={Colors.bg} />
                <Text style={promoStyles.createBtnText}>Generate Code</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      }
      ListEmptyComponent={<Text style={styles.emptyText}>No promo codes created yet</Text>}
      renderItem={({ item }) => {
        const status = getStatusLabel(item);
        return (
          <View style={promoStyles.promoCard}>
            <View style={promoStyles.promoHeader}>
              <Text style={promoStyles.promoCode}>{item.code}</Text>
              <View style={[promoStyles.statusBadge, { backgroundColor: status.color + "20" }]}>
                <Text style={[promoStyles.statusText, { color: status.color }]}>{status.text}</Text>
              </View>
            </View>
            <View style={promoStyles.promoMeta}>
              <Text style={promoStyles.promoMetaText}>{typeLabel(item.type)}</Text>
              <Text style={promoStyles.promoMetaText}>
                {item.currentUses}/{item.maxUses} used
              </Text>
              <Text style={promoStyles.promoMetaText}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {item.isActive && (
              <TouchableOpacity
                style={promoStyles.deactivateBtn}
                onPress={() => confirmDeactivate(item.id, item.code)}
                disabled={deactivateMutation.isPending}
              >
                <Ionicons name="close-circle" size={16} color={Colors.error} />
                <Text style={promoStyles.deactivateText}>Deactivate</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
  );
}

const promoStyles = StyleSheet.create({
  createCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: {
    backgroundColor: Colors.accent + "20",
    borderColor: Colors.accent,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.textMuted,
  },
  typeChipTextActive: {
    color: Colors.accent,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  createBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.bg,
  },
  promoCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  promoCode: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.accent,
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  promoMeta: {
    flexDirection: "row",
    gap: 12,
  },
  promoMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  deactivateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  deactivateText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.error,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.bgElevated,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 12,
  },
  severityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 8,
  },
  severityInfo: {
    flex: 1,
  },
  severityLabel: {
    fontSize: 15,
    fontWeight: "700" as const,
  },
  severityDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  severityBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 40,
    alignItems: "center",
  },
  severityCount: {
    fontSize: 18,
    fontWeight: "800" as const,
  },
  hazardCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 8,
  },
  hazardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  hazardTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  hazardMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
    textTransform: "capitalize" as const,
  },
  hazardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  voteInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  voteText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginRight: 4,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.accent,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.text,
    maxWidth: 120,
  },
  userMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Colors.accent,
  },
  selfBadge: {
    backgroundColor: "#6366F120",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#6366F1",
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 12,
  },
});
