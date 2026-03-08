import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/query-client";
import CarAvatar from "@/components/CarAvatar";
import type { FriendWithCar } from "@/shared/types";

export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data: friends = [], isLoading } = useQuery<FriendWithCar[]>({
    queryKey: ["/api/friends/with-cars"],
    enabled: !!user,
  });

  const toggleFriend = useCallback((friendId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (selected.size === 0) return;

    const selectedIds = Array.from(selected);

    if (selectedIds.length === 1) {
      const friend = friends.find((f) => f.friendId === selectedIds[0]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.replace({
        pathname: "/conversation",
        params: {
          userId: selectedIds[0],
          username: friend?.username ?? "Friend",
        },
      });
      return;
    }

    setIsCreating(true);
    try {
      const res = await apiRequest("POST", "/api/group-chats", {
        name: groupName.trim() || null,
        memberIds: selectedIds,
      });
      const group = await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      router.replace({
        pathname: "/conversation",
        params: {
          groupChatId: group.id,
          groupName: groupName.trim() || `Group (${selectedIds.length + 1})`,
        },
      });
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCreating(false);
    }
  }, [selected, friends, groupName]);

  const isGroupMode = selected.size > 1;

  const renderFriend = useCallback(
    ({ item }: { item: FriendWithCar }) => {
      const isSelected = selected.has(item.friendId);
      return (
        <Pressable
          style={({ pressed }) => [
            s.friendItem,
            isSelected && s.friendItemSelected,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => toggleFriend(item.friendId)}
        >
          <View style={s.checkCircle}>
            {isSelected ? (
              <View style={s.checkCircleFilled}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            ) : (
              <View style={s.checkCircleEmpty} />
            )}
          </View>

          {item.activeCar ? (
            <CarAvatar
              style={item.activeCar.avatarStyle}
              color={item.activeCar.avatarColor}
              size={40}
            />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={s.avatarInitial}>
                {item.username[0]?.toUpperCase()}
              </Text>
            </View>
          )}

          <View style={s.friendInfo}>
            <Text style={s.friendName}>{item.username}</Text>
            {item.activeCar && (
              <Text style={s.friendCar} numberOfLines={1}>
                {item.activeCar.year} {item.activeCar.make} {item.activeCar.model}
              </Text>
            )}
          </View>
        </Pressable>
      );
    },
    [selected, toggleFriend]
  );

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </Pressable>
        <Text style={s.headerTitle}>New Message</Text>
        <View style={{ width: 24 }} />
      </View>

      {isGroupMode && (
        <View style={s.groupNameRow}>
          <Ionicons name="people" size={18} color={Colors.accent} />
          <TextInput
            style={s.groupNameInput}
            placeholder="Group name (optional)"
            placeholderTextColor={Colors.textMuted}
            value={groupName}
            onChangeText={setGroupName}
            maxLength={100}
          />
        </View>
      )}

      {selected.size > 0 && (
        <View style={s.selectedBar}>
          <Text style={s.selectedText}>
            {selected.size} selected
            {isGroupMode ? " — group chat" : " — direct message"}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={s.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : friends.length === 0 ? (
        <View style={s.emptyContainer}>
          <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>No friends yet</Text>
          <Text style={s.emptySubtitle}>Add friends to start chatting</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.friendId}
          renderItem={renderFriend}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selected.size > 0 && (
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
          <Pressable
            style={({ pressed }) => [s.startBtn, pressed && { opacity: 0.8 }, isCreating && { opacity: 0.5 }]}
            onPress={handleStart}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons
                  name={isGroupMode ? "people" : "chatbubble"}
                  size={20}
                  color="#fff"
                />
                <Text style={s.startBtnText}>
                  {isGroupMode ? "Create Group" : "Start Chat"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  groupNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  groupNameInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    paddingVertical: 4,
  },
  selectedBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.accent + "15",
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent + "33",
  },
  selectedText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  friendItemSelected: {
    backgroundColor: Colors.accent + "10",
  },
  checkCircle: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
  },
  checkCircleFilled: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  friendCar: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  startBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
