import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii, shadow } from "../theme";
import { Badge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { hasModulePermission, type Holiday } from "../types";
import type { RootStackParamList } from "../navigation/types";

export default function HolidaysScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const canManage = hasModulePermission(user, "holidays", "edit");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/holidays/");
      setHolidays(unwrapList<Holiday>(response.data));
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
        data={holidays}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: canManage ? 100 : 16 }}
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
            <Feather name="gift" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>No holidays configured.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Feather name="gift" size={18} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.date}>
                {item.date} · {item.day}
              </Text>
            </View>
            <Badge label={item.type} tone="info" />
          </View>
        )}
      />
      {canManage && (
        <View style={styles.fabWrap}>
          <PrimaryButton title="+ Add Holiday" onPress={() => navigation.navigate("AddHoliday")} />
        </View>
      )}
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
  date: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 },
  fabWrap: { position: "absolute", bottom: 20, left: 20, right: 20 },
});
