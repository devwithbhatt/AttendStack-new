import React, { useCallback, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../../api/client";
import { colors } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { confirmAction, formStyles, formatDisplayDate } from "../../components/Form";
import type { EmployeeListItem } from "../../types";

/** People who signed up choosing "Join an existing company" and are waiting
 * for this company's admin to let them in. */
export default function MergeRequestsScreen() {
  const [requests, setRequests] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get<EmployeeListItem[]>("/employees/merge-requests/");
      setRequests(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const act = async (item: EmployeeListItem, approve: boolean) => {
    setActingId(item.id);
    try {
      await api.post(`/employees/${item.id}/${approve ? "approve-merge-request" : "deny-merge-request"}/`);
      if (approve) Alert.alert("Approved", `${item.full_name} has joined your company.`);
      await load();
    } catch (err) {
      Alert.alert("Could not update request", extractErrorMessage(err));
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={formStyles.screen}>
      <ErrorBanner message={error} style={{ margin: 16, marginBottom: 0 }} />
      <FlatList
        data={requests}
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
          <View style={formStyles.empty}>
            <Feather name="user-check" size={28} color={colors.muted} />
            <Text style={formStyles.emptyText}>No pending join requests.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={formStyles.listRow}>
            <Text style={formStyles.rowTitle}>{item.full_name}</Text>
            <Text style={formStyles.rowMeta}>{item.email}</Text>
            <Text style={formStyles.rowMeta}>
              {item.designation || "—"}
              {item.joining_date ? ` · requested ${formatDisplayDate(item.joining_date)}` : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <PrimaryButton title="Approve" onPress={() => act(item, true)} loading={actingId === item.id} style={{ flex: 1 }} />
              <PrimaryButton
                title="Deny"
                variant="danger"
                loading={actingId === item.id}
                style={{ flex: 1 }}
                onPress={() => confirmAction("Deny request?", `${item.full_name}'s request will be removed.`, "Deny", () => act(item, false))}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}
