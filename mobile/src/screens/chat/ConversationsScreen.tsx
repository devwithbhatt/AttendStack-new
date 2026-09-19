import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { isAdminRole, type Conversation } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

export default function ConversationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sheetVisible, setSheetVisible] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/chat/conversations/");
      setConversations(unwrapList<Conversation>(response.data));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const newChatOptions: ActionSheetOption[] = [
    { key: "direct", label: "New Direct Message", icon: "user", onPress: () => navigation.navigate("NewChat") },
    ...(admin
      ? [{ key: "group", label: "New Group", icon: "users" as const, onPress: () => navigation.navigate("NewGroup") }]
      : []),
  ];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ErrorBanner message={error} style={{ margin: 16, marginBottom: 0 }} />
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="message-circle" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No conversations yet. Start one!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate("ChatThread", { conversationId: item.id, title: item.display_name })}
          >
            <View style={styles.avatar}>
              {item.type === "GROUP" ? (
                <Feather name="users" size={18} color="#fff" />
              ) : (
                <Text style={styles.avatarText}>{(item.display_name?.[0] || "?").toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name} numberOfLines={1}>{item.display_name}</Text>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.last_message?.content || "No messages yet"}
              </Text>
            </View>
            {item.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread_count}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setSheetVisible(true)}>
        <Feather name="edit" size={20} color="#fff" />
      </TouchableOpacity>

      <ActionSheet visible={sheetVisible} title="Start a conversation" options={newChatOptions} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: fonts.bold },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  lastMessage: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: { color: "#fff", fontSize: 11, fontFamily: fonts.bold },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
});
