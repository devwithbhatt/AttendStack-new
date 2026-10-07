import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii, shadow } from "../theme";
import { Badge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { ActionSheet } from "../components/ActionSheet";
import { Fab, confirmAction, formatDisplayDate, todayISO } from "../components/Form";
import { hasModulePermission, type Holiday } from "../types";
import type { RootStackParamList } from "../navigation/types";

export default function HolidaysScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const canManage = hasModulePermission(user, "holidays", "edit");
  const canDelete = hasModulePermission(user, "holidays", "delete");
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selected, setSelected] = useState<Holiday | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const rows = await fetchAll<Holiday>("/holidays/", { year });
      rows.sort((a, b) => a.date.localeCompare(b.date));
      setHolidays(rows);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [year]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const remove = (h: Holiday) =>
    confirmAction("Delete holiday?", `"${h.name}" on ${formatDisplayDate(h.date)} will be removed and attendance for that day recalculated.`, "Delete", async () => {
      try {
        await api.delete(`/holidays/${h.id}/`);
        await load();
      } catch (err) {
        Alert.alert("Could not delete", extractErrorMessage(err));
      }
    });

  const today = todayISO();

  return (
    <View style={styles.container}>
      <View style={styles.yearRow}>
        <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={colors.primaryDark} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{year}</Text>
        <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={10}>
          <Feather name="chevron-right" size={22} color={colors.primaryDark} />
        </TouchableOpacity>
      </View>
      <ErrorBanner message={error} style={{ marginHorizontal: 16 }} />
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={holidays}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: canManage ? 100 : 16 }}
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
              <Feather name="gift" size={28} color={colors.muted} />
              <Text style={styles.emptyText}>No holidays for {year}.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, item.date < today && { opacity: 0.6 }]}
              disabled={!canManage}
              onPress={() => setSelected(item)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrap}>
                <Feather name="gift" size={18} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.date}>
                  {formatDisplayDate(item.date)} · {item.day}
                </Text>
              </View>
              <Badge label={item.type} tone="info" />
            </TouchableOpacity>
          )}
        />
      )}
      {canManage ? <Fab onPress={() => navigation.navigate("AddHoliday")} /> : null}
      <ActionSheet
        visible={!!selected}
        title={selected?.name}
        onClose={() => setSelected(null)}
        options={
          selected
            ? [
                { key: "edit", label: "Edit holiday", icon: "edit-2", onPress: () => navigation.navigate("AddHoliday", { holiday: selected }) },
                ...(canDelete ? [{ key: "delete", label: "Delete holiday", icon: "trash-2" as const, destructive: true, onPress: () => remove(selected) }] : []),
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, paddingVertical: 12 },
  yearText: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
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
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  date: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
});
