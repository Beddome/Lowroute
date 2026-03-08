import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { Colors } from "@/constants/colors";
import { LISTING_CATEGORIES, LISTING_CONDITIONS, SHIPPING_OPTIONS } from "@/shared/types";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import LocationPicker from "@/components/LocationPicker";

const ACCENT = "#60A5FA";

function applyPrivacyJitter(lat: number, lng: number): { lat: number; lng: number } {
  const maxOffsetKm = 0.5;
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * maxOffsetKm;
  const latOffset = (distance / 111.32) * Math.cos(angle);
  const lngOffset = (distance / (111.32 * Math.cos(lat * (Math.PI / 180)))) * Math.sin(angle);
  return { lat: lat + latOffset, lng: lng + lngOffset };
}

export default function CreateListingScreen() {
  const { user } = useAuth();
  const { currentPosition } = useLocation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [category, setCategory] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [shippingOption, setShippingOption] = useState<string>("pickup_only");
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const effectiveLat = pinLat ?? currentPosition?.latitude ?? 49.6946;
  const effectiveLng = pinLng ?? currentPosition?.longitude ?? -112.8451;

  const handleLocationChange = (lat: number, lng: number) => {
    setPinLat(lat);
    setPinLng(lng);
  };

  const handlePickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const uri = asset.uri;

      const formData = new FormData();
      const file = new File(uri);
      formData.append("photo", file as any);

      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/upload", baseUrl);

      const res = await fetch(uploadUrl.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }

      const data = await res.json() as { url: string };
      setPhotos((prev) => [...prev, data.url]);
    } catch (err: any) {
      Alert.alert("Upload Error", err.message || "Failed to upload photo");
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError("Description must be at least 5 characters");
      return;
    }
    if (!priceStr.trim()) {
      setError("Price is required");
      return;
    }
    const priceDollars = parseFloat(priceStr);
    if (isNaN(priceDollars) || priceDollars < 0) {
      setError("Invalid price");
      return;
    }
    if (!category) {
      setError("Select a category");
      return;
    }
    if (!condition) {
      setError("Select a condition");
      return;
    }


    setIsSubmitting(true);
    setError("");

    try {
      const priceCents = Math.round(priceDollars * 100);
      const jittered = applyPrivacyJitter(effectiveLat, effectiveLng);
      await apiRequest("POST", "/api/marketplace", {
        title: title.trim(),
        description: description.trim(),
        price: priceCents,
        category,
        condition,
        lat: jittered.lat,
        lng: jittered.lng,
        city: null,
        photos,
        shippingOption,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace"] });
      router.back();
    } catch (err: any) {
      let msg = "Failed to create listing";
      try {
        const parsed = JSON.parse(err.message?.split(": ").slice(1).join(": ") || "{}");
        if (parsed.message) msg = parsed.message;
      } catch {}
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const baseUrl = getApiUrl();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New Listing</Text>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.photosSection}>
          <Text style={styles.label}>Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photosRow}
          >
            {photos.map((photo, i) => {
              const fullUrl = photo.startsWith("http")
                ? photo
                : `${baseUrl}${photo.startsWith("/") ? "" : "/"}${photo}`;
              return (
                <View key={i} style={styles.photoThumbContainer}>
                  <Image source={{ uri: fullUrl }} style={styles.photoThumb} />
                  <Pressable
                    style={styles.photoRemove}
                    onPress={() => removePhoto(i)}
                  >
                    <Ionicons name="close-circle" size={22} color={Colors.error} />
                  </Pressable>
                </View>
              );
            })}
            {photos.length < 6 && (
              <Pressable style={styles.addPhotoButton} onPress={handlePickPhoto}>
                <Ionicons name="camera-outline" size={28} color={ACCENT} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. BBS RS 17x8.5 +35"
          placeholderTextColor={Colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe your item, condition details, fitment..."
          placeholderTextColor={Colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Price ($)</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={Colors.textMuted}
          value={priceStr}
          onChangeText={setPriceStr}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipsWrap}>
          {LISTING_CATEGORIES.map((cat) => (
            <Pressable
              key={cat.value}
              style={[
                styles.chip,
                category === cat.value && styles.chipActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setCategory(cat.value);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  category === cat.value && styles.chipTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Condition</Text>
        <View style={styles.chipsWrap}>
          {LISTING_CONDITIONS.map((cond) => (
            <Pressable
              key={cond.value}
              style={[
                styles.chip,
                condition === cond.value && styles.chipActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setCondition(cond.value);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  condition === cond.value && styles.chipTextActive,
                ]}
              >
                {cond.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Shipping</Text>
        <View style={styles.chipsWrap}>
          {SHIPPING_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.chip,
                shippingOption === opt.value && styles.chipActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setShippingOption(opt.value);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  shippingOption === opt.value && styles.chipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Location</Text>
        <Text style={styles.locationHint}>
          Tap the map or drag the pin. Exact location is hidden for privacy.
        </Text>
        <LocationPicker
          latitude={effectiveLat}
          longitude={effectiveLng}
          onLocationChange={handleLocationChange}
          accentColor={ACCENT}
          label="Set pickup / item location"
        />

        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.bg} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={Colors.bg} />
              <Text style={styles.submitText}>Post Listing</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgCard,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.error + "15",
    borderWidth: 1,
    borderColor: Colors.error + "44",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginBottom: 6,
    marginTop: 14,
  },
  locationHint: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  photosSection: {
    marginTop: 0,
  },
  photosRow: {
    gap: 10,
    paddingVertical: 4,
  },
  photoThumbContainer: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  photoThumb: {
    width: 80,
    height: 80,
  },
  photoRemove: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  addPhotoButton: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: ACCENT + "55",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT + "08",
  },
  addPhotoText: {
    color: ACCENT,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    marginTop: 2,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: ACCENT + "22",
    borderColor: ACCENT,
  },
  chipText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  chipTextActive: {
    color: ACCENT,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Colors.bg,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
});
