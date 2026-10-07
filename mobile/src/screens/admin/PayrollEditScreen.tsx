import React, { useLayoutEffect, useState } from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../api/client";
import { colors, fonts } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, FormSection, TextField, formStyles, formatMoney } from "../../components/Form";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "PayrollEdit">;

const STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "PAID", label: "Paid" },
];

/** Adjust one payslip. Changing a PAID payslip needs an audit remark, which
 * the backend records in the modification history. */
export default function PayrollEditScreen() {
  const navigation = useNavigation();
  const { payroll } = useRoute<Route>().params;
  const [basic, setBasic] = useState(String(Number(payroll.basic_salary)));
  const [allowances, setAllowances] = useState(String(Number(payroll.allowances)));
  const [deductions, setDeductions] = useState(String(Number(payroll.deductions)));
  const [status, setStatus] = useState(payroll.status === "PAID" ? "PAID" : "PENDING");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: `${payroll.employee_details.full_name}` });
  }, [navigation, payroll]);

  const n = (v: string) => Number(v || 0);
  const net = n(basic) + n(allowances) - n(deductions);
  const amountsChanged =
    n(basic) !== Number(payroll.basic_salary) || n(allowances) !== Number(payroll.allowances) || n(deductions) !== Number(payroll.deductions);
  const needsReason = payroll.status === "PAID" && amountsChanged;

  const save = async () => {
    setError("");
    if ([basic, allowances, deductions].some((v) => v.trim() === "" || Number.isNaN(Number(v)) || Number(v) < 0)) {
      setError("Amounts must be zero or more.");
      return;
    }
    if (needsReason && reason.trim().length < 5) {
      setError("This salary is already paid. Add a reason of at least 5 characters for the change.");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/payroll/${payroll.id}/`, {
        employee_id: payroll.employee_details.id,
        month: payroll.month,
        year: payroll.year,
        basic_salary: n(basic),
        allowances: n(allowances),
        deductions: n(deductions),
        status,
        modification_reason: reason.trim(),
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update payroll."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.period}>
        {payroll.month_name} {payroll.year} · {payroll.employee_details.employee_id}
      </Text>
      <FormSection title="Amounts (₹)">
        <TextField label="Basic salary" value={basic} onChangeText={setBasic} keyboardType="decimal-pad" />
        <TextField label="Allowances" value={allowances} onChangeText={setAllowances} keyboardType="decimal-pad" />
        <TextField label="Deductions" value={deductions} onChangeText={setDeductions} keyboardType="decimal-pad" />
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net salary</Text>
          <Text style={styles.netValue}>{formatMoney(net)}</Text>
        </View>
      </FormSection>
      <FormSection title="Payment">
        <ChipSelect options={STATUSES} value={status} onChange={setStatus} />
        {needsReason ? (
          <TextField
            label="Reason for changing a paid salary"
            required
            value={reason}
            onChangeText={setReason}
            multiline
            hint="Recorded in the payroll audit history."
          />
        ) : null}
      </FormSection>
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title="Save Payroll" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  period: { fontSize: 13, fontFamily: fonts.medium, color: colors.muted, marginBottom: 12 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surface },
  netLabel: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  netValue: { fontSize: 18, fontFamily: fonts.bold, color: colors.primaryDark },
});
