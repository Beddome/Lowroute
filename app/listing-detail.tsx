import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  formatMSTClient,
} from "@/shared/types";
import type { MarketplaceListing } from "@/shared/types";

const ACCENT = "#60A5FA";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getConditionColor(condition: string): string {
  switch (condition) {
    case "new": return "#22C55E";
    case "like_new": return "#34D399";
    case "good": return "#60A5FA";
    case "fair": return "#EAB308";
    case "parts_only": return "#F97316";
    default: return Colors.textMuted;
  }
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [photoIndex, setPhotoIndex] = useState(0);
  const baseUrl = getApiUrl();

  const { data: listing, isLoading } = useQuery<MarketplaceListing>({
    queryKey: ["/api/marketplace", id],
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/marketplace/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      router.back();
    },
  });

  const markSoldMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/marketplace/${id}`, { status: "sold" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
    },
  });

  const handleDelete = () => {
    Alert.alert("Delete Listing", "Are you sure you want to delete this listing?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  const handleMarkSold = () => {
    Alert.alert("Mark as Sold", "Mark this listing as sold?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Sold",
        onPress: () => markSoldMutation.mutate(),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Listing not found</Text>
      </View>
    );
  }

  const categoryInfo = LISTING_CATEGORIES.find((c) => c.value === listing.category);
  const conditionInfo = LISTING_CONDITIONS.find((c) => c.value === listing.condition);
  const isOwner = user && user.id === listing.sellerId;
  const isAdmin = user?.role === "admin";
  const isSold = listing.status === "sold";

  const photos = listing.photos && listing.photos.length > 0 ? listing.photos : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      showsVerticalScrollIndicator={false}
    >
      {photos.length > 0 ? (
        <View style={styles.galleryContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setPhotoIndex(idx);
            }}
          >
            {photos.map((photo, i) => {
              const fullUrl = photo.startsWith("http")
                ? photo
                : `${baseUrl}${photo.startsWith("/") ? "" : "/"}${photo}`;
              return (
                <Image
                  key={i}
                  source={{ uri: fullUrl }}
                  style={styles.galleryImage}
                  resizeMode="cover"
                />
              );
            })}
          </ScrollView>
          {photos.length > 1 && (
            <View style={styles.dotsRow}>
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === photoIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}
          {isSold && (
            <View style={styles.soldOverlay}>
              <Text style={styles.soldOverlayText}>SOLD</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.noPhotoContainer}>
          <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.noPhotoText}>No photos</Text>
          {isSold && (
            <View style={styles.soldOverlay}>
              <Text style={styles.soldOverlayText}>SOLD</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.price}>{formatPrice(listing.price)}</Text>
        <Text style={styles.title}>{listing.title}</Text>

        <View style={styles.badgesRow}>
          <View
            style={[
              styles.badge,
              { backgroundColor: getConditionColor(listing.condition) + "22" },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: getConditionColor(listing.condition) },
              ]}
            >
              {conditionInfo?.label ?? listing.condition}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: ACCENT + "22" }]}>
            <Text style={[styles.badgeText, { color: ACCENT }]}>
              {categoryInfo?.label ?? listing.category}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{listing.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seller</Text>
          <View style={styles.sellerRow}>
            <View style={styles.sellerAvatar}>
              <Ionicons name="person" size={20} color={ACCENT} />
            </View>
            <Text style={styles.sellerName}>
              {listing.sellerUsername ?? "Unknown"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color={Colors.textSecondary} />
            <Text style={styles.locationText}>
              {listing.city ?? `${listing.lat.toFixed(4)}, ${listing.lng.toFixed(4)}`}
            </Text>
          </View>
        </View>

        <Text style={styles.dateText}>
          Listed {formatMSTClient(listing.createdAt)}
        </Text>

        {(isOwner || isAdmin) && (
          <View style={styles.actionsRow}>
            {isOwner && !isSold && (
              <Pressable
                style={styles.soldButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  handleMarkSold();
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={[styles.actionText, { color: "#22C55E" }]}>Mark Sold</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.deleteButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                handleDelete();
              }}
            >
              <Ionicons name="trash" size={20} color={Colors.error} />
              <Text style={[styles.actionText, { color: Colors.error }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgCard,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bgCard,
    gap: 12,
  },
  notFoundText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  galleryContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
    backgroundColor: Colors.bgElevated,
    position: "relative",
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
  },
  dotsRow: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 20,
  },
  soldOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(239,68,68,0.9)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  soldOverlayText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1,
  },
  noPhotoContainer: {
    width: SCREEN_WIDTH,
    height: 200,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    position: "relative",
  },
  noPhotoText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  content: {
    padding: 20,
  },
  price: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
    lineHeight: 24,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sellerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  sellerName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  soldButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#22C55E" + "15",
    borderWidth: 1,
    borderColor: "#22C55E" + "44",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.error + "15",
    borderWidth: 1,
    borderColor: Colors.error + "44",
  },
  actionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
