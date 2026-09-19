import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fonts } from "../theme";
import { IconChip } from "./IconChip";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export function SectionHeader({
  icon,
  title,
  subtitle,
  colorsPair,
  right,
}: {
  icon: FeatherName;
  title: string;
  subtitle?: string;
  colorsPair?: [string, string];
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <IconChip name={icon} size={44} colorsPair={colorsPair} />
        <View style={{ marginLeft: 12, flexShrink: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 2,
  },
});
