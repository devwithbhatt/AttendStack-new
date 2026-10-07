import React, { useEffect, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../../api/client";
import { colors, fonts, radii } from "../../../theme";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { SearchBar, formStyles } from "../../../components/Form";
import type { EmployeeListItem } from "../../../types";
import type { RootStackParamList } from "../../../navigation/types";

type Route = RouteProp<RootStackParamList, "ShiftAssign">;

/** Put a group of active employees on one shift (same as the web dialog). */
export default function ShiftAssignScreen() {
  const navigation = useNavigation();
  const { shift } = useRoute<Route>().params;
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Assign · ${shift.name}` });
  }, [navigation, shift]);

  useEffect(() => {
    fetchAll<EmployeeListItem>("/employees/", { status: "ACTIVE" })
      .then((list) => {
        setEmployees(list);
        setSelected(new Set(list.filter((e) => String(e.shift ?? "") === String(shift.id)).map((e) => e.id)));
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [shift.id]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post(`/attendance/shifts/${shift.id}/assign-employees/`, { employee_ids: Array.from(selected) });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not assign employees."));
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = employees.filter((e) => !q || e.full_name.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q));

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={formStyles.screen}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search employees" />
        <View style={styles.bulkRow}>
          <Text style={styles.count}>{selected.size} selected</Text>
          <TouchableOpacity onPress={() => setSelected(new Set([...selected, ...visible.map((e) => e.id)]))}>
            <Text style={styles.bulk}>Select shown</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelected(new Set([...selected].filter((id) => !visible.some((e) => e.id === id))))}>
            <Text style={styles.bulk}>Clear shown</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>To move someone off this shift, assign them to a different one.</Text>
        <ErrorBanner message={error} style={{ marginTop: 8 }} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <TouchableOpacity style={[styles.row, on && styles.rowOn]} onPress={() => toggle(item.id)} activeOpacity={0.7}>
              <Feather name={on ? "check-square" : "square"} size={20} color={on ? colors.primary : colors.muted} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={formStyles.rowTitle}>{item.full_name}</Text>
                <Text style={formStyles.rowMeta}>
                  {item.department || "—"} · {item.shift_name || "Default shift"}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <View style={styles.footer}>
        <PrimaryButton title={`Assign ${selected.size} employee${selected.size === 1 ? "" : "s"}`} onPress={save} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bulkRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  count: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.text },
  bulk: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.primaryDark },
  hint: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radii.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  rowOn: { borderColor: colors.primary },
  footer: { position: "absolute", left: 16, right: 16, bottom: 20 },
});
