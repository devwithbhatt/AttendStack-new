import React, { useCallback, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Linking, Alert } from "react-native";
import { useFocusEffect, useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { ActionSheet, type ActionSheetOption } from "../components/ActionSheet";
import { confirmAction, formatDisplayDate } from "../components/Form";
import { hasModulePermission } from "../types";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../api/client";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { Card } from "../components/Card";
import { PrimaryButton } from "../components/PrimaryButton";
import type { Task, TaskChoices } from "../types";
import type { RootStackParamList } from "../navigation/types";

type Route = RouteProp<RootStackParamList, "TaskDetail">;

export default function TaskDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { taskId } = route.params;
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "tasks", "edit");
  const canDelete = hasModulePermission(user, "tasks", "delete");
  const [menuOpen, setMenuOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [choices, setChoices] = useState<TaskChoices | null>(null);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [taskRes, choicesRes] = await Promise.all([
        api.get<Task>(`/tasks/${taskId}/`),
        api.get<TaskChoices>("/tasks/choices/"),
      ]);
      setTask(taskRes.data);
      setStatus(taskRes.data.status);
      setNotes(taskRes.data.employee_notes || "");
      setChoices(choicesRes.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [taskId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit
        ? () => (
            <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={10}>
              <Feather name="more-vertical" size={20} color={colors.primary} />
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, canEdit]);

  const deleteTask = () =>
    confirmAction(
      "Delete task?",
      `"${task?.title}" can't be restored.${task?.subtask_count ? ` Its ${task.subtask_count} subtask${task.subtask_count === 1 ? "" : "s"} will be deleted too.` : ""}`,
      "Delete",
      async () => {
        try {
          await api.delete(`/tasks/${taskId}/`);
          navigation.goBack();
        } catch (err) {
          Alert.alert("Could not delete", extractErrorMessage(err));
        }
      }
    );

  const menu: ActionSheetOption[] = [
    { key: "edit", label: "Edit task", icon: "edit-2", onPress: () => navigation.navigate("NewTask", { taskId }) },
    ...(task && !task.parent ? [{ key: "sub", label: "Add subtask", icon: "corner-down-right" as const, onPress: () => navigation.navigate("NewTask", { parentId: taskId }) }] : []),
    ...(canDelete ? [{ key: "delete", label: "Delete task", icon: "trash-2" as const, destructive: true, onPress: deleteTask }] : []),
  ];

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/tasks/${taskId}/status/`, { status, employee_notes: notes });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update this task."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !task) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{task.title}</Text>
          <StatusBadge status={task.status} label={task.status_label} />
        </View>
        {task.project_name ? <Text style={styles.meta}>Project: {task.project_name}</Text> : null}
        {task.parent_title ? <Text style={styles.meta}>Subtask of: {task.parent_title}</Text> : null}
        <Text style={styles.meta}>
          Assignee{(task.assignee_names?.length ?? 0) > 1 ? "s" : ""}: {task.assignee_names?.length ? task.assignee_names.join(", ") : task.assignee_name}
        </Text>
        {task.start_date ? <Text style={styles.meta}>Starts: {formatDisplayDate(task.start_date)}</Text> : null}
        {task.due_date ? <Text style={[styles.meta, task.is_overdue && { color: colors.danger }]}>Due: {formatDisplayDate(task.due_date)}{task.is_overdue ? " · overdue" : ""}</Text> : null}
        {task.assigned_by_name ? <Text style={styles.meta}>Assigned by: {task.assigned_by_name}</Text> : null}
        {task.attachment_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(task.attachment_url!)}>
            <Text style={[styles.meta, { color: colors.primaryDark }]}>📎 {task.attachment_name || "Attachment"}</Text>
          </TouchableOpacity>
        ) : null}
        {task.employee_attachment_url ? (
          <TouchableOpacity onPress={() => Linking.openURL(task.employee_attachment_url!)}>
            <Text style={[styles.meta, { color: colors.primaryDark }]}>📎 {task.employee_attachment_name || "Employee's file"}</Text>
          </TouchableOpacity>
        ) : null}
        {task.description ? <Text style={styles.description}>{task.description}</Text> : null}
        {task.admin_notes ? (
          <View style={styles.adminNoteBox}>
            <Feather name="info" size={14} color={colors.infoSoftText} />
            <Text style={styles.adminNoteText}>{task.admin_notes}</Text>
          </View>
        ) : null}
      </Card>

      <Text style={styles.label}>Update Status</Text>
      <View style={styles.chipsRow}>
        {(choices?.statuses || []).map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.chip, status === s.value && styles.chipActive]}
            onPress={() => setStatus(s.value)}
          >
            <Text style={[styles.chipText, status === s.value && styles.chipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={styles.textArea}
        value={notes}
        onChangeText={setNotes}
        placeholder="Add a progress note..."
        placeholderTextColor={colors.placeholder}
        multiline
        numberOfLines={4}
      />

      <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} style={{ marginTop: 24, marginBottom: 40 }} />
      <ActionSheet visible={menuOpen} title={task.title} options={menu} onClose={() => setMenuOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  title: { flex: 1, fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 8 },
  description: { fontSize: 13, fontFamily: fonts.regular, color: colors.text, marginTop: 12, lineHeight: 19 },
  adminNoteBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.infoSoftBg,
    borderWidth: 1,
    borderColor: colors.infoSoftBorder,
    borderRadius: radii.md,
    padding: 12,
    marginTop: 14,
  },
  adminNoteText: { flex: 1, fontSize: 12, fontFamily: fonts.regular, color: colors.infoSoftText },
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginBottom: 8, marginTop: 20 },
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
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 14,
    fontFamily: fonts.regular,
    backgroundColor: "#fff",
    color: colors.text,
    height: 100,
    textAlignVertical: "top",
  },
});
