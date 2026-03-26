import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeHaptics as Haptics } from "@/lib/safe-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { CarProfile, SUSPENSION_TYPES, CLEARANCE_MODES } from "@/shared/types";
import CarAvatar, { AVATAR_STYLES, AVATAR_COLORS } from "@/components/CarAvatar";

export default function CarProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const isEditing = !!id;

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [rideHeight, setRideHeight] = useState("");
  const [suspensionType, setSuspensionType] = useState<CarProfile["suspensionType"]>("stock");
  const [hasFrontLip, setHasFrontLip] = useState(false);
  const [wheelSize, setWheelSize] = useState("");
  const [clearanceMode, setClearanceMode] = useState<CarProfile["clearanceMode"]>("normal");
  const [isDefault, setIsDefault] = useState(false);
  const [avatarStyle, setAvatarStyle] = useState("sedan");
  const [avatarColor, setAvatarColor] = useState("#F97316");

  const { data: car, isLoading: loadingCar } = useQuery<CarProfile>({
    queryKey: ["/api/cars", id],
    enabled: isEditing,
  });

  useEffect(() => {
    if (car) {
      setMake(car.make);
      setModel(car.model);
      setYear(String(car.year));
      setRideHeight(car.rideHeight != null ? String(car.rideHeight) : "");
      setSuspensionType(car.suspensionType);
      setHasFrontLip(car.hasFrontLip);
      setWheelSize(car.wheelSize != null ? String(car.wheelSize) : "");
      setClearanceMode(car.clearanceMode);
      setIsDefault(car.isDefault);
      setAvatarStyle(car.avatarStyle ?? "sedan");
      setAvatarColor(car.avatarColor ?? "#F97316");
    }
  }, [car]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year, 10),
        rideHeight: rideHeight ? parseFloat(rideHeight) : null,
        suspensionType,
        hasFrontLip,
        wheelSize: wheelSize ? parseFloat(wheelSize) : null,
        clearanceMode,
        isDefault,
        avatarStyle,
        avatarColor,
      };
      if (isEditing) {
        return apiRequest("PUT", `/api/cars/${id}`, body);
      }
      return apiRequest("POST", "/api/cars", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/cars/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
  });

  const handleDelete = () => {
    if (Platform.OS === "web") {
      if (confirm("Delete this car profile?")) {
        deleteMutation.mutate();
      }
      return;
    }
    Alert.alert("Delete Car", "Are you sure you want to delete this car profile?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  const canSave = make.trim() && model.trim() && year && !isNaN(parseInt(year, 10));

  if (isEditing && loadingCar) {
    return (
      <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 16 : 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? "Edit Car" : "Add Car"}</Text>
        <Pressable
          onPress={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
          hitSlop={8}
        >
          <Ionicons
            name="checkmark"
            size={26}
            color={canSave && !saveMutation.isPending ? Colors.accent : Colors.textMuted}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {(saveMutation.isError || deleteMutation.isError) && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              {(saveMutation.error ?? deleteMutation.error)?.message ?? "Something went wrong"}
            </Text>
          </View>
        )}

        <View style={styles.avatarPreview}>
          <CarAvatar style={avatarStyle} color={avatarColor} size={80} />
        </View>

        <Text style={styles.sectionLabel}>Car Style</Text>
        <View style={styles.chipRow}>
          {AVATAR_STYLES.map((s) => (
            <Pressable
              key={s.value}
              style={[styles.avatarChip, avatarStyle === s.value && { backgroundColor: avatarColor + "22", borderColor: avatarColor }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAvatarStyle(s.value);
              }}
            >
              <Ionicons name={s.icon} size={18} color={avatarStyle === s.value ? avatarColor : Colors.textSecondary} />
              <Text style={[styles.avatarChipText, avatarStyle === s.value && { color: avatarColor }]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {AVATAR_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAvatarColor(c);
              }}
              style={[
                styles.colorSwatch,
                { backgroundColor: c },
                avatarColor === c && styles.colorSwatchActive,
                avatarColor === c && { borderColor: c === "#FFFFFF" ? Colors.textSecondary : c },
                c === "#FFFFFF" && { borderColor: Colors.border },
              ]}
            >
              {avatarColor === c && (
                <Ionicons name="checkmark" size={16} color={c === "#FFFFFF" || c === "#EAB308" ? "#000" : "#FFF"} />
              )}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Vehicle Info</Text>
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Make</Text>
            <TextInput
              style={styles.input}
              value={make}
              onChangeText={setMake}
              placeholder="Honda"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Model</Text>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              placeholder="Civic"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Year</Text>
            <TextInput
              style={styles.input}
              value={year}
              onChangeText={setYear}
              placeholder="2024"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Ride Height (in)</Text>
            <TextInput
              style={styles.input}
              value={rideHeight}
              onChangeText={setRideHeight}
              placeholder="4.5"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={[styles.inputGroup, { marginBottom: 4 }]}>
          <Text style={styles.label}>Wheel Size (in)</Text>
          <TextInput
            style={styles.input}
            value={wheelSize}
            onChangeText={setWheelSize}
            placeholder="18"
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.sectionLabel}>Suspension Type</Text>
        <View style={styles.chipRow}>
          {SUSPENSION_TYPES.map((s) => (
            <Pressable
              key={s.value}
              style={[styles.chip, suspensionType === s.value && styles.chipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSuspensionType(s.value as CarProfile["suspensionType"]);
              }}
            >
              <Text style={[styles.chipText, suspensionType === s.value && styles.chipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Clearance Mode</Text>
        <View style={styles.chipRow}>
          {CLEARANCE_MODES.map((c) => (
            <Pressable
              key={c.value}
              style={[styles.chip, clearanceMode === c.value && styles.chipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setClearanceMode(c.value as CarProfile["clearanceMode"]);
              }}
            >
              <Text style={[styles.chipText, clearanceMode === c.value && styles.chipTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Options</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Ionicons name="speedometer-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.toggleLabel}>Front Lip</Text>
          </View>
          <Switch
            value={hasFrontLip}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setHasFrontLip(v);
            }}
            trackColor={{ false: Colors.bgElevated, true: Colors.accent + "55" }}
            thumbColor={hasFrontLip ? Colors.accent : Colors.textMuted}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Ionicons name="star-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.toggleLabel}>Set as Default</Text>
          </View>
          <Switch
            value={isDefault}
            onValueChange={(v) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsDefault(v);
            }}
            trackColor={{ false: Colors.bgElevated, true: Colors.accent + "55" }}
            thumbColor={isDefault ? Colors.accent : Colors.textMuted}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            !canSave && styles.saveBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
          testID="save-car"
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color={Colors.bg} />
          ) : (
            <>
              <Ionicons name={isEditing ? "checkmark-circle-outline" : "add-circle-outline"} size={20} color={Colors.bg} />
              <Text style={styles.saveBtnText}>{isEditing ? "Save Changes" : "Add to Garage"}</Text>
            </>
          )}
        </Pressable>

        {isEditing && (
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color={Colors.error} size="small" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
                <Text style={styles.deleteBtnText}>Delete Car Profile</Text>
              </>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgCard },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  errorBanner: {
    backgroundColor: Colors.error + "22",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.error + "44",
  },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.error },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 12 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
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
    backgroundColor: Colors.accent + "22",
    borderColor: Colors.accent,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error + "44",
    backgroundColor: Colors.error + "11",
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.error },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.bg, fontSize: 16, fontFamily: "Inter_700Bold" },
  avatarPreview: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 20,
    marginBottom: 4,
  },
  avatarChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  colorRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 12,
    marginBottom: 4,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  colorSwatchActive: {
    borderWidth: 3,
  },
});
