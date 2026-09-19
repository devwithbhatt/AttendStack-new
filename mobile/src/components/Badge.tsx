import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { fonts, radii, softTone, toneForStatus } from "../theme";

export function Badge({ label, tone = "muted" }: { label: string; tone?: Parameters<typeof softTone>[0] }) {
  const t = softTone(tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge label={(label || status).replace(/_/g, " ")} tone={toneForStatus(status)} />;
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    textTransform: "capitalize",
  },
});
