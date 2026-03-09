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

export default function TermsOfServiceScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Terms of Service</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.lastUpdated}>Last Updated: January 2025</Text>

        <Paragraph text='Welcome to LowRoute. By accessing or using the LowRoute mobile application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App.' />

        <Section title="1. Eligibility">
          <Paragraph text="You must be at least 13 years of age to use LowRoute. By using the App, you represent and warrant that you are at least 13 years old and have the legal capacity to enter into these Terms." />
        </Section>

        <Section title="2. Account Registration">
          <BulletList items={[
            "You must provide accurate and complete information when creating an account",
            "You are responsible for maintaining the confidentiality of your account credentials",
            "You are responsible for all activities that occur under your account",
            "You must notify us immediately of any unauthorized use of your account",
            "We reserve the right to suspend or terminate accounts that violate these Terms",
          ]} />
        </Section>

        <Section title="3. Acceptable Use">
          <Paragraph text="You agree not to:" />
          <BulletList items={[
            "Submit false, misleading, or inaccurate hazard reports",
            "Use the App to harass, abuse, or threaten other users",
            "Post spam, fraudulent listings, or deceptive content in the marketplace",
            "Attempt to gain unauthorized access to other users' accounts or data",
            "Use the App in any way that violates applicable laws or regulations",
            "Reverse engineer, decompile, or disassemble any part of the App",
            "Use automated tools to scrape or collect data from the App",
            "Impersonate other users or misrepresent your identity",
          ]} />
        </Section>

        <Section title="4. User-Generated Content">
          <Paragraph text="By submitting content to LowRoute (including hazard reports, marketplace listings, messages, photos, and event postings), you:" />
          <BulletList items={[
            "Grant LowRoute a non-exclusive, worldwide, royalty-free license to use, display, and distribute your content within the App",
            "Represent that you own or have the right to share the content",
            "Acknowledge that your content may be visible to other users",
            "Understand that we may remove content that violates these Terms or our community guidelines",
          ]} />
        </Section>

        <Section title="5. Content Moderation">
          <Paragraph text="We reserve the right to review, moderate, and remove any user-generated content at our sole discretion. Users can report content that violates our guidelines. We may take action including content removal, account warnings, suspension, or termination for violations." />
        </Section>

        <Section title="6. Driving Safety Disclaimer">
          <Paragraph text="IMPORTANT: LowRoute provides advisory route information and hazard data submitted by community members. LowRoute is NOT a replacement for your own judgment while driving." />
          <BulletList items={[
            "Always observe traffic laws and road conditions regardless of information shown in the App",
            "Do not interact with the App while operating a vehicle",
            "Hazard reports are community-sourced and may be inaccurate, outdated, or incomplete",
            "Route suggestions are advisory only; road conditions may change without notice",
            "You are solely responsible for your driving decisions and vehicle safety",
            "LowRoute assumes no liability for damage to your vehicle, personal injury, or any other losses arising from use of the App's route or hazard information",
          ]} />
        </Section>

        <Section title="7. Marketplace">
          <Paragraph text="The LowRoute marketplace allows users to list and discover automotive parts and accessories. Please note:" />
          <BulletList items={[
            "LowRoute is a platform for connecting buyers and sellers; we are not a party to any transaction",
            "LowRoute does not guarantee the quality, safety, legality, or accuracy of any listing",
            "LowRoute does not handle payments, shipping, or dispute resolution between users",
            "All transactions are conducted at your own risk",
            "You are responsible for complying with applicable laws regarding the sale and purchase of goods",
          ]} />
        </Section>

        <Section title="8. Subscriptions">
          <BulletList items={[
            "LowRoute offers optional paid subscription tiers with additional features",
            "Subscriptions are managed through the Apple App Store or Google Play Store",
            "Subscription billing, renewal, and cancellation are governed by the respective store's terms",
            "We may change subscription pricing or features with reasonable notice",
            "Refund requests should be directed to the Apple App Store or Google Play Store",
          ]} />
        </Section>

        <Section title="9. Account Termination">
          <BulletList items={[
            "You may delete your account at any time through the App settings",
            "We may suspend or terminate your account for violations of these Terms",
            "Upon termination, your personal data will be deleted in accordance with our Privacy Policy",
            "Certain anonymized data (such as confirmed hazard reports) may be retained for community safety purposes",
          ]} />
        </Section>

        <Section title="10. Limitation of Liability">
          <Paragraph text='TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LOWROUTE AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO VEHICLE DAMAGE, PERSONAL INJURY, LOSS OF DATA, OR LOSS OF PROFITS, ARISING FROM YOUR USE OF THE APP.' />
          <Paragraph text="The App is provided on an 'as is' and 'as available' basis without warranties of any kind, either express or implied." />
        </Section>

        <Section title="11. Indemnification">
          <Paragraph text="You agree to indemnify and hold harmless LowRoute and its affiliates from any claims, damages, losses, or expenses arising from your use of the App, your violation of these Terms, or your violation of any rights of another party." />
        </Section>

        <Section title="12. Changes to Terms">
          <Paragraph text="We reserve the right to modify these Terms at any time. We will provide notice of material changes through the App. Your continued use of the App after changes constitutes acceptance of the updated Terms." />
        </Section>

        <Section title="13. Governing Law">
          <Paragraph text="These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law provisions." />
        </Section>

        <Section title="14. Contact">
          <Paragraph text="If you have questions about these Terms of Service, please contact us through the app or visit our website." />
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
