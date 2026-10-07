import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../../theme";
import { Badge } from "../../../components/Badge";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { ActionSheet, type ActionSheetOption } from "../../../components/ActionSheet";
import { Fab, confirmAction, formStyles } from "../../../components/Form";
import { hasModulePermission, type RoleDetail } from "../../../types";
import type { RootStackParamList } from "../../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Roles & Permissions — the web Settings "Roles" tab. */
export default function RolesScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "subadmins", "edit");
  const canDelete = hasModulePermission(user, "subadmins", "delete");
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [selected, setSelected] = useState<RoleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRoles(await fetchAll<RoleDetail>("/roles/"));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const remove = (r: RoleDetail) =>
    confirmAction("Delete role?", `"${r.name}" will be removed.`, "Delete", async () => {
      try {
        await api.delete(`/roles/${r.id}/`);
        await load();
      } catch (err) {
        Alert.alert("Could not delete", extractErrorMessage(err));
      }
    });

  const options = (r: RoleDetail): ActionSheetOption[] => [
    { key: "members", label: "Assign people", icon: "users", onPress: () => navigation.navigate("RoleMembers", { role: r }) },
    ...(!r.is_system && canEdit ? [{ key: "edit", label: "Edit permissions", icon: "sliders" as const, onPress: () => navigation.navigate("RoleForm", { role: r }) }] : []),
    ...(!r.is_system && canDelete ? [{ key: "delete", label: "Delete role", icon: "trash-2" as const, destructive: true, onPress: () => remove(r) }] : []),
  ];

  const summary = (r: RoleDetail) => {
    if (r.is_admin) return "Full access to every module";
    const on = Object.entries(r.permissions || {}).filter(([, f]) => f.view).length;
    return on ? `${on} module${on === 1 ? "" : "s"}` : "No module access";
  };

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
        data={roles}
        keyExtractor={(r) => r.id}
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
        ListHeaderComponent={<Text style={styles.intro}>A role is a reusable set of permissions. Changing a role instantly changes what everyone with it can do.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <View style={styles.rowTop}>
              <Feather name="shield" size={16} color={item.is_admin ? colors.primary : colors.muted} />
              <Text style={styles.name}>{item.name}</Text>
              {item.is_system ? <Badge label="Built-in" tone="primary" /> : null}
            </View>
            {item.description ? <Text style={formStyles.rowMeta}>{item.description}</Text> : null}
            <Text style={styles.meta}>
              {summary(item)} · {item.employee_count ?? 0} {item.employee_count === 1 ? "person" : "people"}
            </Text>
          </TouchableOpacity>
        )}
      />
      {canEdit ? <Fab onPress={() => navigation.navigate("RoleForm", {})} /> : null}
      <ActionSheet visible={!!selected} title={selected?.name} options={selected ? options(selected) : []} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginBottom: 12, lineHeight: 17 },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, marginBottom: 10, ...shadow.card },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.medium, color: colors.primaryDark, marginTop: 6 },
});
