import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TextInput } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { Card } from "../components/Card";
import { hasModulePermission, type EmployeeIncrement, type PayrollRecord } from "../types";

function formatCurrency(value: string | number) {
  const num = Number(value || 0);
  return `₹${num.toLocaleString("en-IN")}`;
}

export default function PayrollScreen() {
  const { user } = useAuth();
  const admin = hasModulePermission(user, "payroll", "view");
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [increment, setIncrement] = useState<EmployeeIncrement | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/payroll/");
      setRecords(unwrapList<PayrollRecord>(response.data));
      if (!admin) {
        try {
          const incRes = await api.get<EmployeeIncrement>("/payroll/increments/my-increment/");
          setIncrement(incRes.data);
        } catch {
          setIncrement(null);
        }
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [admin]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const filtered = admin
    ? records.filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return r.employee_details?.full_name?.toLowerCase().includes(q);
      })
    : records;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {admin && (
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.search}
            placeholder="Search by employee name"
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      )}

      <ErrorBanner message={error} style={{ marginHorizontal: 16, marginTop: 12 }} />

      <FlatList
        data={filtered}
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
        ListHeaderComponent={
          !admin && increment ? (
            <Card style={{ marginBottom: 14 }}>
              <View style={styles.incRow}>
                <Feather name="trending-up" size={18} color={colors.primaryDark} />
                <Text style={styles.incTitle}>Salary Growth</Text>
              </View>
              <Text style={styles.incValue}>{formatCurrency(increment.annual_salary)} / year</Text>
              {increment.pending_increment ? (
                <Text style={styles.incNote}>
                  Next revision: {formatCurrency(increment.pending_increment.new_salary)} on{" "}
                  {increment.pending_increment.due_date} ({increment.pending_increment.status_display})
                </Text>
              ) : increment.next_increment_date ? (
                <Text style={styles.incNote}>Next review around {increment.next_increment_date}</Text>
              ) : null}
            </Card>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="dollar-sign" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No payroll records yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              {admin && <Text style={styles.name}>{item.employee_details?.full_name}</Text>}
              <Text style={styles.month}>{item.month_name} {item.year}</Text>
              <Text style={styles.salary}>{formatCurrency(item.net_salary)}</Text>
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
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  month: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
  salary: { fontSize: 18, fontFamily: fonts.bold, color: colors.text, marginTop: 4 },
  incRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  incTitle: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.text },
  incValue: { fontSize: 22, fontFamily: fonts.bold, color: colors.primaryDark, marginTop: 8 },
  incNote: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
});
