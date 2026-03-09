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
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import MapView, { Circle, PROVIDER_DEFAULT } from "react-native-maps";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import ReportModal from "@/components/ReportModal";
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  SHIPPING_OPTIONS,
  formatMSTClient,
} from "@/shared/types";
import type { MarketplaceListing } from "@/shared/types";

const ACCENT = "#60A5FA";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PRIVACY_RADIUS_METERS = 2000;

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

function getShippingIcon(option: string): string {
  switch (option) {
    case "shipping_available": return "airplane-outline";
    case "shipping_only": return "airplane";
    case "pickup_only": return "location-outline";
    default: return "location-outline";
  }
}

function getShippingColor(option: string): string {
  switch (option) {
    case "shipping_available": return "#60A5FA";
    case "shipping_only": return "#8B5CF6";
    case "pickup_only": return "#22C55E";
    default: return Colors.textMuted;
  }
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reportVisible, setReportVisible] = useState(false);
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

  const handleContactSeller = () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!listing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/conversation",
      params: {
        userId: listing.sellerId,
        listingId: listing.id,
        listingTitle: listing.title,
      },
    });
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
  const shippingInfo = SHIPPING_OPTIONS.find((o) => o.value === listing.shippingOption);
  const isOwner = user && user.id === listing.sellerId;
  const isAdmin = user?.role === "admin";
  const isSold = listing.status === "sold";

  const photos = listing.photos && listing.photos.length > 0 ? listing.photos : [];
  const shippingColor = getShippingColor(listing.shippingOption);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgCard }}>
      <Pressable
        style={[styles.closeButton, { top: insets.top + (Platform.OS === "web" ? 67 : 10) }]}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <Ionicons name="close" size={22} color={Colors.text} />
      </Pressable>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
        bounces={true}
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
          <View style={[styles.badge, { backgroundColor: shippingColor + "22" }]}>
            <View style={styles.shippingBadgeContent}>
              <Ionicons name={getShippingIcon(listing.shippingOption) as any} size={12} color={shippingColor} />
              <Text style={[styles.badgeText, { color: shippingColor }]}>
                {shippingInfo?.label ?? listing.shippingOption}
              </Text>
            </View>
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
          <Text style={styles.sectionTitle}>Approximate Location</Text>
          {listing.city ? (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={Colors.textSecondary} />
              <Text style={styles.locationText}>{listing.city}</Text>
            </View>
          ) : null}
          {Platform.OS !== "web" ? (
            <View style={styles.miniMapContainer}>
              <MapView
                provider={PROVIDER_DEFAULT}
                style={styles.miniMap}
                initialRegion={{
                  latitude: listing.lat,
                  longitude: listing.lng,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                customMapStyle={Colors.mapStyle}
              >
                <Circle
                  center={{ latitude: listing.lat, longitude: listing.lng }}
                  radius={PRIVACY_RADIUS_METERS}
                  strokeColor="rgba(96,165,250,0.5)"
                  fillColor="rgba(96,165,250,0.12)"
                  strokeWidth={2}
                />
              </MapView>
              <View style={styles.miniMapOverlay}>
                <Ionicons name="shield-checkmark" size={12} color={ACCENT} />
                <Text style={styles.miniMapOverlayText}>Approximate area shown for privacy</Text>
              </View>
            </View>
          ) : (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={Colors.textSecondary} />
              <Text style={styles.locationText}>
                {listing.city ?? "Location available on mobile"}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.dateText}>
          Listed {formatMSTClient(listing.createdAt)}
        </Text>

        {!isOwner && !isSold && user && (
          <View style={styles.contactRow}>
            <Pressable
              style={[styles.contactButton, { flex: 1 }]}
              onPress={handleContactSeller}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#fff" />
              <Text style={styles.contactButtonText}>Contact Seller</Text>
            </Pressable>
            <Pressable
              style={styles.reportIconButton}
              onPress={() => setReportVisible(true)}
              hitSlop={8}
            >
              <Ionicons name="flag-outline" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

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
    <ReportModal
      visible={reportVisible}
      onClose={() => setReportVisible(false)}
      contentType="listing"
      contentId={listing.id}
      targetUserId={listing.sellerId}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgCard,
  },
  closeButton: {
    position: "absolute" as const,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: Colors.border,
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
    flexWrap: "wrap",
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
  shippingBadgeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  miniMapContainer: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniMap: {
    width: "100%",
    height: 180,
  },
  miniMapOverlay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.bgElevated,
  },
  miniMapOverlayText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginBottom: 20,
  },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  contactButtonText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  reportIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
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
