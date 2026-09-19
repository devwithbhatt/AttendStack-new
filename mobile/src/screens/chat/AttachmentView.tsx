import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, fonts, radii } from "../../theme";
import type { ChatAttachment } from "../../types";

function kindOf(fileType: string | null): "image" | "video" | "audio" | "file" {
  if (!fileType) return "file";
  if (fileType.startsWith("image/")) return "image";
  if (fileType.startsWith("video/")) return "video";
  if (fileType.startsWith("audio/")) return "audio";
  return "file";
}

function formatSeconds(seconds: number) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AudioAttachment({ uri, mine }: { uri: string; mine: boolean }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return (
    <TouchableOpacity
      style={[styles.audioRow, mine ? styles.audioRowMine : styles.audioRowTheirs]}
      onPress={() => (status.playing ? player.pause() : player.play())}
      activeOpacity={0.8}
    >
      <Feather name={status.playing ? "pause-circle" : "play-circle"} size={26} color={mine ? "#fff" : colors.primaryDark} />
      <View style={styles.audioTrackWrap}>
        <View style={[styles.audioTrack, { backgroundColor: mine ? "rgba(255,255,255,0.3)" : colors.border }]}>
          <View
            style={[
              styles.audioTrackFill,
              { width: `${Math.min(progress, 1) * 100}%`, backgroundColor: mine ? "#fff" : colors.primaryDark },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.audioDuration, { color: mine ? "rgba(255,255,255,0.85)" : colors.muted }]}>
        {formatSeconds(status.duration - status.currentTime > 0 ? status.duration - status.currentTime : status.duration)}
      </Text>
    </TouchableOpacity>
  );
}

export function AttachmentView({ attachment, mine }: { attachment: ChatAttachment; mine: boolean }) {
  const url = attachment.file_url;
  if (!url) return null;
  const kind = kindOf(attachment.file_type);

  if (kind === "image") {
    return (
      <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.9}>
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  if (kind === "video") {
    return (
      <TouchableOpacity
        style={[styles.fileCard, mine ? styles.fileCardMine : styles.fileCardTheirs]}
        onPress={() => Linking.openURL(url)}
      >
        <Feather name="play-circle" size={22} color={mine ? "#fff" : colors.primaryDark} />
        <Text style={[styles.fileLabel, { color: mine ? "#fff" : colors.text }]}>Video · tap to play</Text>
      </TouchableOpacity>
    );
  }

  if (kind === "audio") {
    return <AudioAttachment uri={url} mine={mine} />;
  }

  const fileName = url.split("/").pop() || "Document";
  return (
    <TouchableOpacity
      style={[styles.fileCard, mine ? styles.fileCardMine : styles.fileCardTheirs]}
      onPress={() => Linking.openURL(url)}
    >
      <Feather name="file-text" size={20} color={mine ? "#fff" : colors.primaryDark} />
      <Text style={[styles.fileLabel, { color: mine ? "#fff" : colors.text }]} numberOfLines={1}>
        {fileName}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  image: { width: 200, height: 200, borderRadius: radii.md },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radii.md,
    minWidth: 180,
  },
  fileCardMine: { backgroundColor: "rgba(255,255,255,0.15)" },
  fileCardTheirs: { backgroundColor: colors.surface },
  fileLabel: { fontSize: 13, fontFamily: fonts.medium, flexShrink: 1 },
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: radii.md,
    minWidth: 200,
  },
  audioRowMine: { backgroundColor: "rgba(255,255,255,0.15)" },
  audioRowTheirs: { backgroundColor: colors.surface },
  audioTrackWrap: { flex: 1 },
  audioTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  audioTrackFill: { height: 4, borderRadius: 2 },
  audioDuration: { fontSize: 11, fontFamily: fonts.medium },
});
