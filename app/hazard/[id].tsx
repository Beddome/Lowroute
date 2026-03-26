import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { SEVERITY_TIERS, HAZARD_TYPES } from "@/shared/types";
import type { Hazard } from "@/shared/types";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.7 ? Colors.tier1 : score >= 0.4 ? Colors.tier2 : Colors.tier3;
  return (
    <View style={confStyles.container}>
      <View style={confStyles.header}>
        <Text style={confStyles.label}>Community Confidence</Text>
        <Text style={[confStyles.value, { color }]}>{pct}%</Text>
      </View>
      <View style={confStyles.track}>
        <View style={[confStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const confStyles = StyleSheet.create({
  container: { marginBottom: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  value: { fontSize: 13, fontFamily: "Inter_700Bold" },
  track: { height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});

function resolvePhotoUrl(photoUrl: string): string {
  if (photoUrl.startsWith("http")) return photoUrl;
  const base = getApiUrl();
  return new URL(photoUrl, base).toString();
}

export default function HazardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [photoExpanded, setPhotoExpanded] = useState(false);

  const { data: hazard, isLoading } = useQuery<Hazard>({
    queryKey: [`/api/hazards/${id}`],
    enabled: !!id,
  });

  const voteMutation = useMutation({
    mutationFn: async (voteType: "confirm" | "downvote" | "clear") => {
      const res = await apiRequest("POST", `/api/hazards/${id}/vote`, { voteType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hazards/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazards"] });
    },
  });

  const handleVote = async (voteType: "confirm" | "downvote" | "clear") => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    voteMutation.mutate(voteType);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!hazard) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Hazard not found</Text>
      </View>
    );
  }

  const tier = SEVERITY_TIERS[hazard.severity - 1];
  const hazardType = HAZARD_TYPES.find((t) => t.value === hazard.type);
  const isCleared = hazard.status === "cleared";

  const tierIcon =
    hazard.severity >= 4 ? "skull-outline" :
    hazard.severity >= 3 ? "warning-outline" :
    hazard.severity >= 2 ? "alert-circle-outline" :
    "information-circle-outline";

  const screenWidth = Dimensions.get("window").width;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={[styles.severityBadge, { backgroundColor: tier?.bg, borderColor: tier?.color }]}>
          <Ionicons name={tierIcon} size={16} color={tier?.color} />
          <Text style={[styles.severityText, { color: tier?.color }]}>
            Tier {hazard.severity} — {tier?.label}
          </Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.title}>{hazard.title}</Text>
      <Text style={styles.typeBadgeText}>{hazardType?.label ?? hazard.type}</Text>

      {isCleared && (
        <View style={styles.clearedBanner}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.tier1} />
          <Text style={styles.clearedText}>Marked as Cleared</Text>
        </View>
      )}

      {hazard.photoUrl && (
        <Pressable
          style={styles.photoCard}
          onPress={() => setPhotoExpanded(true)}
        >
          <Image
            source={{ uri: resolvePhotoUrl(hazard.photoUrl) }}
            style={styles.photoThumbnail}
            resizeMode="cover"
          />
          <View style={styles.photoExpandHint}>
            <Ionicons name="expand-outline" size={16} color={Colors.white} />
          </View>
        </Pressable>
      )}

      {hazard.photoUrl && (
        <Modal
          visible={photoExpanded}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoExpanded(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setPhotoExpanded(false)}
          >
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => setPhotoExpanded(false)}
              hitSlop={12}
            >
              <Ionicons name="close-circle" size={32} color={Colors.white} />
            </Pressable>
            <Image
              source={{ uri: resolvePhotoUrl(hazard.photoUrl) }}
              style={[styles.modalImage, { width: screenWidth - 32 }]}
              resizeMode="contain"
            />
          </Pressable>
        </Modal>
      )}

      {tier && (
        <View style={[styles.tierDetailCard, { borderColor: tier.color, backgroundColor: tier.bg }]}>
          <View style={styles.tierDetailHeader}>
            <Ionicons name={tierIcon} size={22} color={tier.color} />
            <Text style={[styles.tierDetailTitle, { color: tier.color }]}>{tier.label} — {tier.description}</Text>
          </View>
          <Text style={[styles.tierDetailText, { color: tier.color + "bb" }]}>{tier.detail}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Report Details</Text>
        <Text style={styles.description}>{hazard.description}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText}>
            {hazard.lat.toFixed(4)}, {hazard.lng.toFixed(4)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText}>{formatRelativeTime(hazard.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <ConfidenceMeter score={hazard.confidenceScore} />
        <View style={styles.voteStats}>
          <View style={styles.voteStat}>
            <Ionicons name="thumbs-up" size={14} color={Colors.tier1} />
            <Text style={[styles.voteStatText, { color: Colors.tier1 }]}>{hazard.upvotes} confirmed</Text>
          </View>
          <View style={styles.voteStat}>
            <Ionicons name="thumbs-down" size={14} color={Colors.tier4} />
            <Text style={[styles.voteStatText, { color: Colors.tier4 }]}>{hazard.downvotes} disputed</Text>
          </View>
        </View>
      </View>

      {!isCleared ? (
        <View style={styles.actionCard}>
          <Text style={styles.cardLabel}>Community Actions</Text>
          <View style={styles.actionBtns}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.confirmBtn, pressed && { opacity: 0.8 }]}
              onPress={() => handleVote("confirm")}
              disabled={voteMutation.isPending}
            >
              {voteMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.tier1} />
              ) : (
                <>
                  <Ionicons name="thumbs-up" size={18} color={Colors.tier1} />
                  <Text style={[styles.actionBtnText, { color: Colors.tier1 }]}>Still There</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.clearBtn, pressed && { opacity: 0.8 }]}
              onPress={() => handleVote("clear")}
              disabled={voteMutation.isPending}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.accent} />
              <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Cleared</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.disputeBtn, pressed && { opacity: 0.8 }]}
            onPress={() => handleVote("downvote")}
            disabled={voteMutation.isPending}
          >
            <Ionicons name="flag-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.disputeBtnText}>Dispute this report</Text>
          </Pressable>
          {!user && (
            <Text style={styles.loginHint}>Sign in to vote on hazard reports</Text>
          )}
        </View>
      ) : (
        <View style={styles.clearedInfo}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.tier1} />
          <Text style={styles.clearedInfoText}>
            Community has confirmed this hazard is cleared. Report will be archived.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgCard },
  content: { padding: 20 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Colors.bgCard,
  },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingTop: 8 },
  severityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  severityText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 6, lineHeight: 28 },
  typeBadgeText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 16 },

  clearedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#052e16",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.tier1,
    marginBottom: 16,
  },
  clearedText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.tier1 },

  photoCard: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  photoThumbnail: {
    width: "100%",
    height: 200,
  },
  photoExpandHint: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
  },
  modalImage: {
    height: "70%",
    borderRadius: 8,
  },

  tierDetailCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  tierDetailHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  tierDetailTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  tierDetailText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  description: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },

  metaRow: { flexDirection: "row", gap: 20, marginBottom: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  voteStats: { flexDirection: "row", gap: 20, marginTop: 4 },
  voteStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  voteStatText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  actionCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  actionBtns: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  confirmBtn: { borderColor: Colors.tier1, backgroundColor: "#052e16" },
  clearBtn: { borderColor: Colors.accent, backgroundColor: Colors.accent + "11" },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  disputeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  disputeBtnText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  loginHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },

  clearedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#052e16",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.tier1,
    marginBottom: 12,
  },
  clearedInfoText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.tier1, lineHeight: 20 },
});
