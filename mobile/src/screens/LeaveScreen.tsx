import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../api/client";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import type { LeaveRequest } from "../types";
import type { RootStackParamList } from "../navigation/types";

export default function LeaveScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      <FlatList
        data={leaves}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
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
            <Feather name="file-text" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No leave requests yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.type}>{item.leave_type_label}</Text>
              <StatusBadge status={item.status} label={item.status_label} />
            </View>
            <Text style={styles.dates}>
              {item.start_date} → {item.end_date}
            </Text>
            {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
          </View>
        )}
      />
      <View style={styles.fabWrap}>
        <PrimaryButton title="+ New Leave Request" onPress={() => navigation.navigate("NewLeave")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 10,
    ...shadow.card,
  },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  type: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.text },
  dates: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
  reason: { fontSize: 13, fontFamily: fonts.regular, color: colors.text, marginTop: 8 },
  fabWrap: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
});
