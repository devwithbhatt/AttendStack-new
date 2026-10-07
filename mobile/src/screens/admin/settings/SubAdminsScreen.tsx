import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../../api/client";
import { colors, fonts, radii, shadow } from "../../../theme";
import { Badge } from "../../../components/Badge";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ActionSheet, type ActionSheetOption } from "../../../components/ActionSheet";
import { Fab, PromptModal, confirmAction, formStyles } from "../../../components/Form";
import type { SubAdmin } from "../../../types";
import type { RootStackParamList } from "../../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Sub-admin accounts with their own permission set (web "Sub-Admins"). */
export default function SubAdminsScreen() {
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<SubAdmin[]>([]);
  const [selected, setSelected] = useState<SubAdmin | null>(null);
  const [resetting, setResetting] = useState<SubAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await fetchAll<SubAdmin>("/accounts/sub-admins/"));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const resetPassword = async (s: SubAdmin, password: string) => {
    try {
      const { data } = await api.post(`/accounts/sub-admins/${s.id}/reset-password/`, password ? { password } : {});
      const temp = data?.temp_password || data?.temporary_password || data?.password;
      Alert.alert("Password reset", temp ? `Login: ${s.email}\nPassword: ${temp}\n\nShare it with ${s.full_name || s.email} securely.` : data?.detail || "Done.");
    } catch (err) {
      Alert.alert("Could not reset password", extractErrorMessage(err));
    }
  };

  const toggleActive = async (s: SubAdmin) => {
    try {
      await api.patch(`/accounts/sub-admins/${s.id}/`, { is_active: !s.is_active });
      await load();
    } catch (err) {
      Alert.alert("Could not update", extractErrorMessage(err));
    }
  };

  const remove = (s: SubAdmin) =>
    confirmAction("Delete sub-admin?", `${s.full_name || s.email}'s account will be permanently deleted.`, "Delete", async () => {
      try {
        await api.delete(`/accounts/sub-admins/${s.id}/`);
        await load();
      } catch (err) {
        Alert.alert("Could not delete", extractErrorMessage(err));
      }
    });

  const options = (s: SubAdmin): ActionSheetOption[] => [
    { key: "edit", label: "Edit details & permissions", icon: "edit-2", onPress: () => navigation.navigate("SubAdminForm", { subAdmin: s }) },
    { key: "reset", label: "Reset password", icon: "key", onPress: () => setResetting(s) },
    { key: "active", label: s.is_active ? "Deactivate" : "Reactivate", icon: s.is_active ? "pause-circle" : "play-circle", onPress: () => toggleActive(s) },
    { key: "delete", label: "Delete", icon: "trash-2", destructive: true, onPress: () => remove(s) },
  ];

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={formStyles.screen}>
      <ErrorBanner message={error} style={{ margin: 16, marginBottom: 0 }} />
      <FlatList
        data={rows}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
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
          <View style={formStyles.empty}>
            <Feather name="user-check" size={28} color={colors.muted} />
            <Text style={formStyles.emptyText}>No sub-admins yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{item.full_name || item.email}</Text>
              <Badge label={item.is_active ? "Active" : "Inactive"} tone={item.is_active ? "success" : "muted"} />
            </View>
            <Text style={formStyles.rowMeta}>{item.email}</Text>
            <Text style={styles.title}>{item.custom_role_title}</Text>
          </TouchableOpacity>
        )}
      />
      <Fab onPress={() => navigation.navigate("SubAdminForm", {})} icon="user-plus" />
      <ActionSheet visible={!!selected} title={selected?.full_name || selected?.email} options={selected ? options(selected) : []} onClose={() => setSelected(null)} />
      <PromptModal
        visible={!!resetting}
        title="Reset password"
        message="Type a new password, or leave it blank to generate one."
        placeholder="New password (optional)"
        confirmLabel="Reset"
        onSubmit={(pw) => {
          const s = resetting;
          setResetting(null);
          if (s) resetPassword(s, pw);
        }}
        onClose={() => setResetting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, marginBottom: 10, ...shadow.card },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  title: { fontSize: 12, fontFamily: fonts.medium, color: colors.primaryDark, marginTop: 6 },
});
