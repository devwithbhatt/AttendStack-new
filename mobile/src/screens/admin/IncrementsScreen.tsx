import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, Pressable, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { ChipSelect, DateField, PromptModal, SearchBar, SwitchField, TextField, confirmAction, formStyles, formatDisplayDate, formatMoney, todayISO } from "../../components/Form";
import { INCREMENT_TYPES } from "../../constants";
import { hasModulePermission, type AdminIncrement } from "../../types";

const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "this_month", label: "Due this month" },
  { value: "next_month", label: "Due next month" },
  { value: "RESCHEDULED", label: "Rescheduled" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "", label: "All" },
];

interface Summary {
  pending_count: number;
  due_this_month: number;
  due_next_month: number;
  approved_this_year: number;
}

type EditMode = { kind: "reschedule" | "hike"; increment: AdminIncrement } | null;

/** Salary increments for the whole company — the web "Upcoming Increments" widget. */
export default function IncrementsScreen() {
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "payroll", "edit");
  const [filter, setFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminIncrement[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<AdminIncrement | null>(null);
  const [rejecting, setRejecting] = useState<AdminIncrement | null>(null);
  const [editing, setEditing] = useState<EditMode>(null);

  // Edit form state (shared by reschedule and edit-hike).
  const [newDate, setNewDate] = useState(todayISO());
  const [hikeType, setHikeType] = useState("PERCENTAGE");
  const [hikeValue, setHikeValue] = useState("");
  const [updatePolicy, setUpdatePolicy] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const params: Record<string, unknown> = {};
    if (filter === "this_month" || filter === "next_month") params.due = filter;
    else if (filter) params.status = filter;
    try {
      const [list, sum] = await Promise.all([
        fetchAll<AdminIncrement>("/payroll/increments/", params),
        api.get<Summary>("/payroll/increments/summary/").catch(() => null),
      ]);
      list.sort((a, b) => a.due_date.localeCompare(b.due_date));
      setRows(list);
      if (sum) setSummary(sum.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const post = async (inc: AdminIncrement, action: string, body: Record<string, unknown>) => {
    try {
      await api.post(`/payroll/increments/${inc.id}/${action}/`, body);
      await load();
      return true;
    } catch (err) {
      Alert.alert("Could not update increment", extractErrorMessage(err));
      return false;
    }
  };

  const approve = (inc: AdminIncrement) =>
    confirmAction(
      "Approve increment?",
      `${inc.employee_details.full_name}'s salary becomes ${formatMoney(inc.new_salary)} / year (from ${formatMoney(inc.current_salary)}).`,
      "Approve",
      () => post(inc, "approve", { notes: "Approved by Admin" }),
      false
    );

  const openEdit = (kind: "reschedule" | "hike", inc: AdminIncrement) => {
    setEditError("");
    setEditNotes("");
    setNewDate(inc.due_date > todayISO() ? inc.due_date : todayISO());
    setHikeType(inc.increment_type);
    setHikeValue(String(Number(inc.increment_value)));
    setUpdatePolicy(false);
    setEditing({ kind, increment: inc });
  };

  const submitEdit = async () => {
    if (!editing) return;
    setEditError("");
    if (editing.kind === "hike" && !(Number(hikeValue) >= 0 && hikeValue.trim() !== "")) {
      setEditError("Enter the increment value.");
      return;
    }
    setSaving(true);
    const ok =
      editing.kind === "reschedule"
        ? await post(editing.increment, "reschedule", { rescheduled_date: newDate, notes: editNotes.trim() })
        : await post(editing.increment, "edit-hike", {
            increment_type: hikeType,
            increment_value: Number(hikeValue),
            notes: editNotes.trim(),
            update_employee_policy: updatePolicy,
          });
    setSaving(false);
    if (ok) setEditing(null);
  };

  const menuOptions = (inc: AdminIncrement): ActionSheetOption[] =>
    inc.status === "PENDING" || inc.status === "RESCHEDULED"
      ? [
          { key: "approve", label: "Approve", icon: "check", onPress: () => approve(inc) },
          { key: "hike", label: "Edit hike", icon: "edit-2", onPress: () => openEdit("hike", inc) },
          { key: "reschedule", label: "Reschedule", icon: "calendar", onPress: () => openEdit("reschedule", inc) },
          { key: "reject", label: "Reject…", icon: "x", destructive: true, onPress: () => setRejecting(inc) },
        ]
      : [];

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || r.employee_details.full_name.toLowerCase().includes(q) || r.employee_details.employee_id?.toLowerCase().includes(q));

  return (
    <View style={formStyles.screen}>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
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
        ListHeaderComponent={
          <View>
            {summary ? (
              <View style={styles.summary}>
                {[
                  ["Pending", summary.pending_count],
                  ["This month", summary.due_this_month],
                  ["Next month", summary.due_next_month],
                  ["Approved (yr)", summary.approved_this_year],
                ].map(([label, value]) => (
                  <View key={label as string} style={styles.summaryCell}>
                    <Text style={styles.summaryValue}>{value}</Text>
                    <Text style={styles.summaryLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <ChipSelect scroll options={FILTERS} value={filter} onChange={setFilter} />
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search employee" style={{ marginTop: 6, marginBottom: 10 }} />
            <ErrorBanner message={error} style={{ marginBottom: 10 }} />
            {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={formStyles.empty}>
              <Feather name="trending-up" size={28} color={colors.muted} />
              <Text style={formStyles.emptyText}>No increments here.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const actions = canEdit ? menuOptions(item) : [];
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={formStyles.rowTitle}>{item.employee_details.full_name}</Text>
                  <Text style={formStyles.rowMeta}>
                    Due {formatDisplayDate(item.due_date)}
                    {item.cycle_display ? ` · ${item.cycle_display}` : ""}
                    {item.is_custom ? " · custom policy" : ""}
                  </Text>
                </View>
                <StatusBadge status={item.status} label={item.status_display} />
                {actions.length ? (
                  <TouchableOpacity onPress={() => setMenuFor(item)} hitSlop={10} style={{ marginLeft: 6 }}>
                    <Feather name="more-vertical" size={18} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.salaryRow}>
                <Text style={styles.salary}>{formatMoney(item.current_salary)}</Text>
                <Feather name="arrow-right" size={14} color={colors.muted} />
                <Text style={[styles.salary, { color: colors.primaryDark }]}>{formatMoney(item.new_salary)}</Text>
              </View>
              <Text style={formStyles.rowMeta}>
                +{item.increment_type === "PERCENTAGE" ? `${Number(item.increment_value)}%` : formatMoney(item.increment_value)} ({formatMoney(item.calculated_increment_amount)})
              </Text>
              {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            </View>
          );
        }}
      />

      <ActionSheet visible={!!menuFor} title={menuFor?.employee_details.full_name} options={menuFor ? menuOptions(menuFor) : []} onClose={() => setMenuFor(null)} />
      <PromptModal
        visible={!!rejecting}
        title="Reject increment"
        message="Add a note explaining why."
        placeholder="Reason"
        confirmLabel="Reject"
        destructive
        required
        onSubmit={(notes) => {
          const inc = rejecting;
          setRejecting(null);
          if (inc) post(inc, "reject", { notes });
        }}
        onClose={() => setRejecting(null)}
      />

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>
                {editing?.kind === "reschedule" ? "Reschedule increment" : "Edit hike"} · {editing?.increment.employee_details.full_name}
              </Text>
              {editing?.kind === "reschedule" ? (
                <DateField label="New due date" required value={newDate} onChange={(v) => v && setNewDate(v)} />
              ) : (
                <>
                  <ChipSelect label="Increment type" options={INCREMENT_TYPES} value={hikeType} onChange={setHikeType} />
                  <TextField
                    label={hikeType === "PERCENTAGE" ? "Increment (%)" : "Increment amount (₹)"}
                    value={hikeValue}
                    onChangeText={setHikeValue}
                    keyboardType="decimal-pad"
                  />
                  <SwitchField label="Also save as this employee's policy" hint="Future increments will use this value too." value={updatePolicy} onChange={setUpdatePolicy} />
                </>
              )}
              <TextField label="Notes" value={editNotes} onChangeText={setEditNotes} multiline placeholder="Optional" />
              <ErrorBanner message={editError} style={{ marginTop: 12 }} />
              <PrimaryButton title="Save" onPress={submitEdit} loading={saving} style={{ marginTop: 16 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryCell: { flex: 1, backgroundColor: colors.card, borderRadius: radii.md, paddingVertical: 10, alignItems: "center", ...shadow.card },
  summaryValue: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  summaryLabel: { fontSize: 10, fontFamily: fonts.medium, color: colors.muted, marginTop: 2, textAlign: "center" },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, marginBottom: 10, ...shadow.card },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  salaryRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  salary: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  notes: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6, fontStyle: "italic" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 32, maxHeight: "85%" },
  sheetTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
});
