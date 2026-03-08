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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const TIERS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    color: Colors.textSecondary,
    features: [
      { text: "View hazard map", included: true },
      { text: "Report hazards", included: true },
      { text: "Community voting", included: true },
      { text: "Basic route suggestions", included: true },
      { text: "Live GPS navigation", included: false },
      { text: "Hazard proximity alerts", included: false },
      { text: "Priority reporting", included: false },
      { text: "Ad-free experience", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "TBD",
    period: "/month",
    color: Colors.accent,
    badge: "MOST POPULAR",
    features: [
      { text: "Everything in Free", included: true },
      { text: "Live GPS navigation", included: true },
      { text: "Hazard proximity alerts", included: true },
      { text: "Priority reporting", included: true },
      { text: "Ad-free experience", included: true },
      { text: "Route history & analytics", included: true },
      { text: "Early access to new features", included: true },
      { text: "Exclusive badges", included: true },
    ],
  },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [selectedTier, setSelectedTier] = useState<string>(user?.subscriptionTier ?? "free");
  const [isLoading, setIsLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ text: string; success: boolean } | null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

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

  const handleSubscribe = async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    if (selectedTier === "pro") {
      Alert.alert(
        "Coming Soon",
        "Pro subscriptions are launching soon! We're finalizing pricing to make it accessible for the low-car community. You'll be the first to know.",
        [{ text: "Got it", style: "default" }]
      );
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/subscription", { tier: selectedTier });
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Failed to update subscription");
    } finally {
      setIsLoading(false);
    }
  };

  const currentTier = user?.subscriptionTier ?? "free";

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

        <View style={styles.tiersContainer}>
          {TIERS.map((tier) => {
            const isSelected = selectedTier === tier.id;
            const isCurrent = currentTier === tier.id;
            return (
              <Pressable
                key={tier.id}
                style={[
                  styles.tierCard,
                  isSelected && { borderColor: tier.color, borderWidth: 2 },
                ]}
                onPress={() => {
                  setSelectedTier(tier.id);
                  Haptics.selectionAsync();
                }}
              >
                {tier.badge && (
                  <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
                    <Text style={styles.tierBadgeText}>{tier.badge}</Text>
                  </View>
                )}
                <View style={styles.tierHeader}>
                  <Text style={[styles.tierName, { color: tier.color }]}>{tier.name}</Text>
                  <View style={styles.tierPricing}>
                    <Text style={styles.tierPrice}>{tier.price}</Text>
                    <Text style={styles.tierPeriod}>{tier.period}</Text>
                  </View>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>CURRENT</Text>
                    </View>
                  )}
                </View>
                <View style={styles.featureList}>
                  {tier.features.map((feature) => (
                    <View key={feature.text} style={styles.featureRow}>
                      <Ionicons
                        name={feature.included ? "checkmark-circle" : "close-circle"}
                        size={18}
                        color={feature.included ? Colors.tier1 : Colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.featureText,
                          !feature.included && { color: Colors.textMuted },
                        ]}
                      >
                        {feature.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.ctaSection}>
          <Pressable
            style={[
              styles.ctaButton,
              selectedTier === currentTier && styles.ctaButtonDisabled,
            ]}
            onPress={handleSubscribe}
            disabled={isLoading || selectedTier === currentTier}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <>
                <Ionicons
                  name={selectedTier === "pro" ? "rocket" : "checkmark-circle"}
                  size={20}
                  color={Colors.bg}
                />
                <Text style={styles.ctaText}>
                  {selectedTier === currentTier
                    ? "Current Plan"
                    : selectedTier === "pro"
                    ? "Get Pro Access"
                    : "Switch to Free"}
                </Text>
              </>
            )}
          </Pressable>
          <Text style={styles.ctaDisclaimer}>
            {selectedTier === "pro"
              ? "Pricing coming soon. No charges in preview mode."
              : "Free forever. Upgrade anytime."}
          </Text>
        </View>

        <View style={styles.guaranteeSection}>
          <View style={styles.guaranteeRow}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.tier1} />
            <Text style={styles.guaranteeText}>Cancel anytime, no questions asked</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="lock-closed" size={20} color={Colors.tier1} />
            <Text style={styles.guaranteeText}>Secure payments via RevenueCat</Text>
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

  tiersContainer: { paddingHorizontal: 16, gap: 12 },
  tierCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    overflow: "hidden",
  },
  tierBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  tierBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.bg,
    letterSpacing: 0.5,
  },
  tierHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  tierName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  tierPricing: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 2 },
  tierPrice: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.text },
  tierPeriod: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  currentBadge: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currentBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.textSecondary },

  featureList: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },

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
  ctaDisclaimer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 10,
    textAlign: "center",
  },

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
  promoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  promoTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  promoInputRow: {
    flexDirection: "row",
    gap: 10,
  },
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
});
