import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";

export function BrandHeader() {
  return (
    <View style={styles.wrap}>
      <Image source={require("../../assets/brand-logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.name} numberOfLines={1}>
        AttendStack
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  name: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    maxWidth: 190,
  },
});
