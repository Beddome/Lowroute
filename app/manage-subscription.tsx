import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription, ENTITLEMENT_ID } from "@/lib/revenuecat";
import { Colors } from "@/constants/colors";

export default function ManageSubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { customerInfo, isSubscribed, restore, isRestoring } = useSubscription();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const activeEntitlement = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
  const expirationDate = activeEntitlement?.expirationDate;
  const willRenew = activeEntitlement?.willRenew;
  const store = activeEntitlement?.store;

  const formattedExpiry = expirationDate
    ? new Date(expirationDate).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : user?.subscriptionExpiresAt
    ? new Date(user.subscriptionExpiresAt).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const handleManageInStore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else if (Platform.OS === "android") {
      Linking.openURL("https://play.google.com/store/account/subscriptions");
    } else {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const storeLabel =
    store === "app_store"
      ? "Apple App Store"
      : store === "play_store"
      ? "Google Play Store"
      : store === "promotional"
      ? "Promo Code"
      : "Store";

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()} hitSlop={16}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>Subscription</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusIconRow}>
          <View style={styles.statusIcon}>
            <Ionicons
              name={isSubscribed ? "rocket" : "person"}
              size={28}
              color={isSubscribed ? Colors.accent : Colors.textMuted}
            />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusPlan}>
              {isSubscribed ? "LowRoute Pro" : "Free Plan"}
            </Text>
            <Text style={styles.statusDesc}>
              {isSubscribed
                ? "Full access to all premium features"
                : "Basic hazard map & reporting"}
            </Text>
          </View>
        </View>

        {isSubscribed && (
          <View style={styles.detailsList}>
            {formattedExpiry && (
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.detailLabel}>
                  {willRenew ? "Renews" : "Expires"}
                </Text>
                <Text style={styles.detailValue}>{formattedExpiry}</Text>
              </View>
            )}
            {store && (
              <View style={styles.detailRow}>
                <Ionicons name="storefront-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.detailLabel}>Billed via</Text>
                <Text style={styles.detailValue}>{storeLabel}</Text>
              </View>
            )}
            {willRenew !== undefined && (
              <View style={styles.detailRow}>
                <Ionicons
                  name={willRenew ? "checkmark-circle-outline" : "close-circle-outline"}
                  size={18}
                  color={willRenew ? Colors.tier1 : Colors.error}
                />
                <Text style={styles.detailLabel}>Auto-renew</Text>
                <Text style={[styles.detailValue, { color: willRenew ? Colors.tier1 : Colors.error }]}>
                  {willRenew ? "On" : "Off"}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {isSubscribed && store !== "promotional" && (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
            onPress={handleManageInStore}
          >
            <Ionicons name="open-outline" size={20} color={Colors.accent} />
            <View style={styles.actionTextGroup}>
              <Text style={styles.actionTitle}>Manage in {Platform.OS === "android" ? "Google Play" : "App Store"}</Text>
              <Text style={styles.actionSub}>Cancel, change plan, or update payment</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        )}

        {!isSubscribed && (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
            onPress={() => {
              router.back();
              setTimeout(() => router.push("/paywall"), 100);
            }}
          >
            <Ionicons name="rocket-outline" size={20} color={Colors.accent} />
            <View style={styles.actionTextGroup}>
              <Text style={styles.actionTitle}>Upgrade to Pro</Text>
              <Text style={styles.actionSub}>Get live navigation & hazard alerts</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator color={Colors.accent} size="small" />
          ) : (
            <Ionicons name="refresh-outline" size={20} color={Colors.accent} />
          )}
          <View style={styles.actionTextGroup}>
            <Text style={styles.actionTitle}>Restore Purchases</Text>
            <Text style={styles.actionSub}>Recover subscriptions from another device</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.footerNote}>
        Subscriptions are managed through the App Store or Google Play. LowRoute does not store payment details.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    paddingTop: 8,
  },
  closeBtn: {
    position: "absolute",
    right: 0,
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },

  statusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  statusIconRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  statusInfo: { flex: 1 },
  statusPlan: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  statusDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },

  detailsList: { marginTop: 18, gap: 12 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },

  actions: { gap: 8, marginBottom: 20 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionTextGroup: { flex: 1 },
  actionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  actionSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },

  footerNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
