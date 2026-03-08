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
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { HAZARD_TYPES, SEVERITY_TIERS } from "@/shared/types";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import LocationPicker from "@/components/LocationPicker";

export default function ReportScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat: string; lng: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSeverity, setSelectedSeverity] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const initialLat = parseFloat(lat ?? "49.6935");
  const initialLng = parseFloat(lng ?? "-112.8418");
  const [latitude, setLatitude] = useState(initialLat);
  const [longitude, setLongitude] = useState(initialLng);

  const pickImage = async (useCamera: boolean) => {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          setError("Camera permission is required to take photos");
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.7,
          });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e: any) {
      setError("Failed to pick image");
    }
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoUri) return null;
    setIsUploading(true);
    try {
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await globalThis.fetch(photoUri);
        const blob = await response.blob();
        formData.append("photo", blob, "photo.jpg");
      } else {
        const file = new File(photoUri);
        formData.append("photo", file as any);
      }

      const baseUrl = getApiUrl();
      const url = new URL("/api/upload", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }

      const data = await res.json() as { url: string };
      return data.url;
    } catch (e: any) {
      throw new Error("Photo upload failed: " + (e.message || "Unknown error"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!selectedType || !selectedSeverity || !title.trim() || !description.trim()) {
      setError("Please complete all fields");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      let photoUrl: string | null = null;
      if (photoUri) {
        photoUrl = await uploadPhoto();
      }

      await apiRequest("POST", "/api/hazards", {
        lat: latitude,
        lng: longitude,
        type: selectedType,
        severity: selectedSeverity,
        title: title.trim(),
        description: description.trim(),
        photoUrl,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/hazards"] });
      router.back();
    } catch (e: any) {
      setError(e.message?.replace(/^\d+: /, "") || "Failed to submit report");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bgCard }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="warning" size={20} color={Colors.tier3} />
            </View>
            <Text style={styles.headerTitle}>Report Hazard</Text>
          </View>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {!user && (
          <Pressable
            style={styles.authWarning}
            onPress={() => router.push("/(auth)/login")}
          >
            <Ionicons name="log-in-outline" size={16} color={Colors.accent} />
            <Text style={styles.authWarningText}>Sign in to submit reports and earn XP</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
          </Pressable>
        )}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.tier4} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hazard Type</Text>
          <View style={styles.typeGrid}>
            {HAZARD_TYPES.map((type) => (
              <Pressable
                key={type.value}
                style={[
                  styles.typeChip,
                  selectedType === type.value && styles.typeChipSelected,
                ]}
                onPress={() => {
                  setSelectedType(type.value);
                  Haptics.selectionAsync();
                }}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    selectedType === type.value && styles.typeChipTextSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Severity Tier</Text>
          <View style={styles.tierList}>
            {SEVERITY_TIERS.map((tier) => (
              <Pressable
                key={tier.tier}
                style={[
                  styles.tierRow,
                  selectedSeverity === tier.tier && {
                    borderColor: tier.color,
                    backgroundColor: tier.bg,
                  },
                ]}
                onPress={() => {
                  setSelectedSeverity(tier.tier);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
                  <Text style={styles.tierNum}>{tier.tier}</Text>
                </View>
                <View style={styles.tierInfo}>
                  <Text style={[styles.tierLabel, selectedSeverity === tier.tier && { color: tier.color }]}>
                    {tier.label} — {tier.description}
                  </Text>
                  <Text style={styles.tierDetail}>{tier.detail}</Text>
                </View>
                {selectedSeverity === tier.tier && (
                  <Ionicons name="checkmark-circle" size={20} color={tier.color} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hazard Location</Text>
          <LocationPicker
            latitude={latitude}
            longitude={longitude}
            onLocationChange={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
            accentColor={Colors.tier3}
            label="Tap the map or drag the pin to mark the hazard"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Short description (e.g. 'Deep pothole near intersection')"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            style={styles.descInput}
            placeholder="Describe the hazard — location details, which lane, how bad, etc."
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photo (Optional)</Text>
          {photoUri ? (
            <View style={styles.photoPreview}>
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
              <Pressable
                style={styles.photoRemoveBtn}
                onPress={() => {
                  setPhotoUri(null);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={26} color={Colors.tier4} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoActions}>
              <Pressable
                style={styles.photoBtn}
                onPress={() => pickImage(true)}
              >
                <Ionicons name="camera" size={22} color={Colors.accent} />
                <Text style={styles.photoBtnText}>Camera</Text>
              </Pressable>
              <Pressable
                style={styles.photoBtn}
                onPress={() => pickImage(false)}
              >
                <Ionicons name="images" size={22} color={Colors.accent} />
                <Text style={styles.photoBtnText}>Gallery</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            (!selectedType || !selectedSeverity || !title || !description) && styles.submitBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || isUploading}
        >
          {isSubmitting || isUploading ? (
            <ActivityIndicator color={Colors.bg} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color={Colors.bg} />
              <Text style={styles.submitBtnText}>Submit Hazard Report</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: Colors.bgCard },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingTop: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#431407",
    borderWidth: 1,
    borderColor: Colors.tier3,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  closeBtn: { padding: 8 },

  authWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  authWarningText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#450a0a",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.tier4,
    marginBottom: 16,
  },
  errorText: { color: Colors.tier4, fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },

  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipSelected: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  typeChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  typeChipTextSelected: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },

  tierList: { gap: 8 },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  tierBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tierNum: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },
  tierInfo: { flex: 1 },
  tierLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  tierDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },

  titleInput: {
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  descInput: {
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "right",
    marginTop: 4,
  },

  photoActions: {
    flexDirection: "row",
    gap: 12,
  },
  photoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: "dashed",
    backgroundColor: Colors.bgElevated,
  },
  photoBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
  photoPreview: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
  },

  submitBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: Colors.bg, fontSize: 16, fontFamily: "Inter_700Bold" },
});
