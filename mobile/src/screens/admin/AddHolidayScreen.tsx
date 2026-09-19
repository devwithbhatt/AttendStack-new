import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../api/client";
import { colors, fonts, radii } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";

const HOLIDAY_TYPES = [
  { value: "Public Holiday", label: "Public Holiday" },
  { value: "National Holiday", label: "National Holiday" },
  { value: "Festival", label: "Festival" },
  { value: "Optional Holiday", label: "Optional Holiday" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AddHolidayScreen() {
  const navigation = useNavigation();
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState(HOLIDAY_TYPES[0].value);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim() || !date) {
      setError("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/holidays/", { name: name.trim(), date, type });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create holiday."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <Text style={styles.label}>Holiday Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Independence Day" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>Type</Text>
      <View style={styles.chipsRow}>
        {HOLIDAY_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.chip, type === t.value && styles.chipActive]}
            onPress={() => setType(t.value)}
          >
            <Text style={[styles.chipText, type === t.value && styles.chipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <PrimaryButton title="Add Holiday" onPress={handleSubmit} loading={submitting} style={{ marginTop: 24, marginBottom: 40 }} />
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
