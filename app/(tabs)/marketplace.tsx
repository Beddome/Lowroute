import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/contexts/UnitsContext";
import { useLocation } from "@/contexts/LocationContext";
import { getApiUrl } from "@/lib/query-client";
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
} from "@/shared/types";
import type { MarketplaceListing } from "@/shared/types";

const ACCENT = "#60A5FA";
const RADIUS_OPTIONS_IMPERIAL = [25, 50, 100, 200];
const RADIUS_OPTIONS_METRIC = [40, 80, 160, 320];

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
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ListingCard({
  listing,
  userLat,
  userLng,
  system,
}: {
  listing: MarketplaceListing;
  userLat: number | null;
  userLng: number | null;
  system: string;
}) {
  const conditionInfo = LISTING_CONDITIONS.find((c) => c.value === listing.condition);
  const photoUrl =
    listing.photos && listing.photos.length > 0 ? listing.photos[0] : null;
  const baseUrl = getApiUrl();

  let distanceText = "";
  if (userLat !== null && userLng !== null) {
    const distMi = haversineDistance(userLat, userLng, listing.lat, listing.lng);
    if (system === "metric") {
      const km = distMi * 1.60934;
      distanceText = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    } else {
      distanceText = distMi < 1 ? `${Math.round(distMi * 5280)} ft` : `${distMi.toFixed(1)} mi`;
    }
  }

  const fullPhotoUrl = photoUrl
    ? photoUrl.startsWith("http")
      ? photoUrl
      : `${baseUrl}${photoUrl.startsWith("/") ? "" : "/"}${photoUrl}`
    : null;

  return (
    <Pressable
      style={styles.card}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/listing-detail", params: { id: listing.id } });
      }}
    >
      <View style={styles.cardImageContainer}>
        {fullPhotoUrl ? (
          <Image source={{ uri: fullPhotoUrl }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardPrice}>{formatPrice(listing.price)}</Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {listing.title}
        </Text>
        <View style={styles.cardMeta}>
          <View
            style={[
              styles.conditionBadge,
              { backgroundColor: getConditionColor(listing.condition) + "22" },
            ]}
          >
            <Text
              style={[
                styles.conditionText,
                { color: getConditionColor(listing.condition) },
              ]}
            >
              {conditionInfo?.label ?? listing.condition}
            </Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          {distanceText ? (
            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.distanceText}>{distanceText}</Text>
            </View>
          ) : null}
          {listing.city ? (
            <Text style={styles.cityText} numberOfLines={1}>
              {listing.city}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { system } = useUnits();
  const { currentPosition } = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [radiusIndex, setRadiusIndex] = useState(1);

  const radiusOptions = system === "metric" ? RADIUS_OPTIONS_METRIC : RADIUS_OPTIONS_IMPERIAL;
  const radiusLabel = system === "metric" ? "km" : "mi";
  const currentRadius = radiusOptions[radiusIndex];

  const userLat = currentPosition?.latitude ?? null;
  const userLng = currentPosition?.longitude ?? null;

  const radiusMiles =
    system === "metric"
      ? currentRadius * 0.621371
      : currentRadius;

  const queryParams = new URLSearchParams();
  if (selectedCategory) queryParams.set("category", selectedCategory);
  if (search.trim()) queryParams.set("search", search.trim());
  if (userLat !== null && userLng !== null) {
    queryParams.set("lat", String(userLat));
    queryParams.set("lng", String(userLng));
  }
  queryParams.set("radius", String(radiusMiles));
  queryParams.set("sort", "newest");

  const queryString = queryParams.toString();

  const { data: listings, isLoading, isRefetching } = useQuery<MarketplaceListing[]>({
    queryKey: ["/api/marketplace", queryString],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/api/marketplace?${queryString}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const renderItem = useCallback(
    ({ item }: { item: MarketplaceListing }) => (
      <ListingCard
        listing={item}
        userLat={userLat}
        userLng={userLng}
        system={system}
      />
    ),
    [userLat, userLng, system]
  );

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Marketplace</Text>
        <Pressable
          style={styles.createButton}
          onPress={() => {
            if (!user) {
              router.push("/(auth)/login");
              return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/create-listing");
          }}
        >
          <Ionicons name="add" size={24} color={Colors.bg} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search parts..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContent}
      >
        <Pressable
          style={[
            styles.filterChip,
            !selectedCategory && styles.filterChipActive,
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            setSelectedCategory(null);
          }}
        >
          <Text
            style={[
              styles.filterChipText,
              !selectedCategory && styles.filterChipTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {LISTING_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.value}
            style={[
              styles.filterChip,
              selectedCategory === cat.value && styles.filterChipActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setSelectedCategory(
                selectedCategory === cat.value ? null : cat.value
              );
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedCategory === cat.value && styles.filterChipTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Radius:</Text>
        {radiusOptions.map((r, i) => (
          <Pressable
            key={r}
            style={[
              styles.radiusPill,
              radiusIndex === i && styles.radiusPillActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setRadiusIndex(i);
            }}
          >
            <Text
              style={[
                styles.radiusPillText,
                radiusIndex === i && styles.radiusPillTextActive,
              ]}
            >
              {r} {radiusLabel}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : !listings || listings.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="storefront-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No listings found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your filters or radius</Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={ACCENT}
            />
          }
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  filtersScroll: {
    maxHeight: 44,
    marginBottom: 4,
  },
  filtersContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: ACCENT + "22",
    borderColor: ACCENT,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  filterChipTextActive: {
    color: ACCENT,
  },
  radiusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  radiusLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginRight: 4,
  },
  radiusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  radiusPillActive: {
    backgroundColor: ACCENT + "22",
    borderColor: ACCENT,
  },
  radiusPillText: {
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  radiusPillTextActive: {
    color: ACCENT,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  row: {
    gap: 10,
    marginBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardImageContainer: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: Colors.bgElevated,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    padding: 10,
  },
  cardPrice: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  distanceText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  cityText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    flex: 1,
  },
});
