import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Linking, Alert, Modal, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { TextField, formatDisplayDate, formatMoney } from "../../components/Form";
import { WEB_APP_URL } from "../../config";
import type { OrganizationInfo, Plan } from "../../types";

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statLine}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** Current plan, the plan catalogue and upgrades. Payment itself happens in
 * the web dashboard's Razorpay checkout (opened in the browser), so the app
 * never handles card details. */
export default function PlansBillingScreen() {
  const { user } = useAuth();
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [yearly, setYearly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [salesPlan, setSalesPlan] = useState<Plan | null>(null);
  const [lead, setLead] = useState({ full_name: "", company_email: "", phone: "", job_title: "", message: "" });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [orgRes, plansRes] = await Promise.all([api.get<OrganizationInfo>("/organizations/me/"), api.get("/plans/").catch(() => null)]);
      setOrg(orgRes.data);
      if (plansRes) setPlans(unwrapList<Plan>(plansRes.data).filter((p) => p.is_active));
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load plan details. Your account may not be linked to an organization."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const openCheckout = () =>
    Alert.alert("Continue in browser", "Plans are paid securely through the ZuperHR web dashboard. Sign in there with the same account to complete checkout.", [
      { text: "Cancel", style: "cancel" },
      { text: "Open", onPress: () => Linking.openURL(`${WEB_APP_URL}/plans`) },
    ]);

  const openSales = (p: Plan) => {
    setLead({
      full_name: user?.full_name || "",
      company_email: user?.email || org?.email || "",
      phone: org?.phone || "",
      job_title: "",
      message: `I want to enquire about the ${p.name} plan.`,
    });
    setSalesPlan(p);
  };

  const sendLead = async () => {
    if (!salesPlan) return;
    if (!lead.full_name.trim() || !lead.company_email.trim()) {
      Alert.alert("Missing details", "Enter your name and email.");
      return;
    }
    setSending(true);
    try {
      await api.post("/sales-leads/", { ...lead, company_name: org?.name || "", website: org?.website || "", plan_name: salesPlan.name });
      setSalesPlan(null);
      Alert.alert("Thanks!", "Our sales team will contact you shortly.");
    } catch (err) {
      Alert.alert("Could not send", extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const planTone = org?.is_plan_expired ? "danger" : org?.is_plan_expiring_soon ? "warning" : "success";
  const currentPlan = plans.find((p) => p.name.toLowerCase() === (org?.plan_name || "").toLowerCase());

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
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
          <StatLine label="Employee limit" value={org.max_employees ?? "Unlimited"} />
          {currentPlan?.included_employees ? <StatLine label="Included in price" value={`${currentPlan.included_employees} employees`} /> : null}
          <StatLine label="Plan expires" value={org.plan_expires_at ? formatDisplayDate(org.plan_expires_at) : "-"} />
          {org.days_until_plan_expiry !== null && <StatLine label="Days remaining" value={org.days_until_plan_expiry} />}
          {org.is_simplyjob_linked ? <StatLine label="Billed via" value="SimplyJob" /> : null}
          {org.is_plan_expired || org.is_plan_expiring_soon ? (
            <PrimaryButton title="Renew Plan" onPress={openCheckout} style={{ marginTop: 12 }} />
          ) : null}
        </Card>
      )}

      {plans.length ? (
        <>
          <View style={styles.cycleRow}>
            {[false, true].map((y) => (
              <TouchableOpacity key={String(y)} style={[styles.cycleBtn, yearly === y && styles.cycleBtnOn]} onPress={() => setYearly(y)}>
                <Text style={[styles.cycleText, yearly === y && styles.cycleTextOn]}>{y ? "Yearly" : "Monthly"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {plans.map((p) => {
            const isCurrent = p.name.toLowerCase() === (org?.plan_name || "").toLowerCase();
            const overage = org?.is_simplyjob_linked ? p.simplyjob_overage_price_per_employee : p.direct_overage_price_per_employee;
            return (
              <View key={p.id} style={[styles.plan, p.is_popular && styles.planPopular]}>
                <View style={styles.headerRow}>
                  <Text style={[styles.planName, { flex: 1 }]}>{p.name}</Text>
                  {p.badge_text ? <Badge label={p.badge_text} tone="primary" /> : null}
                  {isCurrent ? <Badge label="Current" tone="success" /> : null}
                </View>
                {p.description ? <Text style={styles.desc}>{p.description}</Text> : null}
                {p.requires_contact_sales ? (
                  <Text style={styles.price}>Custom pricing</Text>
                ) : (
                  <Text style={styles.price}>
                    {formatMoney(yearly ? p.yearly_price : p.monthly_price)}
                    <Text style={styles.per}> / {yearly ? "year" : "month"}</Text>
                  </Text>
                )}
                <Text style={styles.desc}>
                  Up to {p.max_employees} employees{p.included_employees ? ` · ${p.included_employees} included` : ""}
                  {overage != null && Number(overage) > 0 ? ` · ${formatMoney(overage)}/extra employee` : ""}
                </Text>
                {(p.features_list || []).slice(0, 6).map((f) => (
                  <View key={f} style={styles.feature}>
                    <Feather name="check" size={13} color={colors.primary} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
                {p.requires_contact_sales ? (
                  <PrimaryButton title="Contact Sales" variant="outline" onPress={() => openSales(p)} style={{ marginTop: 12 }} />
                ) : !isCurrent ? (
                  <PrimaryButton title={`Choose ${p.name}`} onPress={openCheckout} style={{ marginTop: 12 }} />
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}

      <Modal visible={!!salesPlan} transparent animationType="slide" onRequestClose={() => setSalesPlan(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSalesPlan(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Contact Sales · {salesPlan?.name}</Text>
              <TextField label="Your name" required value={lead.full_name} onChangeText={(v) => setLead((l) => ({ ...l, full_name: v }))} />
              <TextField label="Work email" required value={lead.company_email} onChangeText={(v) => setLead((l) => ({ ...l, company_email: v }))} keyboardType="email-address" autoCapitalize="none" />
              <TextField label="Phone" value={lead.phone} onChangeText={(v) => setLead((l) => ({ ...l, phone: v }))} keyboardType="phone-pad" />
              <TextField label="Job title" value={lead.job_title} onChangeText={(v) => setLead((l) => ({ ...l, job_title: v }))} />
              <TextField label="Message" value={lead.message} onChangeText={(v) => setLead((l) => ({ ...l, message: v }))} multiline />
              <PrimaryButton title="Send Enquiry" onPress={sendLead} loading={sending} style={{ marginTop: 16 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconWrap: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: "#e6f7f1", alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  orgName: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  statLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  statLabel: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
  statValue: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.text },
  cycleRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radii.md, padding: 4, marginTop: 24, marginBottom: 12 },
  cycleBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radii.sm },
  cycleBtnOn: { backgroundColor: colors.card },
  cycleText: { fontFamily: fonts.semiBold, color: colors.muted, fontSize: 13 },
  cycleTextOn: { color: colors.primaryDark },
  plan: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  planPopular: { borderColor: colors.primary, borderWidth: 2 },
  desc: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
  price: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, marginTop: 10 },
  per: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
  feature: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  featureText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: colors.text },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 32, maxHeight: "90%" },
  sheetTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
});
