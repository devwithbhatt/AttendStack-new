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
import { hasModulePermission, type Shift } from "../../../types";
import type { RootStackParamList } from "../../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ShiftsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "settings", "edit");
  const canDelete = hasModulePermission(user, "settings", "delete");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setShifts(await fetchAll<Shift>("/attendance/shifts/"));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const makeDefault = async (s: Shift) => {
    try {
      await api.post(`/attendance/shifts/${s.id}/set-default/`);
      await load();
    } catch (err) {
      Alert.alert("Could not set default", extractErrorMessage(err));
    }
  };

  const remove = (s: Shift) =>
    confirmAction("Delete shift?", `"${s.name}" will be removed.${s.employee_count ? ` Its ${s.employee_count} employee(s) will fall back to the default shift.` : ""}`, "Delete", async () => {
      try {
        await api.delete(`/attendance/shifts/${s.id}/`);
        await load();
      } catch (err) {
        Alert.alert("Could not delete", extractErrorMessage(err));
      }
    });

  const options = (s: Shift): ActionSheetOption[] => [
    { key: "edit", label: "Edit shift", icon: "edit-2", onPress: () => navigation.navigate("ShiftForm", { shift: s }) },
    { key: "assign", label: "Assign employees", icon: "users", onPress: () => navigation.navigate("ShiftAssign", { shift: s }) },
    ...(!s.is_default ? [{ key: "default", label: "Make company default", icon: "star" as const, onPress: () => makeDefault(s) }] : []),
    ...(canDelete && !s.is_default ? [{ key: "delete", label: "Delete shift", icon: "trash-2" as const, destructive: true, onPress: () => remove(s) }] : []),
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
        data={shifts}
        keyExtractor={(item) => item.id}
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
        ListHeaderComponent={<Text style={styles.intro}>Employees without an assigned shift follow the company default.</Text>}
        ListEmptyComponent={
          <View style={formStyles.empty}>
            <Feather name="clock" size={28} color={colors.muted} />
            <Text style={formStyles.emptyText}>No shifts yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} disabled={!canEdit} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{item.name}</Text>
              {item.is_default ? <Badge label="Default" tone="primary" /> : null}
              {item.is_active === false ? <Badge label="Inactive" tone="muted" /> : null}
            </View>
            <Text style={styles.time}>
              {item.start_time_display || item.start_time} – {item.end_time_display || item.end_time}
            </Text>
            <Text style={formStyles.rowMeta}>
              {item.code ? `${item.code} · ` : ""}Late after {item.late_grace_minutes ?? 0} min · {item.employee_count ?? 0} employee{item.employee_count === 1 ? "" : "s"}
            </Text>
          </TouchableOpacity>
        )}
      />
      {canEdit ? <Fab onPress={() => navigation.navigate("ShiftForm", {})} /> : null}
      <ActionSheet visible={!!selected} title={selected?.name} options={selected ? options(selected) : []} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginBottom: 12 },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, marginBottom: 10, ...shadow.card },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  time: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.primaryDark, marginTop: 6 },
});
