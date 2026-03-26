import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { EVENT_TYPES, formatMSTClient } from "@/shared/types";
import type { AppEvent } from "@/shared/types";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EVENT_COLOR = "#8B5CF6";
const EVENT_COLOR_BG = "#1a0a3e";

function getEventTypeInfo(type: string) {
  return EVENT_TYPES.find((t) => t.value === type);
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data: event, isLoading } = useQuery<AppEvent>({
    queryKey: ["/api/events", id],
    enabled: !!id,
  });

  const rsvpMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/events/${id}/rsvp`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      router.back();
    },
  });

  const handleRsvp = async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rsvpMutation.mutate();
  };

  const handleDelete = () => {
    Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Event not found</Text>
      </View>
    );
  }

  const eventType = getEventTypeInfo(event.eventType);
  const isCreator = user && user.id === event.userId;
  const isCancelled = event.status === "cancelled";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={styles.typeBadge}>
          <Ionicons name={(eventType?.icon as any) ?? "calendar"} size={16} color={EVENT_COLOR} />
          <Text style={styles.typeBadgeText}>{eventType?.label ?? event.eventType}</Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.title}>{event.title}</Text>

      {isCancelled && (
        <View style={styles.cancelledBanner}>
          <Ionicons name="close-circle" size={16} color={Colors.tier4} />
          <Text style={styles.cancelledText}>This event has been cancelled</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={18} color={EVENT_COLOR} />
          <Text style={styles.detailText}>{formatMSTClient(event.date)}</Text>
        </View>
        {event.creatorUsername && (
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.detailText}>Hosted by {event.creatorUsername}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Ionicons name="people-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.detailText}>
            {event.rsvpCount} attending{event.maxAttendees ? ` / ${event.maxAttendees} max` : ""}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.detailText}>
            {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
          </Text>
        </View>
      </View>

      {event.description ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>About</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      ) : null}

      {!isCancelled && (
        <View style={styles.actionSection}>
          <Pressable
            style={({ pressed }) => [
              styles.rsvpBtn,
              event.hasRsvped && styles.rsvpBtnActive,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleRsvp}
            disabled={rsvpMutation.isPending}
          >
            {rsvpMutation.isPending ? (
              <ActivityIndicator color={event.hasRsvped ? EVENT_COLOR : Colors.bg} />
            ) : (
              <>
                <Ionicons
                  name={event.hasRsvped ? "checkmark-circle" : "add-circle-outline"}
                  size={20}
                  color={event.hasRsvped ? EVENT_COLOR : Colors.bg}
                />
                <Text style={[styles.rsvpBtnText, event.hasRsvped && styles.rsvpBtnTextActive]}>
                  {event.hasRsvped ? "Going" : "RSVP"}
                </Text>
              </>
            )}
          </Pressable>
          {!user && (
            <Text style={styles.loginHint}>Sign in to RSVP to events</Text>
          )}
        </View>
      )}

      {isCreator && !isCancelled && (
        <View style={styles.creatorActions}>
          <Pressable
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push(`/create-event?id=${event.id}`)}
          >
            <Ionicons name="create-outline" size={18} color={Colors.accent} />
            <Text style={styles.editBtnText}>Edit Event</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.tier4} />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
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

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingTop: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: EVENT_COLOR,
    backgroundColor: EVENT_COLOR_BG,
  },
  typeBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: EVENT_COLOR },

  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 28,
  },

  cancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#450a0a",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.tier4,
    marginBottom: 16,
  },
  cancelledText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.tier4 },

  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 22,
  },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },

  actionSection: { marginTop: 4, gap: 8 },
  rsvpBtn: {
    backgroundColor: EVENT_COLOR,
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  rsvpBtnActive: {
    backgroundColor: EVENT_COLOR_BG,
    borderWidth: 1.5,
    borderColor: EVENT_COLOR,
  },
  rsvpBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.bg },
  rsvpBtnTextActive: { color: EVENT_COLOR },
  loginHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center" as const,
  },

  creatorActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  editBtn: {
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "11",
    gap: 8,
  },
  editBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  deleteBtn: {
    height: 46,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.tier4,
    backgroundColor: "#450a0a",
    gap: 8,
  },
  deleteBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.tier4 },
});
