import React, { useEffect, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { colors, fonts, radii } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, DateField, FormSection, MultiChipSelect, TextField, formStyles } from "../../components/Form";
import { pickDocument, type PickedFile } from "../chat/attachments";
import type { EmployeeListItem, Project, Task, TaskChoices } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "NewTask">;

/** Create a task (or subtask), or edit one when opened with `taskId` —
 * same fields as the web task dialog. */
export default function NewTaskScreen() {
  const navigation = useNavigation();
  const { taskId, parentId, projectId } = useRoute<Route>().params ?? {};
  const isEdit = Boolean(taskId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [choices, setChoices] = useState<TaskChoices>({ statuses: [], priorities: [] });
  const [parentTitle, setParentTitle] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState(projectId || "");
  const [parent, setParent] = useState(parentId || "");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("TODO");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [attachment, setAttachment] = useState<PickedFile | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? "Edit Task" : parentId ? "New Subtask" : "New Task" });
  }, [navigation, isEdit, parentId]);

  useEffect(() => {
    (async () => {
      try {
        const [projectList, employeeList, choicesRes] = await Promise.all([
          fetchAll<Project>("/tasks/projects/"),
          fetchAll<EmployeeListItem>("/employees/"),
          api.get<TaskChoices>("/tasks/choices/"),
        ]);
        setProjects(projectList);
        setEmployees(employeeList.filter((e) => !["INACTIVE", "TERMINATED"].includes(e.status)));
        setChoices(choicesRes.data);
        if (!projectId && !isEdit && projectList.length > 0 && !parentId) setProject(projectList[0].id);

        if (parentId) {
          const { data: p } = await api.get<Task>(`/tasks/${parentId}/`);
          setParentTitle(p.title);
          setProject(p.project || "");
        }
        if (taskId) {
          const { data: t } = await api.get<Task>(`/tasks/${taskId}/`);
          setTitle(t.title);
          setDescription(t.description || "");
          setProject(t.project || "");
          setParent(t.parent || "");
          setParentTitle(t.parent_title || "");
          setAssignees(t.assignees?.length ? t.assignees : t.assignee ? [t.assignee] : []);
          setPriority(t.priority);
          setStatus(t.status);
          setStartDate(t.start_date || "");
          setDueDate(t.due_date || "");
          setAdminNotes(t.admin_notes || "");
          setExistingAttachment(t.attachment_name || null);
        }
      } catch (err) {
        setError(extractErrorMessage(err, "Could not load projects or employees."));
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId, parentId, projectId, isEdit]);

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) return setError("Enter a task title.");
    if (!project) return setError(projects.length === 0 ? "Create a project first before adding tasks." : "Choose a project.");
    if (assignees.length === 0) return setError("Assign at least one employee.");
    if (startDate && dueDate && dueDate < startDate) return setError("The due date can't be before the start date.");

    setSubmitting(true);
    // Multipart like the web dialog (it may carry an attachment).
    const body = new FormData();
    const fields: Record<string, string> = {
      title: title.trim(),
      description: description.trim(),
      project,
      parent,
      priority,
      status,
      start_date: startDate,
      due_date: dueDate,
      admin_notes: adminNotes.trim(),
      assignee: assignees[0],
    };
    Object.entries(fields).forEach(([k, v]) => {
      if (v) body.append(k, v);
      else if (isEdit && ["description", "start_date", "due_date", "admin_notes"].includes(k)) body.append(k, "");
    });
    assignees.forEach((a) => body.append("assignees", a));
    if (attachment) body.append("attachment", { uri: attachment.uri, name: attachment.name, type: attachment.type } as unknown as Blob);

    try {
      const config = { headers: { "Content-Type": "multipart/form-data" } };
      if (isEdit) await api.patch(`/tasks/${taskId}/`, body, config);
      else await api.post("/tasks/", body, config);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the task."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const q = assigneeSearch.trim().toLowerCase();
  const assigneeOptions = employees
    .filter((e) => assignees.includes(e.id) || !q || e.full_name.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q))
    .slice(0, q ? 60 : 30)
    .map((e) => ({ value: e.id, label: e.full_name }));

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      {parent && parentTitle ? <Text style={styles.parent}>Subtask of “{parentTitle}”</Text> : null}
      <FormSection title="Task">
        <TextField label="Title" required value={title} onChangeText={setTitle} placeholder="Task title" />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional details" multiline />
        {!parent ? (
          <ChipSelect
            label="Project"
            required
            scroll
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={project}
            onChange={setProject}
            hint={projects.length === 0 ? "No projects yet — create one from Projects first." : undefined}
          />
        ) : null}
      </FormSection>

      <FormSection title="Assignees">
        <TextField label="Find people" value={assigneeSearch} onChangeText={setAssigneeSearch} placeholder="Name or department" />
        <MultiChipSelect options={assigneeOptions} values={assignees} onChange={setAssignees} hint={`${assignees.length} selected · the first is the primary assignee`} />
      </FormSection>

      <FormSection title="Planning">
        <ChipSelect label="Priority" options={choices.priorities} value={priority} onChange={setPriority} />
        <ChipSelect label="Status" options={choices.statuses} value={status} onChange={setStatus} />
        <DateField label="Start date" value={startDate} onChange={setStartDate} clearable />
        <DateField label="Due date" value={dueDate} onChange={setDueDate} clearable />
      </FormSection>

      <FormSection title="For the assignee">
        <TextField label="Admin notes" value={adminNotes} onChangeText={setAdminNotes} multiline placeholder="Instructions shown on the task" />
        <TouchableOpacity style={styles.attach} onPress={async () => setAttachment((await pickDocument()) ?? attachment)}>
          <Feather name="paperclip" size={16} color={colors.primaryDark} />
          <Text style={styles.attachText} numberOfLines={1}>
            {attachment?.name || (existingAttachment ? `${existingAttachment} — tap to replace` : "Attach a file (optional)")}
          </Text>
        </TouchableOpacity>
      </FormSection>

      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={isEdit ? "Save Changes" : "Create Task"} onPress={handleSubmit} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  parent: { fontSize: 13, fontFamily: fonts.medium, color: colors.muted, marginBottom: 12 },
  attach: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radii.md, padding: 12, marginTop: 14 },
  attachText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.text },
});
