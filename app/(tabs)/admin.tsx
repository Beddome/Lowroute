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
import { SEVERITY_TIERS, PROMO_TYPES, EVENT_TYPES, formatMSTDateClient, formatMSTClient } from "@/shared/types";
import type { PromoCode, AppEvent } from "@/shared/types";

type Tab = "stats" | "hazards" | "users" | "promos" | "events" | "reports";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  reputation: number;
  role: "user" | "admin";
  subscriptionTier: "free" | "pro";
  status?: "active" | "suspended" | "banned";
  reportCount?: number;
  createdAt?: string;
}

interface AdminReport {
  id: string;
  reporterId: string;
  contentType: string;
  contentId: string;
  targetUserId: string;
  reason: string;
  description?: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  reporterUsername?: string;
  targetUsername?: string;
}

interface AdminStats {
  totalUsers: number;
  totalHazards: number;
  totalEvents?: number;
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
        {(["stats", "hazards", "users", "reports", "promos", "events"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = { stats: "Overview", hazards: "Hazards", users: "Users", reports: "Reports", promos: "Promos", events: "Events" };
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {activeTab === "stats" && <StatsPanel />}
      {activeTab === "hazards" && <HazardsPanel />}
      {activeTab === "users" && <UsersPanel currentUserId={user.id} />}
      {activeTab === "reports" && <ReportsPanel />}
      {activeTab === "promos" && <PromoCodesPanel />}
      {activeTab === "events" && <EventsPanel />}
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
          {stats.totalEvents != null && (
            <View style={[styles.statRow, { marginBottom: 16 }]}>
              <StatCard icon="calendar" label="Total Events" value={stats.totalEvents} color="#8B5CF6" />
            </View>
          )}
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
  const [searchText, setSearchText] = useState("");
  const usersQuery = useQuery<AdminUser[]>({ queryKey: ["/api/admin/users"] });

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
    },
    onSuccess: invalidateUsers,
  });

