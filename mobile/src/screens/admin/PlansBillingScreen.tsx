import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../../api/client";
import { colors, fonts, radii, shadow, softTone } from "../../theme";
import { Badge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Card } from "../../components/Card";
import type { OrganizationInfo } from "../../types";

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statLine}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function PlansBillingScreen() {
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get<OrganizationInfo>("/organizations/me/");
      setOrg(response.data);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load plan details. Your account may not be linked to an organization."));
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

  const planTone = org?.is_plan_expired ? "danger" : org?.is_plan_expiring_soon ? "warning" : "success";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
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
    >
      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      {org && (
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Feather name="credit-card" size={20} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.planName}>{org.plan_name || "No Plan"}</Text>
              <Text style={styles.orgName}>{org.name}</Text>
            </View>
            <Badge label={org.plan_status} tone={planTone} />
          </View>

          <View style={styles.divider} />

          <StatLine label="Employees" value={`${org.active_employee_count} active / ${org.employee_count} total`} />
          <StatLine label="Employee Limit" value={org.max_employees ?? "Unlimited"} />
          <StatLine label="Plan Expires" value={org.plan_expires_at || "-"} />
          {org.days_until_plan_expiry !== null && (
            <StatLine label="Days Remaining" value={org.days_until_plan_expiry} />
          )}
        </Card>
      )}

      <Text style={styles.note}>
        Plan upgrades and billing changes are managed from the web dashboard's Plans & Billing section.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerRow: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  planName: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  orgName: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  statLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  statLabel: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
  statValue: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.text },
  note: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 20, textAlign: "center", lineHeight: 18 },
});
