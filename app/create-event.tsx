import React, { useState, useEffect } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { EVENT_TYPES } from "@/shared/types";
import type { AppEvent } from "@/shared/types";
import { apiRequest } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LocationPicker from "@/components/LocationPicker";

const EVENT_COLOR = "#8B5CF6";

export default function CreateEventScreen() {
  const { id, lat, lng } = useLocalSearchParams<{ id?: string; lat?: string; lng?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const isEditing = !!id;

  const { data: existingEvent } = useQuery<AppEvent>({
    queryKey: ["/api/events", id],
    enabled: isEditing,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<string>("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [latitude, setLatitude] = useState(lat ?? "");
  const [longitude, setLongitude] = useState(lng ?? "");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (existingEvent && !loaded) {
      setTitle(existingEvent.title);
      setDescription(existingEvent.description);
      setEventType(existingEvent.eventType);
      const d = new Date(existingEvent.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setDateStr(`${yyyy}-${mm}-${dd}`);
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      setTimeStr(`${hh}:${min}`);
      setLatitude(String(existingEvent.lat));
      setLongitude(String(existingEvent.lng));
      if (existingEvent.maxAttendees) {
        setMaxAttendees(String(existingEvent.maxAttendees));
      }
      setLoaded(true);
    }
  }, [existingEvent]);

  const handleSubmit = async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!title.trim() || !eventType || !dateStr || !timeStr || !latitude || !longitude || !description.trim()) {
      setError("Title, description, type, date, time, and location are required");
      return;
    }
    if (description.trim().length < 5) {
      setError("Description must be at least 5 characters");
      return;
    }
    const parsedDate = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(parsedDate.getTime())) {
      setError("Invalid date or time format");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        eventType,
        date: parsedDate.toISOString(),
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
        maxAttendees: maxAttendees ? parseInt(maxAttendees, 10) : null,
      };
      if (isEditing) {
        await apiRequest("PUT", `/api/events/${id}`, body);
      } else {
        await apiRequest("POST", "/api/events", body);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ["/api/events", id] });
      }
      router.back();
    } catch (e: any) {
      setError(e.message?.replace(/^\d+: /, "") || "Failed to save event");
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
        bounces={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="calendar" size={20} color={EVENT_COLOR} />
            </View>
            <Text style={styles.headerTitle}>{isEditing ? "Edit Event" : "Create Event"}</Text>
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
            <Text style={styles.authWarningText}>Sign in to create events</Text>
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
          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Event name"
            placeholderTextColor={Colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Event Type</Text>
          <View style={styles.typeGrid}>
            {EVENT_TYPES.map((type) => (
              <Pressable
                key={type.value}
                style={[
                  styles.typeChip,
                  eventType === type.value && styles.typeChipSelected,
                ]}
                onPress={() => {
                  setEventType(type.value);
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons
                  name={type.icon as any}
                  size={16}
                  color={eventType === type.value ? EVENT_COLOR : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.typeChipText,
                    eventType === type.value && styles.typeChipTextSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description</Text>
          <TextInput
            style={styles.descInput}
            placeholder="Tell people what to expect..."
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

        <View style={styles.rowFields}>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionLabel}>Date</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
              value={dateStr}
              onChangeText={setDateStr}
              maxLength={10}
            />
          </View>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionLabel}>Time</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="HH:MM"
              placeholderTextColor={Colors.textMuted}
              value={timeStr}
              onChangeText={setTimeStr}
              maxLength={5}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Location</Text>
          <LocationPicker
            latitude={Number.isFinite(parseFloat(latitude)) ? parseFloat(latitude) : 49.6935}
            longitude={Number.isFinite(parseFloat(longitude)) ? parseFloat(longitude) : -112.8418}
            onLocationChange={(lat, lng) => {
              setLatitude(String(lat));
              setLongitude(String(lng));
            }}
            accentColor={EVENT_COLOR}
            label="Tap the map or drag the pin to set meetup location"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Max Attendees (optional)</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Leave blank for unlimited"
            placeholderTextColor={Colors.textMuted}
            value={maxAttendees}
            onChangeText={setMaxAttendees}
            keyboardType="number-pad"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            (!title.trim() || !eventType || !dateStr || !timeStr || !latitude || !longitude || !description.trim() || isSubmitting) && styles.submitBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || !title.trim() || !eventType || !dateStr || !timeStr || !latitude || !longitude || !description.trim()}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.bg} />
          ) : (
            <>
              <Ionicons name={isEditing ? "checkmark-circle-outline" : "add-circle-outline"} size={20} color={Colors.bg} />
              <Text style={styles.submitBtnText}>{isEditing ? "Save Changes" : "Create Event"}</Text>
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
    backgroundColor: "#1a0a3e",
    borderWidth: 1,
    borderColor: EVENT_COLOR,
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
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipSelected: { backgroundColor: EVENT_COLOR + "22", borderColor: EVENT_COLOR },
  typeChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  typeChipTextSelected: { color: EVENT_COLOR, fontFamily: "Inter_600SemiBold" as const },

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
    textAlign: "right" as const,
    marginTop: 4,
  },

  rowFields: { flexDirection: "row", gap: 12 },

  submitBtn: {
    backgroundColor: EVENT_COLOR,
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
