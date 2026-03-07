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
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { HAZARD_TYPES, SEVERITY_TIERS } from "@/shared/types";
import { apiRequest } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

  const latitude = parseFloat(lat ?? "34.0522");
  const longitude = parseFloat(lng ?? "-118.2437");

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
      await apiRequest("POST", "/api/hazards", {
        lat: latitude,
        lng: longitude,
        type: selectedType,
        severity: selectedSeverity,
        title: title.trim(),
        description: description.trim(),
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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="warning" size={20} color={Colors.tier3} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Report Hazard</Text>
              <Text style={styles.headerCoords}>
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </Text>
            </View>
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

        {/* Hazard Type */}
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

        {/* Severity Tier */}
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

        {/* Title */}
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

        {/* Description */}
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

        {/* Submit */}
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            (!selectedType || !selectedSeverity || !title || !description) && styles.submitBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
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
  headerCoords: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
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
