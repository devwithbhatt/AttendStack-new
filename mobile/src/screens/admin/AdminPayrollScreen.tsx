import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SearchBar, confirmAction, formStyles, formatMoney } from "../../components/Form";
import { MONTHS } from "../../constants";
import { hasModulePermission, type PayrollRecord } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Everyone's payroll for a month: generate, review, edit, mark paid. */
export default function AdminPayrollScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "payroll", "edit");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await fetchAll<PayrollRecord>("/payroll/", { month, year });
      data.sort((a, b) => a.employee_details.full_name.localeCompare(b.employee_details.full_name));
      setRows(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [month, year]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  useEffect(() => setSearch(""), [month, year]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  };

  const generate = () =>
    confirmAction(
      `Generate payroll for ${MONTHS[month - 1]} ${year}?`,
      "Salaries are calculated from attendance for every eligible employee. Existing rows are recalculated; paid rows keep their paid status.",
      "Generate",
      async () => {
        setGenerating(true);
        try {
          const { data } = await api.post("/payroll/generate/", { month, year });
          Alert.alert("Payroll generated", `${data.generated} created · ${data.updated} recalculated · ${data.skipped} skipped`);
          await load();
        } catch (err) {
          Alert.alert("Could not generate payroll", extractErrorMessage(err));
        } finally {
          setGenerating(false);
        }
      },
      false
    );

  const markPaid = (p: PayrollRecord) =>
    confirmAction("Mark as paid?", `${p.employee_details.full_name} — ${formatMoney(p.net_salary)} for ${p.month_name} ${p.year}.`, "Mark Paid", async () => {
      setPayingId(p.id);
      try {
        await api.put(`/payroll/${p.id}/`, {
          employee_id: p.employee_details.id,
          month: p.month,
          year: p.year,
          basic_salary: Number(p.basic_salary),
          allowances: Number(p.allowances),
          deductions: Number(p.deductions),
          status: "PAID",
        });
        await load();
      } catch (err) {
        Alert.alert("Could not mark as paid", extractErrorMessage(err));
      } finally {
        setPayingId(null);
      }
    }, false);

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || r.employee_details.full_name.toLowerCase().includes(q) || r.employee_details.employee_id?.toLowerCase().includes(q));
  const total = rows.reduce((sum, r) => sum + Number(r.net_salary || 0), 0);
  const paid = rows.filter((r) => r.status === "PAID");
  const paidTotal = paid.reduce((sum, r) => sum + Number(r.net_salary || 0), 0);

  return (
    <View style={formStyles.screen}>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
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
          <View>
            <View style={styles.monthRow}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={10}>
                <Feather name="chevron-left" size={22} color={colors.primaryDark} />
              </TouchableOpacity>
              <Text style={styles.monthText}>
                {MONTHS[month - 1]} {year}
              </Text>
              <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={10}>
                <Feather name="chevron-right" size={22} color={colors.primaryDark} />
              </TouchableOpacity>
            </View>
            <View style={styles.summary}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Total payout</Text>
                <Text style={styles.summaryValue}>{formatMoney(total)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Paid</Text>
                <Text style={styles.summaryValue}>
                  {paid.length}/{rows.length}
                </Text>
                <Text style={styles.summarySub}>{formatMoney(paidTotal)}</Text>
              </View>
            </View>
            {canEdit ? (
              <PrimaryButton title={rows.length ? "Recalculate Payroll" : "Generate Payroll"} onPress={generate} loading={generating} style={{ marginBottom: 12 }} />
            ) : null}
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search employee" style={{ marginBottom: 10 }} />
            <ErrorBanner message={error} style={{ marginBottom: 10 }} />
            {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={formStyles.empty}>
              <Feather name="dollar-sign" size={28} color={colors.muted} />
              <Text style={formStyles.emptyText}>
                No payroll for {MONTHS[month - 1]} {year} yet.{canEdit ? "\nTap Generate Payroll to create it." : ""}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            disabled={!canEdit}
            onPress={() => navigation.navigate("PayrollEdit", { payroll: item })}
          >
            <View style={{ flex: 1 }}>
              <Text style={formStyles.rowTitle}>{item.employee_details.full_name}</Text>
              <Text style={formStyles.rowMeta}>
                Basic {formatMoney(item.basic_salary)} · Allow. {formatMoney(item.allowances)} · Ded. {formatMoney(item.deductions)}
              </Text>
              <Text style={styles.net}>{formatMoney(item.net_salary)}</Text>
              {item.is_modified_after_payment ? <Text style={styles.modified}>Edited after payment</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              <StatusBadge status={item.status} />
              {canEdit && item.status !== "PAID" ? (
                <TouchableOpacity style={styles.payBtn} onPress={() => markPaid(item)} disabled={payingId === item.id}>
                  {payingId === item.id ? <ActivityIndicator size="small" color={colors.primaryDark} /> : <Text style={styles.payText}>Mark Paid</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 12 },
  monthText: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  summary: { flexDirection: "row", gap: 12, marginBottom: 12 },
  summaryCell: { flex: 1, backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, ...shadow.card },
  summaryLabel: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted },
  summaryValue: { fontSize: 18, fontFamily: fonts.bold, color: colors.text, marginTop: 4 },
  summarySub: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  row: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, marginBottom: 10, gap: 10, ...shadow.card },
  net: { fontSize: 17, fontFamily: fonts.bold, color: colors.text, marginTop: 6 },
  modified: { fontSize: 11, fontFamily: fonts.medium, color: colors.warningSoftText, marginTop: 4 },
  payBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6, minWidth: 84, alignItems: "center" },
  payText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.primaryDark },
});
