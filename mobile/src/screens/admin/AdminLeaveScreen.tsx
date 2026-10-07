import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { colors, fonts, radii, shadow, softTone } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
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
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("PENDING");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/attendance/leaves/");
      setLeaves(unwrapList<LeaveRequest>(response.data));
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

  const act = async (id: string, status: "APPROVED" | "REJECTED") => {
    setActingId(id);
    setError("");
    try {
      await api.patch(`/attendance/leaves/${id}/`, { status });
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update this leave request."));
    } finally {
      setActingId(null);
    }
  };

  const filtered = filter === "ALL" ? leaves : leaves.filter((l) => l.status === filter);
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
              style={[
                styles.filterChip,
                active && { backgroundColor: primaryTone.text, borderColor: primaryTone.text },
              ]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.name}>{item.employee_name}</Text>
              <StatusBadge status={item.status} label={item.status_label} />
            </View>
            <Text style={styles.type}>{item.leave_type_label}</Text>
            <Text style={styles.dates}>
              {item.start_date} â†’ {item.end_date}
            </Text>
            {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}

            {/* Nobody approves their own leave — the backend refuses it too. */}
            {item.status === "PENDING" && canDecide && item.employee_id !== user?.employee_id && (
              <View style={styles.actionsRow}>
                <PrimaryButton
                  title="Approve"
                  onPress={() => act(item.id, "APPROVED")}
                  loading={actingId === item.id}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Reject"
                  onPress={() => act(item.id, "REJECTED")}
                  loading={actingId === item.id}
                  variant="danger"
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  filterChipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text },
  filterChipTextActive: { color: "#fff", fontFamily: fonts.semiBold },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, marginBottom: 10, ...shadow.card },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  type: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginTop: 6 },
  dates: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  reason: { fontSize: 13, fontFamily: fonts.regular, color: colors.text, marginTop: 6 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
});
