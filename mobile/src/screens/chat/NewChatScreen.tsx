import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { colors, fonts, radii, shadow } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import type { ChatUserSummary } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

export default function NewChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [users, setUsers] = useState<ChatUserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/chat/users/")
      .then((res) => setUsers(unwrapList<ChatUserSummary>(res.data)))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const startChat = async (targetUserId: string, name: string) => {
    setStartingId(targetUserId);
    setError("");
    try {
      const response = await api.post("/chat/conversations/direct/", { target_user_id: targetUserId });
      navigation.replace("ChatThread", { conversationId: response.data.id, title: name });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not start this conversation."));
    } finally {
      setStartingId(null);
    }
  };

  const filtered = users.filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase()));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.muted} />
        <TextInput
          style={styles.search}
          placeholder="Search teammates"
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <ErrorBanner message={error} style={{ marginHorizontal: 16, marginTop: 12 }} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No teammates found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => startChat(item.id, item.name)} disabled={startingId === item.id}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(item.name?.[0] || "?").toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.designation || item.role}</Text>
            </View>
            {startingId === item.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="chevron-right" size={18} color={colors.muted} />
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: fonts.regular, color: colors.text },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: fonts.bold },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
});
