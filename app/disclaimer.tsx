import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";

interface DisclaimerScreenProps {
  onAccept: () => void;
}

export default function DisclaimerScreen({ onAccept }: DisclaimerScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad + 24, paddingBottom: bottomPad + 24 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={["#F59E0B", "#D97706"]}
            style={styles.iconGradient}
          >
            <Ionicons name="shield-checkmark" size={48} color="#000" />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Safety First</Text>
        <Text style={styles.subtitle}>
          Please read before using LowRoute
        </Text>

        <View style={styles.card}>
          <View style={styles.cardItem}>
            <Ionicons name="navigate-outline" size={22} color={Colors.accent} />
            <View style={styles.cardItemText}>
              <Text style={styles.cardItemTitle}>Advisory Information Only</Text>
              <Text style={styles.cardItemDesc}>
                LowRoute provides route suggestions and hazard reports based on community data. This information is advisory only and should not replace your own judgment while driving.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardItem}>
            <Ionicons name="eye-off-outline" size={22} color={Colors.tier4} />
            <View style={styles.cardItemText}>
              <Text style={styles.cardItemTitle}>Do Not Use While Driving</Text>
              <Text style={styles.cardItemDesc}>
                Never interact with your phone while operating a vehicle. Set your route before you start driving and use voice navigation for hands-free guidance.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardItem}>
            <Ionicons name="warning-outline" size={22} color={Colors.tier3} />
            <View style={styles.cardItemText}>
              <Text style={styles.cardItemTitle}>Road Conditions Change</Text>
              <Text style={styles.cardItemDesc}>
                Hazard reports may not reflect current conditions. Always observe the road ahead and proceed with caution, especially in unfamiliar areas.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardItem}>
            <Ionicons name="person-outline" size={22} color={Colors.tier2} />
            <View style={styles.cardItemText}>
              <Text style={styles.cardItemTitle}>Driver Responsibility</Text>
              <Text style={styles.cardItemDesc}>
                You are solely responsible for your driving decisions. LowRoute is not liable for any vehicle damage, accidents, or incidents.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomSection}>
        <Pressable
          style={({ pressed }) => [styles.acceptButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={onAccept}
          testID="disclaimer-accept"
        >
          <Ionicons name="checkmark-circle" size={20} color="#000" />
          <Text style={styles.acceptText}>I Understand & Accept</Text>
        </Pressable>
        <Text style={styles.footerNote}>
          By continuing, you acknowledge that LowRoute provides advisory route information and you accept full responsibility for your driving decisions.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  iconGradient: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 0,
  },
  cardItem: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 4,
  },
  cardItemText: {
    flex: 1,
    gap: 4,
  },
  cardItemTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  cardItemDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  bottomSection: {
    gap: 14,
    paddingTop: 16,
  },
  acceptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
  },
  acceptText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  footerNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
