import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fonts, radii, softTone } from "../theme";

type FeatherName = React.ComponentProps<typeof Feather>["name"];
type Tone = Parameters<typeof softTone>[0];

export function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  sub,
  onPress,
}: {
  label: string;
  value: string | number;
  icon: FeatherName;
  tone?: Tone;
  sub?: string;
  onPress?: () => void;
}) {
  const t = softTone(tone);
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: "rgba(255,255,255,0.7)" }]}>
          <Feather name={icon} size={15} color={t.text} />
        </View>
        {onPress ? <Feather name="chevron-right" size={14} color={t.text} /> : null}
      </View>
      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 14,
    minWidth: 150,
    minHeight: 96,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 24,
    fontFamily: fonts.bold,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 4,
    flexWrap: "wrap",
  },
  sub: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontFamily: fonts.regular,
  },
});
