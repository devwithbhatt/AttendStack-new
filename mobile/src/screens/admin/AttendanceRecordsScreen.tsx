import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { extractErrorMessage, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ChipSelect, DateField, Fab, SearchBar, formStyles, formatDisplayDate, todayISO } from "../../components/Form";
import { ATTENDANCE_STATUSES, MONTHS } from "../../constants";
import { hasModulePermission, type AdminAttendanceRecord } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function formatClock(value: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

const STATUS_FILTERS = [{ value: "", label: "All" }, ...ATTENDANCE_STATUSES];

/** Every employee's attendance for one day, or a whole month — the mobile
 * version of the web "Attendance Records" page. */
export default function AttendanceRecordsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "attendance", "edit");

  const now = new Date();
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(todayISO());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError("");
    const params: Record<string, unknown> =
      mode === "day" ? { date_from: day, date_to: day } : { year, month };
    if (status) params.status = status;
    if (debouncedSearch) params.search = debouncedSearch;
    try {
      const rows = await fetchAll<AdminAttendanceRecord>("/attendance/", params);
      rows.sort((a, b) => (a.date === b.date ? a.employee_name.localeCompare(b.employee_name) : b.date.localeCompare(a.date)));
      setRecords(rows);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [mode, day, month, year, status, debouncedSearch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  };

  const header = (
    <View style={{ paddingBottom: 6 }}>
      <View style={styles.modeRow}>
        {(["day", "month"] as const).map((m) => (
          <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.modeBtnActive]} onPress={() => setMode(m)}>
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{m === "day" ? "Day" : "Month"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === "day" ? (
        <DateField label="Date" value={day} onChange={(v) => v && setDay(v)} />
      ) : (
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={10}>
            <Feather name="chevron-left" size={22} color={colors.primaryDark} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {MONTHS[month - 1]} {year}
          </Text>
          <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={10}>
            <Feather name="chevron-right" size={22} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
      )}
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search employee name, ID or email" style={{ marginTop: 12 }} />
      <View style={{ marginTop: 10 }}>
        <ChipSelect scroll options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </View>
      <Text style={styles.count}>
        {records.length} record{records.length === 1 ? "" : "s"}
      </Text>
    </View>
  );

  return (
    <View style={formStyles.screen}>
      <FlatList
        data={loading ? [] : records}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {header}
            <ErrorBanner message={error} style={{ marginBottom: 10 }} />
            {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} /> : null}
          </>
        }
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
          loading ? null : (
            <View style={formStyles.empty}>
              <Feather name="calendar" size={28} color={colors.muted} />
              <Text style={formStyles.emptyText}>No attendance records for this selection.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={formStyles.listRow}
            activeOpacity={0.7}
            disabled={!canEdit}
            onPress={() => navigation.navigate("AttendanceRecordForm", { record: item })}
          >
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={formStyles.rowTitle}>{item.employee_name}</Text>
                <Text style={formStyles.rowMeta}>
                  {item.employee_id}
                  {mode === "month" ? ` · ${formatDisplayDate(item.date)}` : ""}
                </Text>
              </View>
              <StatusBadge status={item.status} label={item.status_label} />
            </View>
            <View style={styles.times}>
              <Text style={styles.time}>
                <Feather name="log-in" size={12} color={colors.muted} /> {formatClock(item.check_in)}
              </Text>
              <Text style={styles.time}>
                <Feather name="log-out" size={12} color={colors.muted} /> {formatClock(item.check_out)}
              </Text>
              <Text style={styles.time}>{item.total_hours ? `${item.total_hours} h` : ""}</Text>
            </View>
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
          </TouchableOpacity>
        )}
      />
      {canEdit ? <Fab onPress={() => navigation.navigate("AttendanceRecordForm", { date: mode === "day" ? day : undefined })} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radii.md, padding: 4 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radii.sm },
  modeBtnActive: { backgroundColor: colors.card },
  modeText: { fontFamily: fonts.semiBold, color: colors.muted, fontSize: 13 },
  modeTextActive: { color: colors.primaryDark },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingHorizontal: 4 },
  monthText: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  count: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted, marginTop: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  times: { flexDirection: "row", gap: 18, marginTop: 10 },
  time: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  notes: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
});
