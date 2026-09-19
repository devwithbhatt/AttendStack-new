import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../api/client";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import type { AttendanceRecord } from "../types";

export default function AttendanceHistoryScreen() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/attendance/me/");
      setRecords(unwrapList<AttendanceRecord>(response.data));
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
        data={records}
        keyExtractor={(item) => item.id}
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
            <Feather name="calendar" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No attendance records yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Feather name="calendar" size={18} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.date}>{item.date}</Text>
              <Text style={styles.times}>
                {item.check_in ? new Date(item.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--"}
                {"  →  "}
                {item.check_out ? new Date(item.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--"}
              </Text>
            </View>
            <StatusBadge status={item.status} />
          </View>
        )}
      />
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
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  date: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  times: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
});
