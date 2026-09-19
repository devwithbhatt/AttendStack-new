import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync } from "expo-audio";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { EmojiPicker } from "../../components/EmojiPicker";
import { AttachmentView } from "./AttachmentView";
import { pickFromGallery, takePhoto, pickDocument, type PickedFile } from "./attachments";
import type { ChatMessage } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "ChatThread">;

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChatThreadScreen() {
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { conversationId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError("");
    try {
      const response = await api.get(`/chat/conversations/${conversationId}/messages/`);
      const list = unwrapList<ChatMessage>(response.data);
      setMessages([...list].reverse());
    } catch (err) {
      if (!silent) setError(extractErrorMessage(err));
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
      pollRef.current = setInterval(() => load(true), 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load])
  );

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    setText("");
    try {
      await api.post(`/chat/conversations/${conversationId}/send-message/`, { content });
      await load(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send message."));
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: PickedFile) => {
    setSending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("content", "");
      formData.append("files", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      await api.post(`/chat/conversations/${conversationId}/send-message/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send attachment."));
    } finally {
      setSending(false);
    }
  };

  const attachOptions: ActionSheetOption[] = [
    { key: "camera", label: "Take Photo / Video", icon: "camera", onPress: async () => { const f = await takePhoto(); if (f) sendFile(f); } },
    { key: "gallery", label: "Photos & Videos", icon: "image", onPress: async () => { const f = await pickFromGallery(); if (f) sendFile(f); } },
    { key: "document", label: "Document / File", icon: "file-text", onPress: async () => { const f = await pickDocument(); if (f) sendFile(f); } },
  ];

  const startRecording = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError("Microphone permission is required to record voice messages.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const cancelRecording = async () => {
    await recorder.stop();
  };

  const stopAndSendRecording = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (uri) {
      await sendFile({ uri, name: `voice-${Date.now()}.m4a`, type: "audio/m4a" });
    }
  };

  const react = async (messageId: string, emoji: string) => {
    setReactingTo(null);
    try {
      await api.post(`/chat/conversations/${conversationId}/react/`, { message_id: messageId, emoji });
      await load(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not react to this message."));
    }
  };

  const insertEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ErrorBanner message={error} style={{ margin: 16, marginBottom: 0 }} />
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const mine = item.sender.id === user?.id;
          return (
            <View style={[styles.bubbleRow, mine && { justifyContent: "flex-end" }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onLongPress={() => setReactingTo(item.id)}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                {!mine && <Text style={styles.senderName}>{item.sender.name}</Text>}

                {item.attachments?.map((att) => (
                  <View key={att.id} style={{ marginBottom: item.content ? 8 : 0 }}>
                    <AttachmentView attachment={att} mine={mine} />
                  </View>
                ))}

                {item.content ? <Text style={[styles.bubbleText, mine && { color: "#fff" }]}>{item.content}</Text> : null}

                <Text style={[styles.time, mine && { color: "rgba(255,255,255,0.75)" }]}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>

                {item.reactions?.length > 0 && (
                  <View style={styles.reactionsRow}>
                    {item.reactions.map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        style={[styles.reactionChip, r.reacted_by_me && styles.reactionChipActive]}
                        onPress={() => react(item.id, r.emoji)}
                      >
                        <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                        {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {reactingTo === item.id && (
                  <View style={styles.quickReactRow}>
                    {QUICK_REACTIONS.map((emoji) => (
                      <TouchableOpacity key={emoji} onPress={() => react(item.id, emoji)}>
                        <Text style={styles.quickReactEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>Say hello 👋</Text>
          </View>
        }
      />

      {recorderState.isRecording ? (
        <View style={styles.recordingBar}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording · {formatDuration(recorderState.durationMillis)}</Text>
          <TouchableOpacity onPress={cancelRecording} style={styles.recordingCancel}>
            <Feather name="x" size={18} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity onPress={stopAndSendRecording} style={styles.recordingSend}>
            <Feather name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setAttachSheetVisible(true)}>
            <Feather name="paperclip" size={20} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setEmojiPickerVisible(true)}>
            <Feather name="smile" size={20} color={colors.muted} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.placeholder}
            multiline
          />
          {text.trim() ? (
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
              <Feather name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sendBtn} onPress={startRecording} disabled={sending}>
              <Feather name="mic" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ActionSheet
        visible={attachSheetVisible}
        title="Share"
        options={attachOptions}
        onClose={() => setAttachSheetVisible(false)}
      />
      <EmojiPicker visible={emojiPickerVisible} onSelect={insertEmoji} onClose={() => setEmojiPickerVisible(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  bubbleRow: { flexDirection: "row", marginBottom: 10 },
  bubble: { maxWidth: "78%", borderRadius: radii.lg, padding: 12 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.primaryDark, marginBottom: 3 },
  bubbleText: { fontSize: 14, fontFamily: fonts.regular, color: colors.text },
  time: { fontSize: 10, fontFamily: fonts.regular, color: colors.muted, marginTop: 4, alignSelf: "flex-end" },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reactionChipActive: { borderWidth: 1.5, borderColor: colors.primary },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, fontFamily: fonts.semiBold, color: colors.text },
  quickReactRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  quickReactEmoji: { fontSize: 20 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  iconBtn: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recordingText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  recordingCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.dangerSoftBg,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
});
