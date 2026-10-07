import React, { useLayoutEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../../api/client";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { ChipSelect, FormSection, SwitchField, TextField, TimeField, formStyles } from "../../../components/Form";
import type { RootStackParamList } from "../../../navigation/types";

type Route = RouteProp<RootStackParamList, "ShiftForm">;

const PENALTIES = [
  { value: "HALF_DAY", label: "Half day" },
  { value: "PRO_RATED", label: "Pro-rated hours" },
  { value: "NONE", label: "No penalty" },
];

const hhmm = (v?: string) => (v ? v.slice(0, 5) : "");

export default function ShiftFormScreen() {
  const navigation = useNavigation();
  const shift = useRoute<Route>().params?.shift;
  const [name, setName] = useState(shift?.name || "");
  const [code, setCode] = useState(shift?.code || "");
  const [start, setStart] = useState(hhmm(shift?.start_time) || "10:00");
  const [end, setEnd] = useState(hhmm(shift?.end_time) || "18:00");
  const [lateGrace, setLateGrace] = useState(String(shift?.late_grace_minutes ?? 15));
  const [earlyGrace, setEarlyGrace] = useState(String(shift?.early_checkout_grace_minutes ?? 15));
  const [penalty, setPenalty] = useState(shift?.early_checkout_penalty || "HALF_DAY");
  const [halfDay, setHalfDay] = useState(shift?.min_hours_half_day ? String(Number(shift.min_hours_half_day)) : "4");
  const [fullDay, setFullDay] = useState(shift?.min_hours_full_day ? String(Number(shift.min_hours_full_day)) : "8");
  const [isDefault, setIsDefault] = useState(Boolean(shift?.is_default));
  const [isActive, setIsActive] = useState(shift?.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: shift ? "Edit Shift" : "New Shift" });
  }, [navigation, shift]);

  const save = async () => {
    setError("");
    if (!name.trim()) return setError("Enter a shift name.");
    if (!start || !end) return setError("Choose start and end times.");
    const nums = [lateGrace, earlyGrace, halfDay, fullDay];
    if (nums.some((n) => n.trim() === "" || Number.isNaN(Number(n)) || Number(n) < 0)) return setError("Grace minutes and hours must be zero or more.");
    setSaving(true);
    const body = {
      name: name.trim(),
      code: code.trim(),
      start_time: start,
      end_time: end,
      late_grace_minutes: Number(lateGrace),
      early_checkout_grace_minutes: Number(earlyGrace),
      early_checkout_penalty: penalty,
      min_hours_half_day: Number(halfDay),
      min_hours_full_day: Number(fullDay),
      is_default: isDefault,
      is_active: isActive,
    };
    try {
      if (shift) await api.patch(`/attendance/shifts/${shift.id}/`, body);
      else await api.post("/attendance/shifts/", body);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the shift."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <FormSection title="Shift">
        <TextField label="Name" required value={name} onChangeText={setName} placeholder="e.g. Morning Shift" />
        <TextField label="Code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="e.g. MORN" />
        <TimeField label="Starts at" value={start} onChange={setStart} />
        <TimeField label="Ends at" value={end} onChange={setEnd} />
      </FormSection>
      <FormSection title="Rules">
        <TextField label="Late after (minutes past start)" value={lateGrace} onChangeText={setLateGrace} keyboardType="number-pad" />
        <TextField label="Early check-out grace (minutes)" value={earlyGrace} onChangeText={setEarlyGrace} keyboardType="number-pad" />
        <ChipSelect label="Penalty for leaving early" options={PENALTIES} value={penalty} onChange={setPenalty} />
        <TextField label="Minimum hours for a half day" value={halfDay} onChangeText={setHalfDay} keyboardType="decimal-pad" />
        <TextField label="Minimum hours for a full day" value={fullDay} onChangeText={setFullDay} keyboardType="decimal-pad" />
      </FormSection>
      <FormSection title="Status">
        <SwitchField label="Company default shift" hint="Used by everyone without an assigned shift." value={isDefault} onChange={setIsDefault} />
        <SwitchField label="Active" value={isActive} onChange={setIsActive} />
      </FormSection>
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={shift ? "Save Changes" : "Create Shift"} onPress={save} loading={saving} />
    </ScrollView>
  );
}
