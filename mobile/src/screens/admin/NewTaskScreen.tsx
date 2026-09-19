import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { colors, fonts, radii } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import type { EmployeeListItem, Project, TaskChoices } from "../../types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewTaskScreen() {
  const navigation = useNavigation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [priorities, setPriorities] = useState<TaskChoices["priorities"]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/tasks/projects/", { params: { page_size: 100 } }),
      api.get("/employees/", { params: { page_size: 200 } }),
      api.get<TaskChoices>("/tasks/choices/"),
    ])
      .then(([projRes, empRes, choicesRes]) => {
        const projectList = unwrapList<Project>(projRes.data);
        const employeeList = unwrapList<EmployeeListItem>(empRes.data);
        setProjects(projectList);
        setEmployees(employeeList);
        setPriorities(choicesRes.data.priorities);
        if (projectList.length > 0) setProjectId(projectList[0].id);
        if (employeeList.length > 0) setAssigneeId(employeeList[0].id);
      })
      .catch(() => setError("Could not load projects or employees."));
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!title.trim() || !projectId || !assigneeId) {
      setError(projects.length === 0 ? "Create a project first before adding tasks." : "Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/tasks/", {
        title: title.trim(),
        description: description.trim(),
        project: projectId,
        assignee: assigneeId,
        priority,
        due_date: dueDate,
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create task."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Task title" placeholderTextColor={colors.placeholder} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details"
        placeholderTextColor={colors.placeholder}
        multiline
      />

      <Text style={styles.label}>Project</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        {projects.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, projectId === p.id && styles.chipActive]}
            onPress={() => setProjectId(p.id)}
          >
            <Text style={[styles.chipText, projectId === p.id && styles.chipTextActive]}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {projects.length === 0 && <Text style={styles.hint}>No projects yet — create one from the Projects screen first.</Text>}

      <Text style={styles.label}>Assignee</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        {employees.map((e) => (
          <TouchableOpacity
            key={e.id}
            style={[styles.chip, assigneeId === e.id && styles.chipActive]}
            onPress={() => setAssigneeId(e.id)}
          >
            <Text style={[styles.chipText, assigneeId === e.id && styles.chipTextActive]}>{e.full_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {employees.length === 0 && <Text style={styles.hint}>No employees yet — add one from Employees first.</Text>}

      <Text style={styles.label}>Priority</Text>
      <View style={styles.chipsRow}>
        {priorities.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.chip, priority === p.value && styles.chipActive]}
            onPress={() => setPriority(p.value)}
          >
            <Text style={[styles.chipText, priority === p.value && styles.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Due Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} />

      <PrimaryButton title="Create Task" onPress={handleSubmit} loading={submitting} style={{ marginTop: 24, marginBottom: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginBottom: 6, marginTop: 12 },
  hint: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 4 },
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
  textArea: { height: 80, textAlignVertical: "top" },
  chipsScroll: { flexDirection: "row" },
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
