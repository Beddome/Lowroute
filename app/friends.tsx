import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import type { FriendWithCar } from "@/shared/types";
import CarAvatar from "@/components/CarAvatar";

const FRIEND_COLOR = "#3B82F6";

const CLEARANCE_MODE_COLORS: Record<string, string> = {
  normal: "#22C55E",
  lowered: "#EAB308",
  very_lowered: "#F97316",
  show_car: "#EF4444",
};

interface SearchUser {
  id: string;
  username: string;
}

interface PendingRequest {
  id: string;
  requesterId: string;
  requesterUsername: string;
  createdAt: string;
}

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<FriendWithCar | null>(null);

  const { data: friends = [], isLoading: friendsLoading } = useQuery<FriendWithCar[]>({
    queryKey: ["/api/friends/with-cars"],
    enabled: !!user,
  });

  const { data: pendingRequests = [], isLoading: requestsLoading } = useQuery<PendingRequest[]>({
    queryKey: ["/api/friends/requests"],
    enabled: !!user,
  });

  const sendRequestMutation = useMutation({
    mutationFn: (addresseeId: string) =>
      apiRequest("POST", "/api/friends/request", { addresseeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/with-cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSearchQuery("");
      setSearchResults([]);
    },
    onError: (err: any) => {
      const msg = err?.message || "Could not send friend request.";
      Alert.alert("Error", msg.includes(":") ? msg.split(": ").slice(1).join(": ") : msg);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/friends/${id}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/with-cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/friends/${id}/decline`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/friends/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/with-cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/locations"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const baseUrl = getApiUrl();
        const res = await fetch(
          `${baseUrl}/api/users/search?q=${encodeURIComponent(text.trim())}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch {
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  const handleRemoveFriend = useCallback((friendshipId: string, username: string) => {
    Alert.alert("Remove Friend", `Remove ${username} from friends?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removeMutation.mutate(friendshipId);
          setSelectedFriend(null);
        },
      },
    ]);
  }, []);

  const topPad = Platform.OS === "web" ? 67 : 20;

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.title}>Friends</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by username..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching && <ActivityIndicator size="small" color={Colors.accent} />}
        {searchQuery.length > 0 && !isSearching && (
          <Pressable onPress={() => { setSearchQuery(""); setSearchResults([]); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {searchResults.length > 0 && (
        <View style={s.searchResults}>
          {searchResults.map((u) => {
            const alreadyFriend = friends.some((f) => f.friendId === u.id);
            return (
              <View key={u.id} style={s.searchResultItem}>
                <View style={s.userAvatar}>
                  <Text style={s.userAvatarText}>{u.username[0]?.toUpperCase()}</Text>
                </View>
                <Text style={s.userName}>{u.username}</Text>
                {alreadyFriend ? (
                  <View style={s.alreadyBadge}>
                    <Ionicons name="checkmark" size={14} color={Colors.success} />
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      sendRequestMutation.mutate(u.id);
                    }}
                    disabled={sendRequestMutation.isPending}
                  >
                    <Ionicons name="person-add" size={16} color={Colors.accent} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      <FlatList
        data={[]}
        renderItem={null}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <>
            {pendingRequests.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Pending Requests</Text>
                {pendingRequests.map((req) => (
                  <View key={req.id} style={s.requestItem}>
                    <View style={s.userAvatar}>
                      <Text style={s.userAvatarText}>
                        {req.requesterUsername?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.userName}>{req.requesterUsername}</Text>
                      <Text style={s.requestTime}>Wants to be friends</Text>
                    </View>
                    <View style={s.requestActions}>
                      <Pressable
                        style={({ pressed }) => [s.acceptBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => acceptMutation.mutate(req.id)}
                        disabled={acceptMutation.isPending}
                      >
                        <Ionicons name="checkmark" size={18} color={Colors.success} />
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [s.declineBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => declineMutation.mutate(req.id)}
                        disabled={declineMutation.isPending}
                      >
                        <Ionicons name="close" size={18} color={Colors.error} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Friends</Text>
                <View style={s.countBadge}>
                  <Text style={s.countText}>{friends.length}</Text>
                </View>
              </View>
              {friendsLoading ? (
                <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />
              ) : friends.length === 0 ? (
                <View style={s.emptyState}>
                  <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
                  <Text style={s.emptyText}>No friends yet</Text>
                  <Text style={s.emptySubtext}>Search for users above to add friends</Text>
                </View>
              ) : (
                friends.map((friend) => (
                  <Pressable
                    key={friend.id}
                    style={({ pressed }) => [s.friendItem, pressed && { opacity: 0.8 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedFriend(friend);
                    }}
                  >
                    {friend.activeCar ? (
                      <CarAvatar
                        style={friend.activeCar.avatarStyle}
                        color={friend.activeCar.avatarColor}
                        size={40}
                      />
                    ) : (
                      <View style={s.userAvatar}>
                        <Text style={s.userAvatarText}>
                          {friend.username[0]?.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.userName}>{friend.username}</Text>
                      {friend.activeCar && (
                        <Text style={s.friendCarSubtext}>
                          {friend.activeCar.year} {friend.activeCar.make} {friend.activeCar.model}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </Pressable>
                ))
              )}
            </View>
          </>
        }
      />

      {selectedFriend && (
        <Modal
          visible={!!selectedFriend}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedFriend(null)}
        >
          <Pressable style={s.popupOverlay} onPress={() => setSelectedFriend(null)}>
            <View style={s.popupCard} onStartShouldSetResponder={() => true}>
              <Pressable style={s.popupClose} onPress={() => setSelectedFriend(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>

              <View style={s.popupHeader}>
                {selectedFriend.activeCar ? (
                  <CarAvatar
                    style={selectedFriend.activeCar.avatarStyle}
                    color={selectedFriend.activeCar.avatarColor}
                    size={52}
                  />
                ) : (
                  <View style={s.popupInitialCircle}>
                    <Text style={s.popupInitial}>
                      {selectedFriend.username?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                )}
                <Text style={s.popupUsername}>
                  {selectedFriend.username ?? "Friend"}
                </Text>
              </View>

              {selectedFriend.activeCar && (
                <>
                  <View style={s.popupDivider} />
                  <Text style={s.popupCarName}>
                    {selectedFriend.activeCar.year} {selectedFriend.activeCar.make} {selectedFriend.activeCar.model}
                  </Text>

                  <View style={s.popupSpecsGrid}>
                    {selectedFriend.activeCar.suspensionType && (
                      <View style={s.popupSpecItem}>
                        <Ionicons name="construct-outline" size={14} color={Colors.textMuted} />
                        <Text style={s.popupSpecText}>
                          {selectedFriend.activeCar.suspensionType === "air_ride" ? "Air Ride" : selectedFriend.activeCar.suspensionType.charAt(0).toUpperCase() + selectedFriend.activeCar.suspensionType.slice(1)}
                        </Text>
                      </View>
                    )}
                    {selectedFriend.activeCar.rideHeight != null && (
                      <View style={s.popupSpecItem}>
                        <Ionicons name="resize-outline" size={14} color={Colors.textMuted} />
                        <Text style={s.popupSpecText}>
                          {selectedFriend.activeCar.rideHeight}" ride height
                        </Text>
                      </View>
                    )}
                    {selectedFriend.activeCar.wheelSize != null && (
                      <View style={s.popupSpecItem}>
                        <Ionicons name="ellipse-outline" size={14} color={Colors.textMuted} />
                        <Text style={s.popupSpecText}>
                          {selectedFriend.activeCar.wheelSize}" wheels
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={s.popupBadges}>
                    <View style={[s.popupBadge, { backgroundColor: (CLEARANCE_MODE_COLORS[selectedFriend.activeCar.clearanceMode] ?? FRIEND_COLOR) + "22", borderColor: CLEARANCE_MODE_COLORS[selectedFriend.activeCar.clearanceMode] ?? FRIEND_COLOR }]}>
                      <Text style={[s.popupBadgeText, { color: CLEARANCE_MODE_COLORS[selectedFriend.activeCar.clearanceMode] ?? FRIEND_COLOR }]}>
                        {selectedFriend.activeCar.clearanceMode === "very_lowered" ? "Very Lowered" : selectedFriend.activeCar.clearanceMode === "show_car" ? "Show Car" : selectedFriend.activeCar.clearanceMode.charAt(0).toUpperCase() + selectedFriend.activeCar.clearanceMode.slice(1)}
                      </Text>
                    </View>
                    {selectedFriend.activeCar.suspensionType && selectedFriend.activeCar.suspensionType !== "stock" && (
                      <View style={[s.popupBadge, { backgroundColor: Colors.accent + "22", borderColor: Colors.accent }]}>
                        <Text style={[s.popupBadgeText, { color: Colors.accent }]}>
                          {selectedFriend.activeCar.suspensionType === "air_ride" ? "Air Ride" : selectedFriend.activeCar.suspensionType.charAt(0).toUpperCase() + selectedFriend.activeCar.suspensionType.slice(1)}
                        </Text>
                      </View>
                    )}
                    {selectedFriend.activeCar.hasFrontLip && (
                      <View style={[s.popupBadge, { backgroundColor: "#EF4444" + "22", borderColor: "#EF4444" }]}>
                        <Text style={[s.popupBadgeText, { color: "#EF4444" }]}>
                          Front Lip
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}

              <View style={s.popupActions}>
                <Pressable
                  style={({ pressed }) => [s.popupMessageBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    const friendRef = selectedFriend;
                    setSelectedFriend(null);
                    router.push({
                      pathname: "/conversation",
                      params: {
                        userId: friendRef.friendId,
                        username: friendRef.username ?? "Friend",
                      },
                    });
                  }}
                >
                  <Ionicons name="chatbubble" size={16} color={Colors.bg} />
                  <Text style={s.popupMessageText}>Message</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [s.popupRemoveBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => handleRemoveFriend(selectedFriend.id, selectedFriend.username)}
                >
                  <Ionicons name="person-remove" size={16} color={Colors.error} />
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgCard,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  searchResults: {
    marginHorizontal: 16,
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    overflow: "hidden",
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + "22",
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  userName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  friendCarSubtext: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  alreadyBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.success + "18",
    borderWidth: 1,
    borderColor: Colors.success + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 12,
  },
  countBadge: {
    backgroundColor: Colors.accent + "22",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 12,
  },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  requestTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.success + "18",
    borderWidth: 1,
    borderColor: Colors.success + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.error + "18",
    borderWidth: 1,
    borderColor: Colors.error + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  popupCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    width: "100%",
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 25,
  },
  popupClose: {
    position: "absolute" as const,
    top: 12,
    right: 12,
    zIndex: 10,
  },
  popupHeader: {
    alignItems: "center" as const,
    gap: 10,
    marginBottom: 4,
  },
  popupInitialCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: FRIEND_COLOR,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  popupInitial: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  popupUsername: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  popupDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  popupCarName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center" as const,
    marginBottom: 12,
  },
  popupSpecsGrid: {
    gap: 8,
    marginBottom: 12,
  },
  popupSpecItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  popupSpecText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  popupBadges: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  popupBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  popupBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  popupActions: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 14,
  },
  popupMessageBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  popupMessageText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
  popupRemoveBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.error + "18",
    borderWidth: 1,
    borderColor: Colors.error + "44",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
});
