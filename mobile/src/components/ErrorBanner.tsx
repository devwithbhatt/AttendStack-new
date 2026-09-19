import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fonts, radii } from "../theme";

export function ErrorBanner({ message, style }: { message: string; style?: ViewStyle }) {
  if (!message) return null;
  return (
    <View style={[styles.box, style]}>
      <Feather name="alert-circle" size={16} color={colors.dangerSoftText} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.dangerSoftBg,
    borderWidth: 1,
    borderColor: colors.dangerSoftBorder,
    borderRadius: radii.md,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  text: {
    color: colors.dangerSoftText,
    fontSize: 13,
    fontFamily: fonts.medium,
    flex: 1,
  },
});
