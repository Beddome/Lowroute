import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient } from "@/lib/query-client";
import type { Conversation } from "@/shared/types";

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const d = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 604800)}w`;
}

function ConversationItem({ item, onPress }: { item: Conversation; onPress: () => void }) {
  const hasUnread = item.unreadCount > 0;
  const isGroup = !!item.isGroup;
  const displayName = isGroup
    ? (item.groupName || `Group (${item.memberCount ?? 0})`)
    : item.otherUsername;
  const initial = isGroup ? "G" : (item.otherUsername?.[0]?.toUpperCase() ?? "?");

  return (
    <Pressable
      style={({ pressed }) => [styles.convItem, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      {item.listingPhoto ? (
        <Image source={{ uri: item.listingPhoto }} style={styles.convAvatar} />
      ) : isGroup ? (
        <View style={[styles.convAvatarPlaceholder, { backgroundColor: Colors.accent + "22", borderColor: Colors.accent + "44" }, hasUnread && { borderColor: Colors.accent }]}>
          <Ionicons name="people" size={22} color={Colors.accent} />
        </View>
      ) : (
        <View style={[styles.convAvatarPlaceholder, hasUnread && { borderColor: Colors.accent }]}>
          <Text style={styles.convAvatarInitial}>{initial}</Text>
        </View>
      )}

      <View style={styles.convContent}>
        <View style={styles.convTopRow}>
          <Text style={[styles.convUsername, hasUnread && styles.convUsernameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.convTime, hasUnread && { color: Colors.accent }]}>
            {item.lastMessageAt ? timeAgo(item.lastMessageAt) : ""}
          </Text>
        </View>
        {item.listingTitle && (
          <Text style={styles.convListingTitle} numberOfLines={1}>
            {item.listingTitle}
          </Text>
        )}
        {isGroup && item.memberCount ? (
          <Text style={styles.convListingTitle} numberOfLines={1}>
            {item.memberCount} members
          </Text>
        ) : null}
        <Text style={[styles.convLastMessage, hasUnread && styles.convLastMessageUnread]} numberOfLines={1}>
          {item.lastMessage || "No messages yet"}
        </Text>
      </View>

      {hasUnread && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {item.unreadCount > 99 ? "99+" : item.unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPadding = isWeb ? 67 : 0;

  const { data: conversations = [], isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const openConversation = useCallback((conv: Conversation) => {
    if (conv.isGroup && conv.groupChatId) {
      router.push({
        pathname: "/conversation",
        params: {
          groupChatId: conv.groupChatId,
          groupName: conv.groupName || `Group (${conv.memberCount ?? 0})`,
        },
      });
    } else {
      router.push({
        pathname: "/conversation",
        params: {
          userId: conv.otherUserId,
          username: conv.otherUsername,
          ...(conv.listingId ? { listingId: conv.listingId } : {}),
          ...(conv.listingTitle ? { listingTitle: conv.listingTitle } : {}),
        },
      });
    }
  }, []);

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + topPadding }]}>
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Sign in to view messages</Text>
          <Pressable
            style={styles.signInBtn}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.signInBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + topPadding }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Pressable
          style={({ pressed }) => [styles.composeBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/new-chat")}
          hitSlop={12}
        >
          <Ionicons name="create-outline" size={22} color={Colors.accent} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>
            Contact a seller from a listing or message a friend to start chatting
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.isGroup ? `group-${item.groupChatId}` : `${item.otherUserId}-${item.listingId ?? "dm"}`}
          renderItem={({ item }) => (
            <ConversationItem item={item} onPress={() => openConversation(item)} />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={onRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  composeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + "15",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  signInBtn: {
    marginTop: 20,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  convAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.bgElevated,
  },
  convAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.bgElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  convAvatarInitial: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
  },
  convContent: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  convTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  convUsername: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  convUsernameUnread: {
    fontFamily: "Inter_700Bold",
  },
  convTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  convListingTitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    marginTop: 2,
  },
  convLastMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  convLastMessageUnread: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
  },
  unreadBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.bg,
  },
});
