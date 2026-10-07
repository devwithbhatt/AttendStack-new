import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../../../api/client";
import { colors, fonts, radii } from "../../../theme";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { SearchBar, formStyles } from "../../../components/Form";
import type { RootStackParamList } from "../../../navigation/types";

type Route = RouteProp<RootStackParamList, "RoleMembers">;

interface Member {
  employee_id: string;
  employee_code: string;
  full_name: string;
  email: string;
  department: string;
  has_account: boolean;
  current_role_name: string | null;
  assigned: boolean;
}

/** Tick people to give them this role; untick to make them a plain employee. */
export default function RoleMembersScreen() {
  const navigation = useNavigation();
  const { role } = useRoute<Route>().params;
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: role.name });
  }, [navigation, role]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Member[]>(`/roles/${role.id}/employees/`);
      setMembers(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [role.id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const toggle = async (m: Member) => {
    if (!m.has_account) {
      Alert.alert("No login yet", `${m.full_name} needs a login account first — create one from their employee profile.`);
      return;
    }
    setBusy(m.email);
    try {
      if (m.assigned) await api.post("/roles/unassign/", { email: m.email });
      else await api.post(`/roles/${role.id}/assign/`, { email: m.email });
      await load();
    } catch (err) {
      Alert.alert("Could not change role", extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = members
    .filter((m) => !q || m.full_name.toLowerCase().includes(q) || m.department?.toLowerCase().includes(q))
    .sort((a, b) => Number(b.assigned) - Number(a.assigned) || a.full_name.localeCompare(b.full_name));

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
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search people" />
        <Text style={styles.count}>{members.filter((m) => m.assigned).length} with this role</Text>
        <ErrorBanner message={error} style={{ marginTop: 8 }} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(m) => m.employee_id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.row, item.assigned && styles.rowOn]} onPress={() => toggle(item)} disabled={busy !== null}>
            {busy === item.email ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name={item.assigned ? "check-square" : "square"} size={20} color={item.assigned ? colors.primary : colors.muted} />
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={formStyles.rowTitle}>{item.full_name}</Text>
              <Text style={formStyles.rowMeta}>
                {item.department || "—"} · {!item.has_account ? "no login yet" : item.assigned ? "this role" : item.current_role_name || "plain employee"}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  count: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.text, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radii.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  rowOn: { borderColor: colors.primary },
});
