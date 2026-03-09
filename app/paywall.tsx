import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription, ENTITLEMENT_ID } from "@/lib/revenuecat";
import { Colors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import type { PurchasesPackage } from "react-native-purchases";

const FALLBACK_MONTHLY_PRICE = "$10.00 CAD";
const FALLBACK_YEARLY_PRICE = "$96.00 CAD";

const PRO_FEATURES = [
  "Live GPS navigation",
  "Hazard proximity alerts",
  "Priority reporting",
  "Ad-free experience",
  "Route history & analytics",
  "Early access to new features",
  "Exclusive badges",
];

const FREE_FEATURES = [
  "View hazard map",
  "Report hazards",
  "Community voting",
  "Basic route suggestions",
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const {
    offerings,
    isSubscribed,
    purchase,
    restore,
    isPurchasing,
    isRestoring,
    isLoading: rcLoading,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingPackage, setPendingPackage] = useState<PurchasesPackage | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const currentOffering = offerings?.current;
  const monthlyPkg = currentOffering?.availablePackages?.find(
    (p) => p.packageType === "MONTHLY" || p.identifier === "$rc_monthly" || p.identifier === "monthly"
  );
  const yearlyPkg = currentOffering?.availablePackages?.find(
    (p) => p.packageType === "ANNUAL" || p.identifier === "$rc_annual" || p.identifier === "yearly"
  );

  const monthlyPrice = monthlyPkg?.product?.priceString || FALLBACK_MONTHLY_PRICE;
  const yearlyPrice = yearlyPkg?.product?.priceString || FALLBACK_YEARLY_PRICE;

  const yearlyMonthly = yearlyPkg?.product?.price
    ? `${yearlyPkg.product.currencyCode} ${(yearlyPkg.product.price / 12).toFixed(2)}`
    : "$8.00 CAD";

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) return;
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    setPromoLoading(true);
    setPromoMessage(null);
    try {
      const res = await apiRequest("POST", "/api/promo/redeem", { code: promoCode.trim() });
      const data = await res.json();
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPromoMessage({ text: data.message, success: true });
      setPromoCode("");
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      let msg = "Failed to redeem promo code";
      if (err?.message) {
        const match = err.message.match(/^\d+:\s*(.+)/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.message) msg = parsed.message;
          } catch {
            msg = match[1];
          }
        }
      }
      setPromoMessage({ text: msg, success: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPromoLoading(false);
    }
  };

  const handlePurchase = () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    const pkg = selectedPlan === "monthly" ? monthlyPkg : yearlyPkg;
    if (!pkg) {
      setPurchaseError("This plan is not yet available. Check back soon.");
      return;
    }

    setPendingPackage(pkg);
    setPurchaseError(null);
    setConfirmVisible(true);
  };

  const confirmPurchase = async () => {
    if (!pendingPackage) return;
    setConfirmVisible(false);
    setPurchaseError(null);

    try {
      await purchase(pendingPackage);
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      if (err?.userCancelled) return;
      const msg = err?.message || "Purchase failed. Please try again.";
      setPurchaseError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRestore = async () => {
    setPurchaseError(null);
    try {
      const info = await restore();
      const hasEntitlement = info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
      if (hasEntitlement) {
        await refreshUser();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else {
        setPurchaseError("No active subscriptions found to restore.");
      }
    } catch {
      setPurchaseError("Failed to restore purchases. Please try again.");
    }
  };

  const currentTier = user?.subscriptionTier ?? "free";

  if (isSubscribed || currentTier === "pro") {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()} hitSlop={16} testID="paywall-close">
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
          <View style={[styles.headerIcon, { borderColor: Colors.accent + "66" }]}>
            <Ionicons name="rocket" size={40} color={Colors.accent} />
          </View>
          <Text style={styles.headerTitle}>You're on Pro</Text>
          <Text style={styles.headerSubtitle}>
            You have full access to all LowRoute Pro features.
          </Text>
        </View>
        <View style={styles.activeFeatures}>
          {PRO_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.tier1} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
        <View style={styles.ctaSection}>
          <Pressable
            style={[styles.manageBtn]}
            onPress={() => router.push("/manage-subscription")}
          >
            <Ionicons name="settings-outline" size={18} color={Colors.text} />
            <Text style={styles.manageBtnText}>Manage Subscription</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 34 + 20 }}
      >
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()} hitSlop={16} testID="paywall-close">
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
          <View style={styles.headerIcon}>
            <Ionicons name="car-sport" size={40} color={Colors.accent} />
          </View>
          <Text style={styles.headerTitle}>Upgrade Your Ride</Text>
          <Text style={styles.headerSubtitle}>
            Get live GPS navigation, hazard proximity alerts, and premium features to protect your build.
          </Text>
        </View>

        <View style={styles.plansContainer}>
          <Pressable
            style={[
              styles.planCard,
              selectedPlan === "yearly" && styles.planCardSelected,
            ]}
            onPress={() => {
              setSelectedPlan("yearly");
              Haptics.selectionAsync();
            }}
            testID="plan-yearly"
          >
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>SAVE 20%</Text>
            </View>
            <View style={styles.planRadio}>
              <View style={[styles.radioOuter, selectedPlan === "yearly" && styles.radioOuterSelected]}>
                {selectedPlan === "yearly" && <View style={styles.radioInner} />}
              </View>
            </View>
            <View style={styles.planDetails}>
              <Text style={styles.planName}>Yearly</Text>
              <Text style={styles.planPrice}>{yearlyPrice}<Text style={styles.planPeriod}>/year</Text></Text>
              <Text style={styles.planSub}>{yearlyMonthly}/month</Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.planCard,
              selectedPlan === "monthly" && styles.planCardSelected,
            ]}
            onPress={() => {
              setSelectedPlan("monthly");
              Haptics.selectionAsync();
            }}
            testID="plan-monthly"
          >
            <View style={styles.planRadio}>
              <View style={[styles.radioOuter, selectedPlan === "monthly" && styles.radioOuterSelected]}>
                {selectedPlan === "monthly" && <View style={styles.radioInner} />}
              </View>
            </View>
            <View style={styles.planDetails}>
              <Text style={styles.planName}>Monthly</Text>
              <Text style={styles.planPrice}>{monthlyPrice}<Text style={styles.planPeriod}>/month</Text></Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.featuresSection}>
          <Text style={styles.featuresSectionTitle}>Everything in Pro</Text>
          {PRO_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.tier1} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Text style={styles.featuresSectionTitle}>Free includes</Text>
          {FREE_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={18} color={Colors.textMuted} />
              <Text style={[styles.featureText, { color: Colors.textSecondary }]}>{f}</Text>
            </View>
          ))}
        </View>

        {purchaseError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{purchaseError}</Text>
          </View>
        )}

        <View style={styles.ctaSection}>
          <Pressable
            style={[styles.ctaButton, (isPurchasing || rcLoading) && styles.ctaButtonDisabled]}
            onPress={handlePurchase}
            disabled={isPurchasing || rcLoading}
            testID="paywall-subscribe"
          >
            {isPurchasing ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <>
                <Ionicons name="rocket" size={20} color={Colors.bg} />
                <Text style={styles.ctaText}>
                  {selectedPlan === "yearly" ? `Get Pro — ${yearlyPrice}/year` : `Get Pro — ${monthlyPrice}/month`}
                </Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={handleRestore} disabled={isRestoring} style={styles.restoreBtn}>
            {isRestoring ? (
              <ActivityIndicator color={Colors.textMuted} size="small" />
            ) : (
              <Text style={styles.restoreText}>Restore Purchases</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.guaranteeSection}>
          <View style={styles.guaranteeRow}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.tier1} />
            <Text style={styles.guaranteeText}>Cancel anytime, no questions asked</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="lock-closed" size={20} color={Colors.tier1} />
            <Text style={styles.guaranteeText}>Secure payments via App Store / Google Play</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="people" size={20} color={Colors.tier1} />
            <Text style={styles.guaranteeText}>Built by the low-car community</Text>
          </View>
        </View>

        <View style={styles.promoSection}>
          <View style={styles.promoHeader}>
            <Ionicons name="pricetag" size={18} color={Colors.accent} />
            <Text style={styles.promoTitle}>Have a promo code?</Text>
          </View>
          <View style={styles.promoInputRow}>
            <TextInput
              style={styles.promoInput}
              value={promoCode}
              onChangeText={(t) => {
                setPromoCode(t.toUpperCase());
                setPromoMessage(null);
              }}
              placeholder="LOWPRO-XXXXXX"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!promoLoading}
            />
            <Pressable
              style={[styles.promoBtn, (!promoCode.trim() || promoLoading) && { opacity: 0.5 }]}
              onPress={handleRedeemPromo}
              disabled={!promoCode.trim() || promoLoading}
            >
              {promoLoading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Ionicons name="arrow-forward" size={20} color={Colors.bg} />
              )}
            </Pressable>
          </View>
          {promoMessage && (
            <View style={[styles.promoMsg, { backgroundColor: promoMessage.success ? Colors.tier1 + "15" : Colors.error + "15" }]}>
              <Ionicons
                name={promoMessage.success ? "checkmark-circle" : "alert-circle"}
                size={16}
                color={promoMessage.success ? Colors.tier1 : Colors.error}
              />
              <Text style={[styles.promoMsgText, { color: promoMessage.success ? Colors.tier1 : Colors.error }]}>
                {promoMessage.text}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Purchase</Text>
            <Text style={styles.modalBody}>
              Subscribe to LowRoute Pro ({selectedPlan === "yearly" ? "Yearly" : "Monthly"}) for{" "}
              {selectedPlan === "yearly" ? yearlyPrice : monthlyPrice}
              {selectedPlan === "yearly" ? "/year" : "/month"}?
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setConfirmVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirm}
                onPress={confirmPurchase}
              >
                <Text style={styles.modalConfirmText}>Subscribe</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { alignItems: "center", padding: 24, paddingTop: 16 },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },

  plansContainer: { paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  planCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  planCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "0D",
  },
  saveBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomLeftRadius: 10,
  },
  saveBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.bg,
    letterSpacing: 0.5,
  },
  planRadio: { width: 24 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: Colors.accent },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
  planDetails: { flex: 1 },
  planName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  planPrice: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text, marginTop: 2 },
  planPeriod: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  planSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },

  featuresSection: { paddingHorizontal: 24, marginTop: 16, marginBottom: 8 },
  featuresSectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },

  activeFeatures: { paddingHorizontal: 24, marginTop: 8 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.error + "15",
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.error },

  ctaSection: { padding: 24, alignItems: "center" },
  ctaButton: {
    backgroundColor: Colors.accent,
    borderRadius: 16,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  ctaButtonDisabled: { opacity: 0.5 },
  ctaText: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.bg },
  restoreBtn: { marginTop: 14, padding: 8 },
  restoreText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textMuted },

  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manageBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },

  guaranteeSection: { paddingHorizontal: 24, gap: 14, marginBottom: 20 },
  guaranteeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  guaranteeText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },

  promoSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promoHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  promoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  promoInputRow: { flexDirection: "row", gap: 10 },
  promoInput: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promoBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  promoMsg: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  promoMsgText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalContent: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  modalConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.bg },
});
