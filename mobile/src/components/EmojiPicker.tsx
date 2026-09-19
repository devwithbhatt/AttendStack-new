import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, FlatList } from "react-native";
import { colors, fonts, radii } from "../theme";

const EMOJIS = [
  "👍", "❤️", "😂", "😮", "😢", "🙏",
  "🎉", "🔥", "👏", "😀", "😍", "🤔",
  "😎", "🙌", "💯", "✅", "❌", "😅",
  "😊", "🥳", "😴", "🤝", "👀", "🚀",
];

export function EmojiPicker({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Pick an emoji</Text>
          <FlatList
            data={EMOJIS}
            keyExtractor={(item) => item}
            numColumns={6}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.emojiCell}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.emoji}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
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
  },
  emojiCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  emoji: { fontSize: 26 },
});
