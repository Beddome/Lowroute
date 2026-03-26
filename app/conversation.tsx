import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import ReportModal from "@/components/ReportModal";
import { fetch } from "expo/fetch";
import type { Message } from "@/shared/types";

function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) {
    return d.toLocaleDateString("en-US", { weekday: "short" }) + ` ${time}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
}

function MessageBubble({ message, isOwn, isGroup }: { message: Message; isOwn: boolean; isGroup: boolean }) {
  return (
    <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {isGroup && !isOwn && message.senderUsername && (
          <Text style={styles.senderName}>{message.senderUsername}</Text>
        )}
        <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
          {message.content}
        </Text>
        <Text style={[styles.bubbleTime, isOwn ? styles.bubbleTimeOwn : styles.bubbleTimeOther]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    userId: string;
    username: string;
    listingId?: string;
    listingTitle?: string;
    groupChatId?: string;
    groupName?: string;
  }>();

  const [text, setText] = useState("");
  const [reportVisible, setReportVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const otherUserId = params.userId;
  const otherUsername = params.username ?? "User";
  const listingId = params.listingId || undefined;
  const listingTitle = params.listingTitle;
  const groupChatId = params.groupChatId || undefined;
  const groupName = params.groupName || undefined;
  const isGroup = !!groupChatId;

  const headerTitle = isGroup ? (groupName || "Group Chat") : otherUsername;

  const queryKey = isGroup
    ? ["/api/group-chats", groupChatId, "messages"]
    : listingId
      ? ["/api/messages", otherUserId, listingId]
      : ["/api/messages", otherUserId];

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey,
    queryFn: async () => {
      const base = getApiUrl();
      let url: URL;
      if (isGroup) {
        url = new URL(`/api/group-chats/${groupChatId}/messages`, base);
      } else {
        url = new URL(`/api/messages/${otherUserId}`, base);
        if (listingId) url.searchParams.set("listingId", listingId);
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: isGroup ? (!!user && !!groupChatId) : (!!user && !!otherUserId),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!user) return;
    if (isGroup) {
      if (!groupChatId) return;
      apiRequest("PATCH", "/api/messages/read", {
        groupChatId,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      }).catch(() => {});
    } else {
      if (!otherUserId) return;
      apiRequest("PATCH", "/api/messages/read", {
        otherUserId,
        listingId: listingId ?? null,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      }).catch(() => {});
    }
  }, [user, otherUserId, listingId, groupChatId, isGroup, messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (isGroup) {
        await apiRequest("POST", `/api/group-chats/${groupChatId}/messages`, {
          content,
        });
      } else {
        await apiRequest("POST", "/api/messages", {
          receiverId: otherUserId,
          listingId: listingId ?? null,
          content,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    const content = trimmed;
    setText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMutation.mutate(content);
  }, [text, sendMutation]);

  const invertedMessages = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerUsername} numberOfLines={1}>{headerTitle}</Text>
          {!isGroup && listingTitle && (
            <Text style={styles.headerListingTitle} numberOfLines={1}>{listingTitle}</Text>
          )}
        </View>
        <Pressable onPress={() => setReportVisible(true)} hitSlop={12} style={styles.reportBtn}>
          <Ionicons name="flag-outline" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Start a conversation</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={invertedMessages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.senderId === user?.id} isGroup={isGroup} />
          )}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) + (Platform.OS === "web" ? 34 : 0) }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />
        <Pressable
          style={[styles.sendBtn, (!text.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.bg} />
          ) : (
            <Ionicons name="send" size={18} color={Colors.bg} />
          )}
        </Pressable>
      </View>
    <ReportModal
      visible={reportVisible}
      onClose={() => setReportVisible(false)}
      contentType={isGroup ? "message" : "user"}
      contentId={isGroup ? (groupChatId || "") : (otherUserId || "")}
      targetUserId={isGroup ? "" : (otherUserId || "")}
    />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
  },
  reportBtn: {
    padding: 4,
    marginLeft: 8,
  },
  headerUsername: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  headerListingTitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.accent,
    marginTop: 1,
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
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginTop: 12,
  },
  bubbleRow: {
    flexDirection: "row",
    marginVertical: 3,
  },
  bubbleRowOwn: {
    justifyContent: "flex-end",
  },
  bubbleRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.bgElevated,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: Colors.bg,
  },
  bubbleTextOther: {
    color: Colors.text,
  },
  bubbleTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  bubbleTimeOwn: {
    color: "rgba(0,0,0,0.5)",
    textAlign: "right" as const,
  },
  bubbleTimeOther: {
    color: Colors.textMuted,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    maxHeight: 100,
    marginRight: 10,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 1,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
