import React from "react";
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors } from "@/constants/colors";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ text }: { text: string }) {
  return <Text style={s.paragraph}>{text}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={s.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow}>
          <View style={s.bullet} />
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.lastUpdated}>Last Updated: January 2025</Text>

        <Paragraph text='LowRoute ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the LowRoute mobile application and related services.' />

        <Section title="1. Information We Collect">
          <Text style={s.subTitle}>Account Information</Text>
          <BulletList items={[
            "Username and email address provided during registration",
            "Password (stored in hashed form, never in plain text)",
            "Profile preferences and settings",
          ]} />

          <Text style={s.subTitle}>Location Data</Text>
          <BulletList items={[
            "Foreground location: Used for map display, route planning, and hazard reporting when the app is actively in use",
            "Background location: Used for live navigation, turn-by-turn directions, and sharing your location with friends (when enabled). You can disable background location at any time in your device settings",
            "Location data associated with hazard reports you submit",
          ]} />

          <Text style={s.subTitle}>User-Generated Content</Text>
          <BulletList items={[
            "Hazard reports including descriptions, photos, and geographic coordinates",
            "Marketplace listings with descriptions, photos, and pricing",
            "Messages sent through direct and group conversations",
            "Event postings and RSVPs",
            "Car profile information (make, model, year, ride height, suspension type)",
          ]} />

          <Text style={s.subTitle}>Usage Data</Text>
          <BulletList items={[
            "App interaction data such as features used and time spent",
            "Device information (operating system, device model)",
            "Crash reports and performance data",
          ]} />
        </Section>

        <Section title="2. How We Use Your Information">
          <BulletList items={[
            "Provide, operate, and maintain the LowRoute application",
            "Display hazards on the map and calculate safe routes for low-clearance vehicles",
            "Enable social features including friends, messaging, events, and marketplace",
            "Share your live location with friends you have connected with (when enabled)",
            "Calculate reputation scores and award badges based on community contributions",
            "Process and manage subscription services",
            "Improve and optimize app performance and user experience",
            "Communicate important updates about the service",
          ]} />
        </Section>

        <Section title="3. Third-Party Services">
          <Paragraph text="We integrate with the following third-party services:" />
          <BulletList items={[
            "Google Maps: For map display, geocoding, and route calculation. Subject to Google's Privacy Policy",
            "RevenueCat: For subscription management and in-app purchase processing. Subject to RevenueCat's Privacy Policy",
            "Expo: For app distribution and push notification delivery",
          ]} />
        </Section>

        <Section title="4. Data Sharing and Disclosure">
          <Paragraph text="We do not sell your personal information. We may share your data in the following circumstances:" />
          <BulletList items={[
            "With other users: Your username, reputation, hazard reports, marketplace listings, and (if enabled) live location are visible to other users",
            "With service providers: Third-party services that help us operate the app (as listed above)",
            "For legal compliance: When required by law, court order, or governmental authority",
            "For safety: When necessary to protect the safety of our users or the public",
          ]} />
        </Section>

        <Section title="5. Data Retention">
          <BulletList items={[
            "Account data is retained as long as your account is active",
            "Hazard reports may be retained after account deletion if they serve an active safety purpose (they will be anonymized)",
            "Messages are retained for the duration of the conversation",
            "You may request deletion of your account and associated data at any time through the app settings",
          ]} />
        </Section>

        <Section title="6. Your Rights">
          <Paragraph text="You have the right to:" />
          <BulletList items={[
            "Access your personal data (available through the Export Data feature in settings)",
            "Request correction of inaccurate data",
            "Request deletion of your account and personal data",
            "Opt out of location sharing at any time",
            "Withdraw consent for background location tracking via device settings",
          ]} />
        </Section>

        <Section title="7. Data Security">
          <Paragraph text="We implement appropriate technical and organizational measures to protect your personal information, including encrypted passwords, secure session management, and HTTPS encryption for all data transmission." />
        </Section>

        <Section title="8. Children's Privacy">
          <Paragraph text="LowRoute is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will promptly delete such information. If you believe a child under 13 has provided us with personal data, please contact us." />
        </Section>

        <Section title="9. Changes to This Policy">
          <Paragraph text="We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy in the app and updating the 'Last Updated' date. Your continued use of the app after changes constitutes acceptance of the updated policy." />
        </Section>

        <Section title="10. Contact Us">
          <Paragraph text="If you have questions about this Privacy Policy or our data practices, please contact us through the app or visit our website." />
        </Section>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.text },
  lastUpdated: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    marginTop: 20,
    marginBottom: 16,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletList: { gap: 6, marginBottom: 4 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingRight: 8 },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
  },
});
