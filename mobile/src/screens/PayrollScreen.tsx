import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../api/client";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { Card } from "../components/Card";
import { formatDisplayDate, formatMoney } from "../components/Form";
import type { EmployeeIncrement, PayrollRecord } from "../types";

/** The signed-in person's own payslips and salary growth. Managing everyone's
 * payroll lives in the admin Payroll screen. */
export default function PayrollScreen() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [increment, setIncrement] = useState<EmployeeIncrement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const rows = await fetchAll<PayrollRecord>("/payroll/", { mine: true });
      rows.sort((a, b) => b.year - a.year || b.month - a.month);
      setRecords(rows);
      const incRes = await api.get<EmployeeIncrement>("/payroll/increments/my-increment/").catch(() => null);
      setIncrement(incRes?.data ?? null);
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
      <ErrorBanner message={error} style={{ marginHorizontal: 16, marginTop: 12 }} />
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
        ListHeaderComponent={
          increment ? (
            <Card style={{ marginBottom: 14 }}>
              <View style={styles.incRow}>
                <Feather name="trending-up" size={18} color={colors.primaryDark} />
                <Text style={styles.incTitle}>Salary Growth</Text>
              </View>
              <Text style={styles.incValue}>{formatMoney(increment.annual_salary)} / year</Text>
              {increment.pending_increment ? (
                <Text style={styles.incNote}>
                  Next revision: {formatMoney(increment.pending_increment.new_salary)} on {formatDisplayDate(increment.pending_increment.due_date)} (
                  {increment.pending_increment.status_display})
                </Text>
              ) : increment.next_increment_date ? (
                <Text style={styles.incNote}>Next review around {formatDisplayDate(increment.next_increment_date)}</Text>
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
              <Text style={styles.month}>
                {item.month_name} {item.year}
              </Text>
              <Text style={styles.salary}>{formatMoney(item.payable_salary ?? item.net_salary)}</Text>
              {item.paid_on ? <Text style={styles.month}>Paid on {formatDisplayDate(item.paid_on)}</Text> : null}
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
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  month: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
  salary: { fontSize: 18, fontFamily: fonts.bold, color: colors.text, marginTop: 4 },
  incRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  incTitle: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.text },
  incValue: { fontSize: 22, fontFamily: fonts.bold, color: colors.primaryDark, marginTop: 8 },
  incNote: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
});