  const suspendMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/users/${id}/suspend`); },
    onSuccess: invalidateUsers,
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/users/${id}/unsuspend`); },
    onSuccess: invalidateUsers,
  });

  const banMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/users/${id}/ban`); },
    onSuccess: invalidateUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/admin/users/${id}`); },
    onSuccess: invalidateUsers,
  });

  const cancelMembershipMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/admin/users/${id}/cancel-membership`); },
    onSuccess: invalidateUsers,
  });

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
      if (confirm(`${title}: ${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "destructive", onPress: onConfirm },
      ]);
    }
  };

  if (usersQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const allUsers = usersQuery.data || [];
  const users = searchText.trim()
    ? allUsers.filter(u => u.username.toLowerCase().includes(searchText.toLowerCase()) || u.email.toLowerCase().includes(searchText.toLowerCase()))
    : allUsers;

  return (
    <FlatList
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, users.length === 0 && styles.centered]}
      refreshControl={<RefreshControl refreshing={usersQuery.isRefetching} onRefresh={() => usersQuery.refetch()} tintColor={Colors.accent} />}
      ListHeaderComponent={
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />
      }
      ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
      renderItem={({ item }) => {
        const isSelf = item.id === currentUserId;
        const statusColor = item.status === "suspended" ? "#F59E0B" : item.status === "banned" ? Colors.error : Colors.success;
        return (
          <View style={styles.userCard}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{item.username[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName} numberOfLines={1}>{item.username}</Text>
                {item.role === "admin" && (
                  <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>
                )}
                {isSelf && (
                  <View style={styles.selfBadge}><Text style={styles.selfBadgeText}>YOU</Text></View>
                )}
                {item.status && item.status !== "active" && (
                  <View style={[styles.adminBadge, { backgroundColor: statusColor + "22", borderColor: statusColor }]}>
                    <Text style={[styles.adminBadgeText, { color: statusColor }]}>{item.status.toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.userMeta}>
                {item.email} · Rep: {item.reputation} · {item.subscriptionTier}
                {(item.reportCount ?? 0) > 0 ? ` · ⚠ ${item.reportCount} reports` : ""}
              </Text>
              {!isSelf && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#6366F122" }]}
                    onPress={() => {
                      const newRole = item.role === "admin" ? "user" : "admin";
                      confirmAction("Change Role", `${item.role === "admin" ? "Demote" : "Promote"} ${item.username}?`, () => roleMutation.mutate({ id: item.id, role: newRole }));
                    }}
                  >
                    <Text style={[styles.actionBtnText, { color: "#6366F1" }]}>{item.role === "admin" ? "Demote" : "Promote"}</Text>
                  </TouchableOpacity>
                  {item.status !== "suspended" && item.status !== "banned" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#F59E0B22" }]}
                      onPress={() => confirmAction("Suspend", `Suspend ${item.username}?`, () => suspendMutation.mutate(item.id))}
                    >
                      <Text style={[styles.actionBtnText, { color: "#F59E0B" }]}>Suspend</Text>
                    </TouchableOpacity>
                  )}
                  {item.status === "suspended" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: Colors.success + "22" }]}
                      onPress={() => confirmAction("Unsuspend", `Unsuspend ${item.username}?`, () => unsuspendMutation.mutate(item.id))}
                    >
                      <Text style={[styles.actionBtnText, { color: Colors.success }]}>Unsuspend</Text>
                    </TouchableOpacity>
                  )}
                  {item.status !== "banned" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: Colors.error + "22" }]}
                      onPress={() => confirmAction("Ban", `Permanently ban ${item.username}?`, () => banMutation.mutate(item.id))}
                    >
                      <Text style={[styles.actionBtnText, { color: Colors.error }]}>Ban</Text>
                    </TouchableOpacity>
                  )}
                  {item.subscriptionTier !== "free" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#8B5CF622" }]}
                      onPress={() => confirmAction("Cancel Membership", `Downgrade ${item.username} to free?`, () => cancelMembershipMutation.mutate(item.id))}
                    >
                      <Text style={[styles.actionBtnText, { color: "#8B5CF6" }]}>Cancel Sub</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: Colors.error + "22" }]}
                    onPress={() => confirmAction("Delete Account", `Permanently delete ${item.username} and all their data? This cannot be undone.`, () => deleteMutation.mutate(item.id))}
                  >
                    <Text style={[styles.actionBtnText, { color: Colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

function ReportsPanel() {
  const reportsQuery = useQuery<AdminReport[]>({ queryKey: ["/api/admin/reports"] });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      await apiRequest("PATCH", `/api/admin/reports/${id}`, { status, adminNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
    },
  });

  const handleAction = (report: AdminReport, newStatus: string) => {
    const title = newStatus === "resolved" ? "Resolve" : newStatus === "dismissed" ? "Dismiss" : "Review";
    if (Platform.OS === "web") {
      const notes = prompt(`${title} report? Add optional notes:`) ?? "";
      updateMutation.mutate({ id: report.id, status: newStatus, adminNotes: notes || undefined });
    } else {
      Alert.alert(title, `Mark this report as ${newStatus}?`, [
        { text: "Cancel", style: "cancel" },
        { text: title, onPress: () => updateMutation.mutate({ id: report.id, status: newStatus }) },
      ]);
    }
  };

  if (reportsQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const reports = reportsQuery.data || [];

  const reasonLabels: Record<string, string> = {
    spam: "Spam",
    inappropriate: "Inappropriate",
    scam_fraud: "Scam/Fraud",
    harassment: "Harassment",
    inaccurate: "Inaccurate",
    other: "Other",
  };

  const statusColors: Record<string, string> = {
    pending: "#F59E0B",
    reviewed: "#6366F1",
    resolved: Colors.success,
    dismissed: Colors.textMuted,
  };

  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, reports.length === 0 && styles.centered]}
      refreshControl={<RefreshControl refreshing={reportsQuery.isRefetching} onRefresh={() => reportsQuery.refetch()} tintColor={Colors.accent} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No reports</Text>}
      renderItem={({ item }) => {
        const sColor = statusColors[item.status] || Colors.textMuted;
        return (
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <View style={[styles.adminBadge, { backgroundColor: sColor + "22", borderColor: sColor }]}>
                <Text style={[styles.adminBadgeText, { color: sColor }]}>{item.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.reportMeta}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.reportReason}>
              <Text style={{ color: Colors.text, fontFamily: "Inter_600SemiBold" }}>Reason: </Text>
              {reasonLabels[item.reason] || item.reason}
            </Text>
            <Text style={styles.reportMeta}>
              Type: {item.contentType} · Reporter: {item.reporterUsername || item.reporterId?.substring(0, 8)}
            </Text>
            <Text style={styles.reportMeta}>
              Reported user: {item.targetUsername || item.targetUserId?.substring(0, 8)}
            </Text>
            {item.description && (
              <Text style={styles.reportDescription} numberOfLines={3}>{item.description}</Text>
            )}
            {item.adminNotes && (
              <Text style={[styles.reportDescription, { color: "#6366F1" }]}>Notes: {item.adminNotes}</Text>
            )}
            {item.status === "pending" && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#6366F122" }]}
                  onPress={() => handleAction(item, "reviewed")}
                >
                  <Text style={[styles.actionBtnText, { color: "#6366F1" }]}>Review</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.success + "22" }]}
                  onPress={() => handleAction(item, "resolved")}
                >
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>Resolve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.textMuted + "22" }]}
                  onPress={() => handleAction(item, "dismissed")}
                >
                  <Text style={[styles.actionBtnText, { color: Colors.textMuted }]}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}
            {item.status === "reviewed" && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.success + "22" }]}
                  onPress={() => handleAction(item, "resolved")}
                >
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>Resolve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.textMuted + "22" }]}
                  onPress={() => handleAction(item, "dismissed")}
                >
                  <Text style={[styles.actionBtnText, { color: Colors.textMuted }]}>Dismiss</Text>
                </TouchableOpacity>
              </View>
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
  const [customCode, setCustomCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const promosQuery = useQuery<PromoCode[]>({ queryKey: ["/api/admin/promo-codes"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        type: promoType,
        maxUses: parseInt(maxUses) || 1,
      };
      if (customCode.trim()) body.code = customCode.trim();
      if (expiryDate.trim()) body.expiresAt = expiryDate.trim();
      await apiRequest("POST", "/api/admin/promo-codes", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setMaxUses("1");
      setCustomCode("");
      setExpiryDate("");
    },
    onError: (err: any) => {
      let msg = "Failed to create promo code";
      if (err?.message) {
        const match = err.message.match(/^\d+:\s*(.+)/);
        if (match) {
          try { msg = JSON.parse(match[1]).message || msg; } catch {}
        }
      }
      Alert.alert("Error", msg);
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
          <View style={promoStyles.inputRow}>
            <Text style={promoStyles.inputLabel}>Code</Text>
            <TextInput
              style={promoStyles.input}
              value={customCode}
              onChangeText={(t) => setCustomCode(t.toUpperCase().replace(/[^A-Z0-9\-]/g, ""))}
              placeholder="Auto-generate"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          <Text style={promoStyles.inputHint}>Leave blank to auto-generate, or enter a custom code (e.g. LOWRIDER50)</Text>
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
          <View style={promoStyles.inputRow}>
            <Text style={promoStyles.inputLabel}>Expires</Text>
            <TextInput
              style={promoStyles.input}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD (optional)"
              placeholderTextColor={Colors.textMuted}
              autoCorrect={false}
            />
          </View>
          <Text style={promoStyles.inputHint}>Set a date limit, a usage limit, or both</Text>
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
                <Text style={promoStyles.createBtnText}>{customCode.trim() ? "Create Code" : "Generate Code"}</Text>
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
                {item.expiresAt ? formatMSTDateClient(item.expiresAt) : "No expiry"}
              </Text>
            </View>
            <Text style={promoStyles.promoCreated}>Created {formatMSTClient(item.createdAt)}</Text>
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

function EventsPanel() {
  const eventsQuery = useQuery<AppEvent[]>({ queryKey: ["/api/admin/events"] });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/admin/events/${id}/status`, { status: "cancelled" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });

  const confirmCancel = (id: string, title: string) => {
    if (Platform.OS === "web") {
      if (confirm(`Cancel event "${title}"?`)) {
        cancelMutation.mutate(id);
      }
    } else {
      Alert.alert("Cancel Event", `Cancel "${title}"?`, [
        { text: "No", style: "cancel" },
        { text: "Cancel Event", style: "destructive", onPress: () => cancelMutation.mutate(id) },
      ]);
    }
  };

  const confirmDelete = (id: string, title: string) => {
    if (Platform.OS === "web") {
      if (confirm(`Delete event "${title}"? This cannot be undone.`)) {
        deleteMutation.mutate(id);
      }
    } else {
      Alert.alert("Delete Event", `Delete "${title}"? This cannot be undone.`, [
        { text: "No", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]);
    }
  };

  if (eventsQuery.isLoading) {
    return <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  }

  const events = eventsQuery.data || [];

  const getEventTypeInfo = (type: string) => EVENT_TYPES.find((t) => t.value === type);

  const getStatusStyle = (status: string) => {
    if (status === "cancelled") return { text: "Cancelled", color: Colors.error };
    if (status === "completed") return { text: "Completed", color: Colors.textMuted };
    return { text: "Active", color: Colors.success };
  };

  return (
    <FlatList
      data={events}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, events.length === 0 && styles.centered]}
      refreshControl={<RefreshControl refreshing={eventsQuery.isRefetching} onRefresh={() => eventsQuery.refetch()} tintColor={Colors.accent} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No events created yet</Text>}
      renderItem={({ item }) => {
        const typeInfo = getEventTypeInfo(item.eventType);
        const statusInfo = getStatusStyle(item.status);
        const eventDate = new Date(item.date);
        const isCancelled = item.status === "cancelled";
        return (
          <View style={[eventStyles.card, { borderLeftColor: isCancelled ? Colors.error : "#8B5CF6" }]}>
            <View style={eventStyles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={eventStyles.title} numberOfLines={1}>{item.title}</Text>
                <View style={eventStyles.metaRow}>
                  {typeInfo && (
                    <View style={eventStyles.typeBadge}>
                      <Ionicons name={typeInfo.icon as any} size={12} color="#8B5CF6" />
                      <Text style={eventStyles.typeBadgeText}>{typeInfo.label}</Text>
                    </View>
                  )}
                  <View style={[eventStyles.statusBadge, { backgroundColor: statusInfo.color + "20" }]}>
                    <Text style={[eventStyles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
                  </View>
                </View>
              </View>
              <View style={eventStyles.actions}>
                {!isCancelled && (
                  <TouchableOpacity
                    onPress={() => confirmCancel(item.id, item.title)}
                    disabled={cancelMutation.isPending}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={22} color={Colors.tier2} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => confirmDelete(item.id, item.title)}
                  disabled={deleteMutation.isPending}
                  hitSlop={8}
                >
                  <Ionicons name="trash" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={eventStyles.detailRow}>
              <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
              <Text style={eventStyles.detailText}>{formatMSTClient(eventDate)}</Text>
            </View>
            <View style={eventStyles.detailRow}>
              <Ionicons name="people-outline" size={13} color={Colors.textSecondary} />
              <Text style={eventStyles.detailText}>
                {item.rsvpCount} RSVP{item.rsvpCount !== 1 ? "s" : ""}{item.maxAttendees ? ` / ${item.maxAttendees} max` : ""}
              </Text>
            </View>
            {item.creatorUsername && (
              <View style={eventStyles.detailRow}>
                <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
                <Text style={eventStyles.detailText}>{item.creatorUsername}</Text>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const eventStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#8B5CF620",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#8B5CF6",
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  detailText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

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
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    width: 65,
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
  inputHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 12,
    marginLeft: 77,
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
    flexWrap: "wrap",
    gap: 12,
  },
  promoMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  promoCreated: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
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
    alignItems: "flex-start",
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
  searchInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  reportCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  reportReason: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  reportMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  reportDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    fontStyle: "italic" as const,
  },
});
