import React, { useLayoutEffect, useState } from "react";
import { ScrollView, Text, StyleSheet } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../api/client";
import { colors, fonts } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, DateField, FormSection, formStyles, todayISO } from "../../components/Form";
import { EMPLOYEE_STATUSES } from "../../constants";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "EmployeeStatus">;

// Statuses that only make sense for a limited period, so they offer an end
// date and what to switch to afterwards (same as the web dialog).
const TEMPORARY = new Set(["PROVISION", "ON_LEAVE", "NOTICE_PERIOD"]);

export default function EmployeeStatusScreen() {
  const navigation = useNavigation();
  const { employeeId, name } = useRoute<Route>().params;
  const [status, setStatus] = useState("ACTIVE");
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [thenStatus, setThenStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Change Status" });
  }, [navigation]);

  const temporary = TEMPORARY.has(status);

  const save = async () => {
    setError("");
    if (temporary && thenStatus && !endDate) {
      setError("Choose an end date for the automatic status change.");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/employees/${employeeId}/status/`, {
        status,
        effective_date: effectiveDate,
        end_date: temporary && endDate ? endDate : null,
        auto_transition_status: temporary && endDate && thenStatus ? thenStatus : null,
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not change the status."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content}>
      <Text style={styles.intro}>Update the employment status of {name}. Inactive and Terminated employees lose app access and can't mark attendance.</Text>
      <FormSection title="New Status">
        <ChipSelect options={EMPLOYEE_STATUSES} value={status} onChange={setStatus} />
        <DateField label="Effective from" required value={effectiveDate} onChange={setEffectiveDate} />
        {temporary ? (
          <>
            <DateField label="Ends on" value={endDate} onChange={setEndDate} clearable hint="Optional. Leave blank if open-ended." />
            {endDate ? (
              <ChipSelect
                label="Then switch to"
                options={[{ value: "", label: "Keep as is" }, ...EMPLOYEE_STATUSES.filter((s) => s.value !== status)]}
                value={thenStatus}
                onChange={setThenStatus}
              />
            ) : null}
          </>
        ) : null}
      </FormSection>
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title="Update Status" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginBottom: 16, lineHeight: 19 },
});
