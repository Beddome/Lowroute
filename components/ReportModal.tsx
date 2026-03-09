import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "scam_fraud", label: "Scam / Fraud" },
  { value: "harassment", label: "Harassment" },
  { value: "inaccurate", label: "Inaccurate" },
  { value: "other", label: "Other" },
];

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: string;
  contentId: string;
  targetUserId: string;
}

export default function ReportModal({
  visible,
  onClose,
  contentType,
  contentId,
  targetUserId,
}: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert("Select a reason", "Please select a reason for your report.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/reports", {
        contentType,
        contentId,
        targetUserId,
        reason,
        description: description.trim() || undefined,
      });
      Alert.alert("Report submitted", "Thank you for your report. We will review it shortly.");
      setReason("");
      setDescription("");
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason("");
    setDescription("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Report</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Reason</Text>
            {REASONS.map((r) => (
              <Pressable
                key={r.value}
                style={styles.radioRow}
                onPress={() => setReason(r.value)}
              >
                <View style={[styles.radio, reason === r.value && styles.radioSelected]}>
                  {reason === r.value && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioLabel}>{r.label}</Text>
              </Pressable>
            ))}

            <Text style={[styles.label, { marginTop: 16 }]}>Details (optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Additional details..."
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
            />
          </ScrollView>

          <Pressable
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.bg} />
            ) : (
              <Text style={styles.submitButtonText}>Submit Report</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  body: {
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  radioSelected: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  radioLabel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  textInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  submitButton: {
    margin: 20,
    marginTop: 12,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
});
