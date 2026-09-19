import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../api/client";
import { colors, fonts, radii } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";

export default function NewProjectScreen() {
  const navigation = useNavigation();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [department, setDepartment] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim() || !key.trim()) {
      setError("Project name and key are required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/tasks/projects/", {
        name: name.trim(),
        key: key.trim().toUpperCase(),
        department: department.trim(),
        due_date: dueDate || null,
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create project."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <Text style={styles.label}>Project Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Website Redesign" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>Project Key</Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="e.g. WEB"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Department (optional)</Text>
      <TextInput style={styles.input} value={department} onChangeText={setDepartment} placeholder="e.g. Engineering" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>Due Date (YYYY-MM-DD, optional)</Text>
      <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} />

      <PrimaryButton title="Create Project" onPress={handleSubmit} loading={submitting} style={{ marginTop: 24, marginBottom: 40 }} />
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
});
