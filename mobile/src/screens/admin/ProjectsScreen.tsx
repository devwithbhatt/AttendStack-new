import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { ActionSheet } from "../../components/ActionSheet";
import { Fab, confirmAction, formatDisplayDate } from "../../components/Form";
import { hasModulePermission } from "../../types";
import { colors, fonts, radii, shadow } from "../../theme";
import { Badge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import type { Project } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

export default function ProjectsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "tasks", "edit");
  const canDelete = hasModulePermission(user, "tasks", "delete");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setProjects(await fetchAll<Project>("/tasks/projects/"));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const remove = (p: Project) =>
    confirmAction(
      "Delete project?",
      `"${p.name}" can't be restored.${p.task_count ? ` Its ${p.task_count} task${p.task_count === 1 ? "" : "s"} will be deleted too.` : ""}`,
      "Delete",
      async () => {
        try {
          await api.delete(`/tasks/projects/${p.id}/`);
          await load();
        } catch (err) {
          setError(extractErrorMessage(err, "Could not delete the project."));
        }
      }
    );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ErrorBanner message={error} style={{ margin: 16, marginBottom: 0 }} />
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="briefcase" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No projects yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} disabled={!canEdit} onPress={() => setSelected(item)} activeOpacity={0.7}>
            <View style={styles.rowHeader}>
              <View style={[styles.colorDot, { backgroundColor: item.color }]} />
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Badge label={item.status_label} tone="info" />
            </View>
            <Text style={styles.meta}>
              {item.key} · {item.owner_name || "Unassigned"} {item.due_date ? `· Due ${formatDisplayDate(item.due_date)}` : ""}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${item.progress}%`, backgroundColor: item.color }]} />
            </View>
            <Text style={styles.progressLabel}>
              {item.completed_task_count}/{item.task_count} tasks · {item.progress}%
            </Text>
          </TouchableOpacity>
        )}
      />
      {canEdit ? <Fab onPress={() => navigation.navigate("NewProject")} /> : null}
      <ActionSheet
        visible={!!selected}
        title={selected?.name}
        onClose={() => setSelected(null)}
        options={
          selected
            ? [
                { key: "task", label: "Add a task", icon: "plus-square", onPress: () => navigation.navigate("NewTask", { projectId: selected.id }) },
                { key: "edit", label: "Edit project", icon: "edit-2", onPress: () => navigation.navigate("NewProject", { project: selected }) },
                ...(canDelete ? [{ key: "delete", label: "Delete project", icon: "trash-2" as const, destructive: true, onPress: () => remove(selected) }] : []),
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, marginBottom: 10, ...shadow.card },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface, marginTop: 12, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted, marginTop: 6 },
});
