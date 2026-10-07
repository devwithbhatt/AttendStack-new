import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { StatCard } from "../../components/StatCard";
import { Badge } from "../../components/Badge";
import { AttendanceCard } from "../../components/AttendanceCard";
import type { EmployeeListItem, LeaveRequest, Task, TodayOverviewEntry } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
const PRIORITY_TONE: Record<string, "danger" | "warning" | "info" | "muted"> = {
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "muted",
};
const OPEN_STATUSES = new Set(["PENDING", "TODO", "IN_PROGRESS", "ON_HOLD"]);

export default function AdminHomeScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [presentToday, setPresentToday] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [absentToday, setAbsentToday] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const [employeesRes, todayRes, leavesRes, tasksRes] = await Promise.all([
        api.get("/employees/", { params: { page_size: 200 } }),
        api.get<TodayOverviewEntry[]>("/attendance/today/"),
        fetchAll<LeaveRequest>("/attendance/leaves/"),
        api.get("/tasks/", { params: { page_size: 100 } }),
      ]);
      const employees = unwrapList<EmployeeListItem>(employeesRes.data);
      const today = todayRes.data;
      const leaves = leavesRes;

      setTotalEmployees(Array.isArray(employeesRes.data) ? employees.length : (employeesRes.data as any).count ?? employees.length);
      setPresentToday(today.filter((e) => !!e.check_in).length);
      setAbsentToday(today.filter((e) => !e.check_in).length);
      setPendingLeaves(leaves.filter((l) => l.status === "PENDING").length);
      setTasks(unwrapList<Task>(tasksRes.data));
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

  const pendingTasksByPriority = useMemo(() => {
    return tasks
      .filter((t) => OPEN_STATUSES.has(t.status))
      .sort((a, b) => {
        const diff = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
        if (diff !== 0) return diff;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      })
      .slice(0, 5);
  }, [tasks]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            setRefreshKey((k) => k + 1);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.first_name?.[0] || "?").toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.greeting}>Hi, {user?.first_name || "there"} 👋</Text>
            <Text style={styles.subGreeting}>
              {user?.custom_role_title || user?.role} · {new Date().toDateString()}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn} hitSlop={8}>
          <Feather name="log-out" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      {/* An admin who is also on the payroll checks in like everyone else. */}
      {user?.employee_id ? (
        <View style={{ marginBottom: 20 }}>
          <AttendanceCard refreshKey={refreshKey} />
        </View>
      ) : null}

      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <View style={styles.grid}>
        <StatCard
          label="Employees"
          value={totalEmployees}
          icon="users"
          tone="primary"
          onPress={() => navigation.navigate("EmployeeCategories")}
        />
        <StatCard
          label="Present Today"
          value={presentToday}
          icon="check-circle"
          tone="success"
          onPress={() => navigation.navigate("AttendanceOverview", { filter: "present" })}
        />
      </View>
      <View style={[styles.grid, { marginTop: 12 }]}>
        <StatCard
          label="Pending Leaves"
          value={pendingLeaves}
          icon="clock"
          tone="warning"
          onPress={() => navigation.navigate("Tabs", { screen: "Leaves" })}
        />
        <StatCard
          label="Absent Today"
          value={absentToday}
          icon="user-x"
          tone="danger"
          onPress={() => navigation.navigate("AttendanceOverview", { filter: "absent" })}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pending Tasks · By Priority</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Tabs", { screen: "Tasks" })}>
          <Text style={styles.sectionLink}>View All</Text>
        </TouchableOpacity>
      </View>

      {pendingTasksByPriority.length === 0 ? (
        <View style={styles.emptyTasks}>
          <Feather name="check-square" size={22} color={colors.muted} />
          <Text style={styles.emptyTasksText}>No open tasks right now.</Text>
        </View>
      ) : (
        pendingTasksByPriority.map((task) => (
          <TouchableOpacity
            key={task.id}
            style={styles.taskRow}
            onPress={() => navigation.navigate("TaskDetail", { taskId: task.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
              <Text style={styles.taskMeta}>
                {task.assignee_name}{task.due_date ? ` · Due ${task.due_date}` : ""}
              </Text>
            </View>
            <Badge label={task.priority_label} tone={PRIORITY_TONE[task.priority] || "muted"} />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontFamily: fonts.bold, fontSize: 17 },
  greeting: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  subGreeting: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoftBg,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  sectionLink: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.primaryDark },
  emptyTasks: {
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 24,
    ...shadow.card,
  },
  emptyTasksText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  taskRow: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow.card,
  },
  taskTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  taskMeta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
});
