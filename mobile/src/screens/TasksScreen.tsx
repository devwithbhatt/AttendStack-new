import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii, shadow, softTone } from "../theme";
import { StatusBadge, Badge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { hasModulePermission, type Task, type TaskSummary } from "../types";
import type { RootStackParamList } from "../navigation/types";

type FilterKey = "ALL" | "TODO" | "IN_PROGRESS" | "ON_HOLD" | "OVERDUE" | "HIGH_PRIORITY" | "COMPLETED";
type FeatherName = React.ComponentProps<typeof Feather>["name"];

const PRIORITY_TONE: Record<string, "danger" | "warning" | "info" | "muted"> = {
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "muted",
};

function tileDefs(summary: TaskSummary | null, highPriorityCount: number): Array<{
  key: FilterKey;
  label: string;
  icon: FeatherName;
  tone: Parameters<typeof softTone>[0];
  value: number;
}> {
  return [
    { key: "ALL", label: "All", icon: "list", tone: "muted", value: summary?.total ?? 0 },
    { key: "TODO", label: "To Do", icon: "circle", tone: "info", value: summary?.todo ?? 0 },
    { key: "IN_PROGRESS", label: "Active", icon: "zap", tone: "primary", value: summary?.in_progress ?? 0 },
    { key: "ON_HOLD", label: "On Hold", icon: "pause-circle", tone: "warning", value: summary?.on_hold ?? 0 },
    { key: "OVERDUE", label: "Overdue", icon: "alert-triangle", tone: "danger", value: summary?.overdue ?? 0 },
    { key: "HIGH_PRIORITY", label: "High Priority", icon: "flag", tone: "warning", value: highPriorityCount },
    { key: "COMPLETED", label: "Done", icon: "check-circle", tone: "success", value: summary?.completed ?? 0 },
  ];
}

export default function TasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const canViewAll = hasModulePermission(user, "tasks", "view");
  const canCreate = hasModulePermission(user, "tasks", "edit");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [tasksRes, summaryRes] = await Promise.all([
        api.get("/tasks/", { params: { page_size: 100 } }),
        api.get<TaskSummary>("/tasks/summary/"),
      ]);
      setTasks(unwrapList<Task>(tasksRes.data));
      setSummary(summaryRes.data);
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

  const highPriorityCount = useMemo(() => tasks.filter((t) => t.priority === "HIGH").length, [tasks]);

  const filtered = tasks.filter((t) => {
    if (filter === "ALL") return true;
    if (filter === "OVERDUE") return t.is_overdue;
    if (filter === "HIGH_PRIORITY") return t.priority === "HIGH";
    return t.status === filter;
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerPanel}>
        <Text style={styles.headerTitle}>Task Overview</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tilesRow}
          style={styles.tilesScroll}
        >
          {tileDefs(summary, highPriorityCount).map((tile) => {
            const active = filter === tile.key;
            const t = softTone(tile.tone);
            return (
              <TouchableOpacity
                key={tile.key}
                style={[
                  styles.tile,
                  active
                    ? { backgroundColor: t.text, borderColor: t.text }
                    : { backgroundColor: t.bg, borderColor: t.border },
                ]}
                onPress={() => setFilter(tile.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.tileIconWrap, { backgroundColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.7)" }]}>
                  <Feather name={tile.icon} size={15} color={active ? "#fff" : t.text} />
                </View>
                <Text style={[styles.tileValue, { color: active ? "#fff" : colors.text }]}>{tile.value}</Text>
                <Text style={[styles.tileLabel, { color: active ? "rgba(255,255,255,0.9)" : t.text }]}>{tile.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ErrorBanner message={error} style={{ marginHorizontal: 16, marginTop: 14 }} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: canCreate ? 100 : 16 }}
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
            <Feather name="check-square" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No tasks here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}>
            <View style={styles.rowHeader}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Badge label={item.priority_label} tone={PRIORITY_TONE[item.priority] || "muted"} />
            </View>
            {item.project_name ? (
              <Text style={styles.project}>{item.project_name}{canViewAll ? ` · ${item.assignee_name}` : ""}</Text>
            ) : canViewAll ? (
              <Text style={styles.project}>{item.assignee_name}</Text>
            ) : null}
            <View style={styles.rowFooter}>
              <StatusBadge status={item.status} label={item.status_label} />
              {item.due_date ? (
                <Text style={[styles.due, item.is_overdue && { color: colors.dangerSoftText }]}>
                  Due {item.due_date}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />

      {canCreate && (
        <View style={styles.fabWrap}>
          <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("NewTask")}>
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.fabText}>New Task</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerPanel: {
    backgroundColor: colors.card,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tilesScroll: { flexGrow: 0 },
  tilesRow: { paddingHorizontal: 16, gap: 12, paddingVertical: 4 },
  tile: {
    width: 100,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tileIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  tileValue: { fontSize: 22, fontFamily: fonts.bold },
  tileLabel: { fontSize: 10.5, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, marginBottom: 10, ...shadow.card },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  project: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
  rowFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  due: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  fabWrap: { position: "absolute", bottom: 20, left: 20, right: 20 },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryDark,
    borderRadius: radii.md,
    paddingVertical: 15,
  },
  fabText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
});
