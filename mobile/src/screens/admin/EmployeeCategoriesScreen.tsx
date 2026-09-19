import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { colors, fonts, radii, shadow } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import type { EmployeeListItem } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

interface Category {
  name: string;
  count: number;
}

export default function EmployeeCategoriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/employees/", { params: { page_size: 200 } });
      setEmployees(unwrapList<EmployeeListItem>(response.data));
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

  const categories: Category[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) {
      const key = e.designation?.trim() || "Unspecified";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [employees]);

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
      <TouchableOpacity style={styles.allRow} onPress={() => navigation.navigate("Employees", {})}>
        <View style={styles.iconWrap}>
          <Feather name="users" size={18} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name}>All Employees</Text>
          <Text style={styles.meta}>{employees.length} total</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </TouchableOpacity>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.name}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
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
            <Text style={styles.emptyText}>No employees found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("Employees", { designation: item.name })}>
            <View style={styles.iconWrap}>
              <Feather name="briefcase" size={17} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.count} employee{item.count === 1 ? "" : "s"}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  allRow: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    margin: 16,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...shadow.card,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
});
