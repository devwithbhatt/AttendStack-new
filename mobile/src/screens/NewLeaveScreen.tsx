import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, extractErrorMessage } from "../api/client";
import { colors, fonts, radii } from "../theme";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import type { LeaveType } from "../types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewLeaveScreen() {
  const navigation = useNavigation();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<LeaveType[]>("/attendance/leaves/types/")
      .then((res) => {
        setLeaveTypes(res.data);
        if (res.data.length > 0) setLeaveType(res.data[0].value);
      })
      .catch(() => setError("Could not load leave types."));
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!leaveType || !startDate || !endDate || !reason.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/attendance/leaves/", {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not submit leave request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <Text style={styles.label}>Leave Type</Text>
      <View style={styles.chipsRow}>
        {leaveTypes.map((type) => (
          <TouchableOpacity
            key={type.value}
            style={[styles.chip, leaveType === type.value && styles.chipActive]}
            onPress={() => setLeaveType(type.value)}
          >
            <Text style={[styles.chipText, leaveType === type.value && styles.chipTextActive]}>{type.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>Reason</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={reason}
        onChangeText={setReason}
        placeholder="Reason for leave"
        placeholderTextColor={colors.placeholder}
        multiline
        numberOfLines={4}
      />

      <PrimaryButton title="Submit Request" onPress={handleSubmit} loading={submitting} style={{ marginTop: 24, marginBottom: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    backgroundColor: "#fff",
    color: colors.text,
  },
  textArea: { height: 90, textAlignVertical: "top" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  chipTextActive: { color: "#fff" },
});
