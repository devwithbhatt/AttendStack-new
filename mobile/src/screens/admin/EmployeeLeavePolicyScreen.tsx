import React, { useCallback, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { StatusBadge } from "../../components/Badge";
import { PrimaryButton } from "../../components/PrimaryButton";
import { FormSection, TextField, formStyles, formatDisplayDate } from "../../components/Form";
import { hasModulePermission, type LeavePolicy } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "EmployeeLeavePolicy">;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function EmployeeLeavePolicyScreen() {
  const navigation = useNavigation();
  const { employeeId, name } = useRoute<Route>().params;
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "employees", "edit");
  const [policy, setPolicy] = useState<LeavePolicy | null>(null);
  const [casual, setCasual] = useState("");
  const [sick, setSick] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  const apply = (data: LeavePolicy) => {
    setPolicy(data);
    setCasual(data.casual_leave_days_override === null ? "" : String(data.casual_leave_days_override));
    setSick(data.sick_leave_days_override === null ? "" : String(data.sick_leave_days_override));
  };

  useFocusEffect(
    useCallback(() => {
      api
        .get<LeavePolicy>(`/employees/${employeeId}/leave-policy/`)
        .then((res) => apply(res.data))
        .catch((err) => setError(extractErrorMessage(err)))
        .finally(() => setLoading(false));
    }, [employeeId])
  );

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const { data } = await api.patch<LeavePolicy>(`/employees/${employeeId}/leave-policy/`, {
        casual_leave_days_override: casual.trim() === "" ? null : Number(casual),
        sick_leave_days_override: sick.trim() === "" ? null : Number(sick),
      });
      apply(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the leave allowance."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      {policy ? (
        <>
          <FormSection title={`Leave Balance ${policy.year}`}>
            {policy.is_prorated ? (
              <Text style={styles.note}>Joined {formatDisplayDate(policy.joining_date)} — allowance is pro-rated over {policy.eligible_months} months.</Text>
            ) : null}
            <View style={[styles.balanceRow, styles.balanceHead]}>
              <Text style={[styles.cellType, styles.headText]}>Type</Text>
              <Text style={[styles.cell, styles.headText]}>Allowed</Text>
              <Text style={[styles.cell, styles.headText]}>Used</Text>
              <Text style={[styles.cell, styles.headText]}>Left</Text>
            </View>
            {policy.balances.map((b) => (
              <View key={b.leave_type} style={styles.balanceRow}>
                <Text style={styles.cellType}>{b.label}</Text>
                <Text style={styles.cell}>{fmt(b.entitlement)}</Text>
                <Text style={styles.cell}>{fmt(b.used)}</Text>
                <Text style={[styles.cell, { fontFamily: fonts.bold, color: colors.primaryDark }]}>{fmt(b.remaining)}</Text>
              </View>
            ))}
          </FormSection>

          {canEdit ? (
            <FormSection title="Custom Yearly Allowance">
              <Text style={styles.note}>Leave blank to use the company default.</Text>
              <TextField
                label="Casual leave days"
                value={casual}
                onChangeText={setCasual}
                keyboardType="number-pad"
                placeholder={`Company default: ${policy.company_casual_leave_days}`}
              />
              <TextField
                label="Sick leave days"
                value={sick}
                onChangeText={setSick}
                keyboardType="number-pad"
                placeholder={`Company default: ${policy.company_sick_leave_days}`}
              />
              <PrimaryButton title="Save Allowance" onPress={save} loading={saving} style={{ marginTop: 16 }} />
            </FormSection>
          ) : null}

          <FormSection title="Leave History">
            {policy.leave_requests.length === 0 ? <Text style={styles.note}>No leave requests yet.</Text> : null}
            {policy.leave_requests.map((l) => (
              <View key={l.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyType}>{l.leave_type_label}{l.is_half_day ? " · Half day" : ""}</Text>
                  <Text style={styles.historyMeta}>
                    {formatDisplayDate(l.start_date)} → {formatDisplayDate(l.end_date)}
                  </Text>
                </View>
                <StatusBadge status={l.status} label={l.status_label} />
              </View>
            ))}
          </FormSection>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 8 },
  balanceRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surface },
  balanceHead: { marginTop: 8 },
  headText: { fontFamily: fonts.semiBold, color: colors.muted, fontSize: 11 },
  cellType: { flex: 2, fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  cell: { flex: 1, textAlign: "right", fontSize: 13, fontFamily: fonts.regular, color: colors.text },
  historyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surface, gap: 10 },
  historyType: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.text },
  historyMeta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
});
