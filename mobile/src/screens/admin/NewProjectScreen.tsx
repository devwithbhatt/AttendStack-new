import React, { useEffect, useLayoutEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, DateField, FieldLabel, FormSection, TextField, formStyles, type ChipOption } from "../../components/Form";
import type { EmployeeListItem } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "NewProject">;

const PROJECT_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"];

/** Create a project, or edit one when opened with `project`. */
export default function NewProjectScreen() {
  const navigation = useNavigation();
  const project = useRoute<Route>().params?.project;
  const [statuses, setStatuses] = useState<ChipOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [name, setName] = useState(project?.name || "");
  const [key, setKey] = useState(project?.key || "");
  const [description, setDescription] = useState(project?.description || "");
  const [status, setStatus] = useState(project?.status || "ACTIVE");
  const [owner, setOwner] = useState(project?.owner || "");
  const [department, setDepartment] = useState(project?.department || "");
  const [startDate, setStartDate] = useState(project?.start_date || "");
  const [dueDate, setDueDate] = useState(project?.due_date || "");
  const [color, setColor] = useState(project?.color || PROJECT_COLORS[0]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: project ? "Edit Project" : "New Project" });
  }, [navigation, project]);

  useEffect(() => {
    api.get<{ statuses: ChipOption[] }>("/tasks/projects/choices/").then((r) => setStatuses(r.data.statuses)).catch(() => undefined);
    fetchAll<EmployeeListItem>("/employees/")
      .then((list) => setEmployees(list.filter((e) => !["INACTIVE", "TERMINATED"].includes(e.status))))
      .catch(() => undefined);
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim() || !key.trim()) {
      setError("Project name and key are required.");
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setError("The due date can't be before the start date.");
      return;
    }
    setSubmitting(true);
    const body = {
      name: name.trim(),
      key: key.trim().toUpperCase(),
      description: description.trim(),
      status,
      owner: owner || null,
      department: department.trim(),
      start_date: startDate || null,
      due_date: dueDate || null,
      color,
    };
    try {
      if (project) await api.patch(`/tasks/projects/${project.id}/`, body);
      else await api.post("/tasks/projects/", body);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the project."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <FormSection title="Project">
        <TextField label="Project name" required value={name} onChangeText={setName} placeholder="e.g. Website Redesign" />
        <TextField label="Project key" required value={key} onChangeText={(v) => setKey(v.toUpperCase())} placeholder="e.g. WEB" autoCapitalize="characters" hint="Short code shown on its tasks." />
        <TextField label="Description" value={description} onChangeText={setDescription} multiline />
        {statuses.length ? <ChipSelect label="Status" options={statuses} value={status} onChange={setStatus} /> : null}
      </FormSection>
      <FormSection title="Ownership & Dates">
        <ChipSelect
          label="Owner"
          scroll
          options={[{ value: "", label: "No owner" }, ...employees.map((e) => ({ value: e.id, label: e.full_name }))]}
          value={owner}
          onChange={setOwner}
        />
        <TextField label="Department" value={department} onChangeText={setDepartment} />
        <DateField label="Start date" value={startDate} onChange={setStartDate} clearable />
        <DateField label="Due date" value={dueDate} onChange={setDueDate} clearable />
        <FieldLabel label="Colour" />
        <View style={styles.colors}>
          {PROJECT_COLORS.map((c) => (
            <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }]} onPress={() => setColor(c)}>
              {color.toLowerCase() === c ? <Feather name="check" size={16} color="#fff" /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </FormSection>
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={project ? "Save Changes" : "Create Project"} onPress={handleSubmit} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
