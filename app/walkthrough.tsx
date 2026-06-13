import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";

interface WalkthroughScreenProps {
  onComplete: () => void;
}

interface Step {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: "navigate",
    color: Colors.accent,
    title: "Routes that protect your build",
    description:
      "Search any destination and True Maps scores every route against community hazards, then sorts them safest-first for your car's clearance.",
  },
  {
    icon: "warning",
    color: Colors.tier3,
    title: "Report what you hit",
    description:
      "Spotted a pothole, speed bump, or rough construction? Drop a hazard in a few taps so every low car behind you can avoid it.",
  },
  {
    icon: "car-sport",
    color: Colors.tier2,
    title: "Build your garage",
    description:
      "Add your rides with ride height, suspension, and clearance. Routes and risk scores adapt to whichever car you're driving.",
  },
  {
    icon: "calendar",
    color: Colors.event,
    title: "Roll to car meets",
    description:
      "Find nearby meets and cruises on the map, RSVP, and share live location with friends so the crew rolls together.",
  },
  {
    icon: "pricetags",
    color: Colors.marketplace,
    title: "Buy & sell parts",
    description:
      "Browse the community marketplace for parts near you, filter by category and condition, and list your own with photos.",
  },
  {
    icon: "chatbubbles",
    color: Colors.friend,
    title: "Stay connected",
    description:
      "Message friends, start group chats, and get notified the moment someone replies — all from your inbox.",
  },
];

export default function WalkthroughScreen({ onComplete }: WalkthroughScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }
  };

  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 },
      ]}
    >
      <View style={styles.topBar}>
        {index > 0 ? (
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
            testID="walkthrough-back"
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
            <Text style={styles.topBtnText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.topBtn} />
        )}
        <Pressable
          onPress={onComplete}
          hitSlop={10}
          style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
          testID="walkthrough-skip"
        >
          <Text style={styles.topBtnText}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={[step.color, Colors.bgCard]}
            style={styles.iconGradient}
          >
            <View style={[styles.iconInner, { backgroundColor: step.color + "26" }]}>
              <Ionicons name={step.icon} size={52} color={step.color} />
            </View>
          </LinearGradient>
        </View>

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
      </View>

      <View style={styles.bottomSection}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.nextButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
          onPress={goNext}
          testID="walkthrough-next"
        >
          <Text style={styles.nextText}>
            {isLast ? "Start driving" : "Next"}
          </Text>
          <Ionicons
            name={isLast ? "checkmark-circle" : "arrow-forward"}
            size={20}
            color="#000"
          />
        </Pressable>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
  },
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: 60,
  },
  topBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    marginBottom: 36,
  },
  iconGradient: {
    width: 132,
    height: 132,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 104,
    height: 104,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  description: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 4,
  },
  bottomSection: {
    gap: 24,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.accent,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
  },
  nextText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
});
