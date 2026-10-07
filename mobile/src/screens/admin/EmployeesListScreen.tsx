import React, { useCallback, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Image } from "react-native";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, fetchAll } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { StatusBadge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ChipSelect, Fab, SearchBar } from "../../components/Form";
import { EMPLOYEE_STATUSES } from "../../constants";
import { hasModulePermission, type EmployeeListItem } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "Employees">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_FILTERS = [{ value: "", label: "All" }, ...EMPLOYEE_STATUSES];

export default function EmployeesListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const designation = route.params?.designation;
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "employees", "edit");
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [joinRequests, setJoinRequests] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: designation || "Employees" });
  }, [navigation, designation]);

  const load = useCallback(async () => {
    setError("");
    try {
      setEmployees(await fetchAll<EmployeeListItem>("/employees/"));
      if (canEdit) {
        const merge = await api.get<EmployeeListItem[]>("/employees/merge-requests/").catch(() => null);
        setJoinRequests(merge?.data?.length ?? 0);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [canEdit]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const filtered = employees.filter((e) => {
    if (designation && (e.designation || "Unspecified") !== designation) return false;
    if (status && e.status !== status) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.full_name?.toLowerCase().includes(q) ||
      e.employee_id?.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q)
    );
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
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, ID, email or department" style={{ marginHorizontal: 16, marginTop: 12 }} />
      <View style={{ paddingLeft: 16, marginTop: 10 }}>
        <ChipSelect scroll options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </View>
      {joinRequests > 0 ? (
        <TouchableOpacity style={styles.banner} onPress={() => navigation.navigate("MergeRequests")}>
          <Feather name="user-plus" size={16} color={colors.warningSoftText} />
          <Text style={styles.bannerText}>
            {joinRequests} join request{joinRequests > 1 ? "s" : ""} waiting for approval
          </Text>
          <Feather name="chevron-right" size={16} color={colors.warningSoftText} />
        </TouchableOpacity>
      ) : null}
      <ErrorBanner message={error} style={{ marginHorizontal: 16 }} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 96 }}
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
        ListHeaderComponent={<Text style={styles.count}>{filtered.length} employee{filtered.length === 1 ? "" : "s"}</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No employees found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("EmployeeDetail", { employeeId: item.id })} activeOpacity={0.7}>
            {item.profile_photo_url ? (
              <Image source={{ uri: item.profile_photo_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.full_name?.[0] || "?").toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>
                {item.employee_id} · {item.department || "-"} · {item.designation || "-"}
              </Text>
            </View>
            <StatusBadge status={item.status} label={item.status_label} />
          </TouchableOpacity>
        )}
      />
      {canEdit ? <Fab onPress={() => navigation.navigate("EmployeeForm", {})} icon="user-plus" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoftBg,
    borderWidth: 1,
    borderColor: colors.warningSoftBorder,
  },
  bannerText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13, color: colors.warningSoftText },
  count: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted, marginBottom: 8 },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: fonts.bold },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
});
