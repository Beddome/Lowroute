import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { EVENT_TYPES, formatMSTClient } from "@/shared/types";
import type { AppEvent } from "@/shared/types";

const EVENT_COLOR = "#8B5CF6";
const EVENT_COLOR_BG = "#1a0a3e";

function getEventTypeInfo(type: string) {
  return EVENT_TYPES.find((t) => t.value === type);
}

function EventCard({ event }: { event: AppEvent }) {
  const info = getEventTypeInfo(event.eventType);
  const dateLabel = formatMSTClient(event.date);

  return (
    <Pressable
      style={styles.card}
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: "/event-detail", params: { id: event.id } });
      }}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons
          name={(info?.icon ?? "calendar") as any}
          size={22}
          color={EVENT_COLOR}
        />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {info?.label ?? "Event"} · {dateLabel}
        </Text>
        <View style={styles.cardFooter}>
          <View style={styles.cardStat}>
            <Ionicons name="people" size={12} color={Colors.textMuted} />
            <Text style={styles.cardStatText}>
              {event.rsvpCount}
              {event.maxAttendees ? ` / ${event.maxAttendees}` : ""}
            </Text>
          </View>
          {event.hasRsvped && (
            <View style={styles.rsvpBadge}>
              <Ionicons name="checkmark" size={11} color={EVENT_COLOR} />
              <Text style={styles.rsvpBadgeText}>Going</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: events, isLoading, isRefetching } = useQuery<AppEvent[]>({
    queryKey: ["/api/events/upcoming"],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/events/upcoming", baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sorted = useMemo(() => {
    return (events ?? [])
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/events/upcoming"] });
  }, [queryClient]);

  const handleCreate = useCallback(() => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/create-event");
  }, [user]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding =
    (Platform.OS === "web" ? 0 : insets.bottom) + 100;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <Pressable
          style={styles.createButton}
          onPress={handleCreate}
          testID="create-event-button"
        >
          <Ionicons name="add" size={24} color={Colors.bg} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={EVENT_COLOR} />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="calendar-outline" size={36} color={EVENT_COLOR} />
          </View>
          <Text style={styles.emptyTitle}>No upcoming events</Text>
          <Text style={styles.emptyBody}>
            Be the first to host a car meet, cruise, or show.
          </Text>
          <Pressable style={styles.emptyCta} onPress={handleCreate}>
            <Ionicons name="add" size={18} color={Colors.bg} />
            <Text style={styles.emptyCtaText}>Create event</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottomPadding,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={!!isRefetching}
              onRefresh={handleRefresh}
              tintColor={EVENT_COLOR}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: EVENT_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: EVENT_COLOR_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  cardStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardStatText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  rsvpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: EVENT_COLOR_BG,
  },
  rsvpBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: EVENT_COLOR,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: EVENT_COLOR_BG,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: EVENT_COLOR,
    marginTop: 8,
  },
  emptyCtaText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
});
