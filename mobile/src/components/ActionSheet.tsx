import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, fonts, radii } from "../theme";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export interface ActionSheetOption {
  key: string;
  label: string;
  icon: FeatherName;
  destructive?: boolean;
  onPress: () => void;
}

export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={styles.row}
              onPress={() => {
                onClose();
                opt.onPress();
              }}
            >
              <View style={[styles.iconWrap, opt.destructive && { backgroundColor: colors.dangerSoftBg }]}>
                <Feather name={opt.icon} size={18} color={opt.destructive ? colors.danger : colors.primaryDark} />
              </View>
              <Text style={[styles.label, opt.destructive && { color: colors.danger }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  label: { fontSize: 15, fontFamily: fonts.medium, color: colors.text },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
  cancelText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
});
