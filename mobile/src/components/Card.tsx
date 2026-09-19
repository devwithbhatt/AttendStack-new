import React from "react";
import { View, ViewStyle } from "react-native";
import { colors, radii, shadow } from "../theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          padding: 16,
          ...shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
