import React, { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, StyleSheet, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, DateField, FormSection, TextField, TimeField, confirmAction, formStyles, todayISO } from "../../components/Form";
import { ATTENDANCE_STATUSES } from "../../constants";
import { hasModulePermission, type EmployeeListItem } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "AttendanceRecordForm">;

function toHHMM(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Mark attendance for someone, or correct an existing record. */
export default function AttendanceRecordFormScreen() {
  const navigation = useNavigation();
  const { record, date: initialDate } = useRoute<Route>().params ?? {};
  const { user } = useAuth();
  const canDelete = hasModulePermission(user, "attendance", "delete");
  const isEdit = Boolean(record);

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [date, setDate] = useState(record?.date || initialDate || todayISO());
  const [checkIn, setCheckIn] = useState(toHHMM(record?.check_in ?? null));
  const [checkOut, setCheckOut] = useState(toHHMM(record?.check_out ?? null));
  const [status, setStatus] = useState(record?.status || "PRESENT");
  const [notes, setNotes] = useState(record?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? record!.employee_name : "Mark Attendance" });
  }, [navigation, isEdit, record]);

  useEffect(() => {
    if (isEdit) return;
    fetchAll<EmployeeListItem>("/employees/")
      .then((list) => setEmployees(list.filter((e) => !["INACTIVE", "TERMINATED"].includes(e.status))))
      .catch(() => setError("Could not load employees."));
  }, [isEdit]);

  const save = async () => {
    setError("");
    if (!isEdit && !employeeId) {
      setError("Choose an employee.");
      return;
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      setError("Check-out must be after check-in.");
      return;
    }
    setSaving(true);
    const body = { date, check_in: checkIn || null, check_out: checkOut || null, status, notes: notes.trim() };
    try {
      if (isEdit) await api.patch(`/attendance/${record!.id}/`, body);
      else await api.post("/attendance/", { ...body, employee: employeeId });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save attendance."));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    confirmAction("Delete record?", "This attendance record will be removed permanently.", "Delete", async () => {
      try {
        await api.delete(`/attendance/${record!.id}/`);
        navigation.goBack();
      } catch (err) {
        Alert.alert("Could not delete", extractErrorMessage(err));
      }
    });

  const q = employeeSearch.trim().toLowerCase();
  const employeeOptions = employees
    .filter((e) => !q || e.full_name.toLowerCase().includes(q) || e.employee_id.toLowerCase().includes(q))
    .slice(0, 40)
    .map((e) => ({ value: e.id, label: e.full_name }));

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <FormSection title={isEdit ? `${record!.employee_name} · ${record!.employee_id}` : "Employee"}>
        {isEdit ? (
          <Text style={styles.note}>Correct the times or status for this day. Leave times blank to clear them.</Text>
        ) : (
          <>
            <TextField label="Find employee" value={employeeSearch} onChangeText={setEmployeeSearch} placeholder="Type a name or ID" />
            <ChipSelect label="Employee" required scroll options={employeeOptions} value={employeeId} onChange={setEmployeeId} />
          </>
        )}
        <DateField label="Date" required value={date} onChange={(v) => v && setDate(v)} />
      </FormSection>

      <FormSection title="Attendance">
        <TimeField label="Check-in" value={checkIn} onChange={setCheckIn} clearable />
        <TimeField label="Check-out" value={checkOut} onChange={setCheckOut} clearable />
        <ChipSelect label="Status" options={ATTENDANCE_STATUSES} value={status} onChange={setStatus} />
        <TextField label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional reason for the change" />
      </FormSection>

      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={isEdit ? "Save Changes" : "Mark Attendance"} onPress={save} loading={saving} />
      {isEdit && canDelete ? <PrimaryButton title="Delete Record" variant="outline" onPress={remove} style={{ marginTop: 12 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 8 },
});
