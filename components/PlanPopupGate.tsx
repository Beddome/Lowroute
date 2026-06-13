import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "@/constants/colors";
import { useSubscription } from "@/lib/revenuecat";
import { useAuth } from "@/contexts/AuthContext";
import { PRO_FEATURES, FREE_FEATURES } from "@/constants/plans";

const PLAN_POPUP_KEY = "lowroute_plan_popup_seen";

export default function PlanPopupGate() {
  const insets = useSafeAreaInsets();
  const { isSubscribed, isLoading } = useSubscription();
  const { user, isLoading: authLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [seenChecked, setSeenChecked] = useState(false);
  const [hasSeen, setHasSeen] = useState(true);

  const isPro = isSubscribed || user?.subscriptionTier === "pro";

  useEffect(() => {
    AsyncStorage.getItem(PLAN_POPUP_KEY)
      .then((val) => setHasSeen(val === "true"))
      .catch(() => setHasSeen(false))
      .finally(() => setSeenChecked(true));
  }, []);

  useEffect(() => {
    // Wait until both the seen-flag and live subscription state are resolved.
    // Fail closed: if subscription/auth state is still loading, do not show.
    if (!seenChecked || hasSeen || isLoading || authLoading) return;
    if (isPro) {
      AsyncStorage.setItem(PLAN_POPUP_KEY, "true").catch(() => {});
      setHasSeen(true);
      return;
    }
    setVisible(true);
  }, [seenChecked, hasSeen, isLoading, authLoading, isPro]);

  const dismiss = () => {
    setVisible(false);
    setHasSeen(true);
    AsyncStorage.setItem(PLAN_POPUP_KEY, "true").catch(() => {});
  };

  const seePlans = () => {
    dismiss();
    setTimeout(() => router.push("/paywall"), 150);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: (Platform.OS === "web" ? 24 : insets.bottom) + 20 },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.iconWrap}>
            <LinearGradient
              colors={[Colors.accent, Colors.accentDark]}
              style={styles.iconGradient}
            >
              <Ionicons name="rocket" size={28} color="#000" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Unlock True Maps Pro</Text>
          <Text style={styles.subtitle}>
            See what you get for free and what Pro adds to protect your build.
          </Text>

          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.columnTitle}>Free</Text>
              {FREE_FEATURES.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={16} color={Colors.textMuted} />
                  <Text style={styles.featureTextMuted}>{f}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.column, styles.proColumn]}>
              <View style={styles.proBadge}>
                <Ionicons name="star" size={11} color="#000" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
              {PRO_FEATURES.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.tier1} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
            onPress={seePlans}
            testID="plan-popup-see-plans"
          >
            <Text style={styles.ctaText}>See Pro plans</Text>
            <Ionicons name="arrow-forward" size={18} color="#000" />
          </Pressable>

          <Pressable
            style={styles.dismissBtn}
            onPress={dismiss}
            testID="plan-popup-dismiss"
            hitSlop={8}
          >
            <Text style={styles.dismissText}>Maybe later</Text>
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
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  iconGradient: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  columns: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  column: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  proColumn: {
    borderColor: Colors.accent + "55",
    backgroundColor: Colors.accent + "0D",
  },
  columnTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    backgroundColor: Colors.accent,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 2,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#000",
    letterSpacing: 0.5,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    lineHeight: 18,
  },
  featureTextMuted: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  dismissBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  dismissText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
