import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { colors, fonts, radii, shadow, softTone } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { PromptModal, SearchBar, confirmAction, formatDisplayDate } from "../../components/Form";
import { useAuth } from "../../context/AuthContext";
import { hasModulePermission, type LeaveRequest } from "../../types";

const FILTERS: Array<{ key: LeaveRequest["status"] | "ALL"; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
];

export default function AdminLeaveScreen() {
  const { user } = useAuth();
  const canDecide = hasModulePermission(user, "leaves", "edit");
  const canDelete = hasModulePermission(user, "leaves", "delete");
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("PENDING");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<LeaveRequest | null>(null);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setLeaves(await fetchAll<LeaveRequest>("/attendance/leaves/"));
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

  const decide = async (leave: LeaveRequest, status: "APPROVED" | "REJECTED", notes?: string) => {
    setActingId(leave.id);
    setError("");
    try {
      // Same payload as the web dashboard: approving keeps any earlier note,
      // rejecting records the reason the employee will see.
      await api.patch(`/attendance/leaves/${leave.id}/`, {
        status,
        admin_notes: status === "APPROVED" ? leave.admin_notes || "" : notes || "Rejected by administrator",
      });
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update this leave request."));
    } finally {
      setActingId(null);
    }
  };

  const remove = (leave: LeaveRequest) =>
    confirmAction("Delete leave request?", `${leave.employee_name}'s ${leave.leave_type_label.toLowerCase()} request will be removed and its attendance days recalculated.`, "Delete", async () => {
      try {
        await api.delete(`/attendance/leaves/${leave.id}/`);
        await load();
      } catch (err) {
        Alert.alert("Could not delete", extractErrorMessage(err));
      }
    });

  // Nobody decides on their own leave — the backend refuses it too.
  const canActOn = (l: LeaveRequest) => canDecide && l.employee_id !== user?.employee_id;

  const menuOptions = (l: LeaveRequest): ActionSheetOption[] => {
    const options: ActionSheetOption[] = [];
    if (canActOn(l)) {
      if (l.status !== "APPROVED") options.push({ key: "approve", label: "Approve", icon: "check", onPress: () => decide(l, "APPROVED") });
      if (l.status !== "REJECTED") options.push({ key: "reject", label: "Reject…", icon: "x", onPress: () => setRejecting(l) });
    }
    if (canDelete) options.push({ key: "delete", label: "Delete request", icon: "trash-2", destructive: true, onPress: () => remove(l) });
    return options;
  };

  const q = search.trim().toLowerCase();
  const filtered = leaves
    .filter((l) => filter === "ALL" || l.status === filter)
    .filter((l) => !q || l.employee_name?.toLowerCase().includes(q) || l.employee_id?.toLowerCase().includes(q) || l.leave_type_label.toLowerCase().includes(q));
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: leaves.length } as Record<string, number>;
  leaves.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
  const primaryTone = softTone("primary");

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && { backgroundColor: primaryTone.text, borderColor: primaryTone.text }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f.label} {counts[f.key] ? `(${counts[f.key]})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search employee or leave type" style={{ marginHorizontal: 16, marginTop: 10 }} />

      <ErrorBanner message={error} style={{ marginHorizontal: 16, marginTop: 12 }} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
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
            <Feather name="inbox" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No leave requests here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const options = menuOptions(item);
          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.employee_name}</Text>
                  {item.employee_department ? <Text style={styles.dept}>{item.employee_department}</Text> : null}
                </View>
                <StatusBadge status={item.status} label={item.status_label} />
                {options.length > 0 ? (
                  <TouchableOpacity onPress={() => setMenuFor(item)} hitSlop={10} style={{ marginLeft: 8 }}>
                    <Feather name="more-vertical" size={18} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.type}>
                {item.leave_type_label}
                {item.is_half_day ? " · Half day" : ""}
              </Text>
              <Text style={styles.dates}>
                {formatDisplayDate(item.start_date)} → {formatDisplayDate(item.end_date)}
              </Text>
              {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
              {item.admin_notes ? (
                <View style={styles.noteBox}>
                  <Feather name="message-square" size={13} color={colors.infoSoftText} />
                  <Text style={styles.noteText}>{item.admin_notes}</Text>
                </View>
              ) : null}

              {item.status === "PENDING" && canActOn(item) && (
                <View style={styles.actionsRow}>
                  <PrimaryButton title="Approve" onPress={() => decide(item, "APPROVED")} loading={actingId === item.id} style={{ flex: 1 }} />
                  <PrimaryButton title="Reject" onPress={() => setRejecting(item)} loading={actingId === item.id} variant="danger" style={{ flex: 1 }} />
                </View>
              )}
            </View>
          );
        }}
      />

      <ActionSheet visible={!!menuFor} title={menuFor?.employee_name} options={menuFor ? menuOptions(menuFor) : []} onClose={() => setMenuFor(null)} />
      <PromptModal
        visible={!!rejecting}
        title="Reject leave request"
        message={rejecting ? `Tell ${rejecting.employee_name} why. They'll see this note.` : undefined}
        placeholder="Reason for rejection"
        confirmLabel="Reject"
        destructive
        required
        onSubmit={(reason) => {
          const leave = rejecting;
          setRejecting(null);
          if (leave) decide(leave, "REJECTED", reason);
        }}
        onClose={() => setRejecting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  filterRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  filterChipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text },
  filterChipTextActive: { color: "#fff", fontFamily: fonts.semiBold },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, marginBottom: 10, ...shadow.card },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  dept: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 1 },
  type: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginTop: 8 },
  dates: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  reason: { fontSize: 13, fontFamily: fonts.regular, color: colors.text, marginTop: 6 },
  noteBox: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.infoSoftBg,
    borderRadius: radii.sm,
    padding: 8,
    marginTop: 8,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: fonts.regular, color: colors.infoSoftText },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
});
