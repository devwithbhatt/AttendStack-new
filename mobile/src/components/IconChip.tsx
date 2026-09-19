import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { colors, radii } from "../theme";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export function IconChip({
  name,
  size = 44,
  iconSize,
  colorsPair,
}: {
  name: FeatherName;
  size?: number;
  iconSize?: number;
  colorsPair?: [string, string];
}) {
  return (
    <LinearGradient
      colors={colorsPair || [colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.chip,
        { width: size, height: size, borderRadius: size >= 40 ? radii.md : radii.sm },
      ]}
    >
      <Feather name={name} size={iconSize || Math.round(size * 0.5)} color="#fff" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    justifyContent: "center",
  },
});
