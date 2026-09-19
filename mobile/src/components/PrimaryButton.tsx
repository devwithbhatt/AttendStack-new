import React from "react";
import { Text, StyleSheet, ActivityIndicator, TouchableOpacity, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, radii } from "../theme";

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "danger" | "outline";
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;

  if (variant === "outline") {
    return (
      <TouchableOpacity
        style={[styles.outline, style, isDisabled && { opacity: 0.5 }]}
        onPress={onPress}
        disabled={isDisabled}
      >
        {loading ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.outlineText}>{title}</Text>}
      </TouchableOpacity>
    );
  }

  const gradientColors: [string, string] =
    variant === "danger" ? ["#ff7452", colors.danger] : [colors.gradientStart, colors.gradientEnd];

  return (
    <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.button, isDisabled && { opacity: 0.6 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{title}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  outlineText: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
