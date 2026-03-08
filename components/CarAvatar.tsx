import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const AVATAR_STYLES: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "sedan", label: "Sedan", icon: "car" },
  { value: "sports", label: "Sports", icon: "car-sport" },
  { value: "coupe", label: "Coupe", icon: "car-sport-outline" },
  { value: "suv", label: "SUV", icon: "car-outline" },
  { value: "truck", label: "Truck", icon: "bus" },
  { value: "hatchback", label: "Hatch", icon: "car" },
  { value: "wagon", label: "Wagon", icon: "car-outline" },
  { value: "van", label: "Van", icon: "bus-outline" },
];

export const AVATAR_COLORS = [
  "#F97316",
  "#3B82F6",
  "#EF4444",
  "#22C55E",
  "#A855F7",
  "#EAB308",
  "#FFFFFF",
  "#6B7280",
];

function getIconForStyle(style: string): keyof typeof Ionicons.glyphMap {
  const found = AVATAR_STYLES.find((s) => s.value === style);
  return found ? found.icon : "car";
}

interface CarAvatarProps {
  style?: string;
  color?: string;
  size?: number;
}

export default function CarAvatar({ style = "sedan", color = "#F97316", size = 40 }: CarAvatarProps) {
  const iconSize = Math.round(size * 0.5);
  const icon = getIconForStyle(style);

  return (
    <View
      style={[
        s.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + "22",
          borderColor: color,
        },
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={color} />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
});
