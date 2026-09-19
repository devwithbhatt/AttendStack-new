import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../../api/client";
import { colors, fonts, radii, shadow } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import type { TodayOverviewEntry } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "AttendanceOverview">;
type FilterKey = "all" | "present" | "absent";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
];

export default function AdminAttendanceScreen() {
  const route = useRoute<Route>();
  const [filter, setFilter] = useState<FilterKey>(route.params?.filter || "all");
  const [entries, setEntries] = useState<TodayOverviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get<TodayOverviewEntry[]>("/attendance/today/");
      setEntries(response.data);
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

  const filtered = entries.filter((e) => {
    if (filter === "present") return !!e.check_in;
    if (filter === "absent") return !e.check_in;
    return true;
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{new Date().toDateString()}</Text>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ErrorBanner message={error} style={{ marginHorizontal: 16, marginTop: 12 }} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.employee_uuid}
        contentContainerStyle={{ padding: 16 }}
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
            <Feather name="users" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No employees to show.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.employee_name}</Text>
              <Text style={styles.meta}>
                {item.employee_department || "-"} · {item.employee_id}
              </Text>
              <Text style={styles.times}>
                {item.check_in ? new Date(item.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                {"  →  "}
                {item.check_out ? new Date(item.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </Text>
            </View>
            <StatusBadge status={item.status} label={item.status_label} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  heading: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.muted, paddingHorizontal: 16, paddingTop: 16 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterChipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text },
  filterChipTextActive: { color: "#fff", fontFamily: fonts.semiBold },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...shadow.card,
  },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  times: { fontSize: 12, fontFamily: fonts.medium, color: colors.text, marginTop: 4 },
});
