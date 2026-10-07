import React, { useCallback, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert, Linking, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Badge, StatusBadge } from "../../components/Badge";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { PromptModal, confirmAction, formStyles, formatDisplayDate, formatMoney } from "../../components/Form";
import { hasModulePermission, type EmployeeDetail, type RoleSummary } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "EmployeeDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface RoleAssignment {
  role: RoleSummary | null;
  user_role?: string;
  has_account: boolean;
}

function InfoRow({ label, value, onPress }: { label: string; value?: string | null; onPress?: () => void }) {
  const shown = value && String(value).trim() ? String(value) : "—";
  return (
    <TouchableOpacity style={styles.infoRow} disabled={!onPress} onPress={onPress} activeOpacity={0.6}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, onPress && shown !== "—" && { color: colors.primaryDark }]}>{shown}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function EmployeeDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { employeeId } = useRoute<Route>().params;
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "employees", "edit");
  const canDelete = hasModulePermission(user, "employees", "delete");

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [assignment, setAssignment] = useState<RoleAssignment | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get<EmployeeDetail>(`/employees/${employeeId}/`);
      setEmployee(data);
      if (canEdit) {
        const [assignRes, rolesRes] = await Promise.all([
          api.get<RoleAssignment>(`/employees/${employeeId}/assign-role/`).catch(() => null),
          api.get("/roles/", { params: { page_size: 100 } }).catch(() => null),
        ]);
        if (assignRes) setAssignment(assignRes.data);
        if (rolesRes) setRoles(unwrapList<RoleSummary>(rolesRes.data));
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load this employee."));
    }
  }, [employeeId, canEdit]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: employee?.full_name || "Employee",
      headerRight: () => (
        <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={10}>
          <Feather name="more-vertical" size={20} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, employee]);

  const assignRole = async (roleId: string | null) => {
    try {
      const { data } = await api.post(`/employees/${employeeId}/assign-role/`, { role_id: roleId });
      Alert.alert("Role updated", data?.detail || "Role updated.");
      await load();
    } catch (err) {
      Alert.alert("Could not change role", extractErrorMessage(err));
    }
  };

  const setPassword = async (password: string) => {
    setPasswordOpen(false);
    const action = employee?.account_exists ? "reset-password" : "create-password";
    try {
      const { data } = await api.post(`/employees/${employeeId}/${action}/`, password ? { password } : {});
      const temp = data?.temporary_password;
      Alert.alert(
        data?.detail || "Password saved",
        temp ? `Login: ${data.email}\nPassword: ${temp}\n\nShare this with ${employee?.full_name} securely.` : undefined
      );
      await load();
    } catch (err) {
      Alert.alert("Could not set password", extractErrorMessage(err));
    }
  };

  const deleteEmployee = () =>
    confirmAction(
      "Delete employee?",
      `${employee?.full_name} and their login account will be permanently removed. This can't be undone.`,
      "Delete",
      async () => {
        try {
          await api.delete(`/employees/${employeeId}/`);
          navigation.goBack();
        } catch (err) {
          Alert.alert("Could not delete", extractErrorMessage(err));
        }
      }
    );

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!employee) {
    return (
      <View style={[formStyles.screen, { padding: 20 }]}>
        <ErrorBanner message={error || "Employee not found."} />
      </View>
    );
  }

  const menu: ActionSheetOption[] = [];
  if (canEdit) {
    menu.push({ key: "edit", label: "Edit details", icon: "edit-2", onPress: () => navigation.navigate("EmployeeForm", { employeeId }) });
    menu.push({ key: "status", label: "Change status", icon: "activity", onPress: () => navigation.navigate("EmployeeStatus", { employeeId, name: employee.full_name }) });
    menu.push({
      key: "role",
      label: "Assign role",
      icon: "shield",
      onPress: () =>
        assignment?.has_account
          ? setRoleSheetOpen(true)
          : Alert.alert("No login account yet", "Create a login password for this employee first, then assign a role."),
    });
    menu.push({
      key: "password",
      label: employee.account_exists ? "Reset login password" : "Create login account",
      icon: "key",
      onPress: () => setPasswordOpen(true),
    });
  }
  menu.push({ key: "leave", label: "Leave balance & policy", icon: "calendar", onPress: () => navigation.navigate("EmployeeLeavePolicy", { employeeId, name: employee.full_name }) });
  if (canDelete) menu.push({ key: "delete", label: "Delete employee", icon: "trash-2", destructive: true, onPress: deleteEmployee });

  const roleOptions: ActionSheetOption[] = [
    { key: "none", label: "Plain employee (no role)", icon: "user", onPress: () => assignRole(null) },
    ...roles.map((r) => ({ key: r.id, label: r.is_admin ? `${r.name} · Full access` : r.name, icon: "shield" as const, onPress: () => assignRole(r.id) })),
  ];

  const open = (url: string | null) => url && Linking.openURL(url);
  const status = employee.status_end_date
    ? `${employee.status_label} until ${formatDisplayDate(employee.status_end_date)}${employee.auto_transition_status_label ? `, then ${employee.auto_transition_status_label}` : ""}`
    : employee.status_label;

  return (
    <View style={formStyles.screen}>
      <ScrollView
        contentContainerStyle={formStyles.content}
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
        <ErrorBanner message={error} style={{ marginBottom: 12 }} />
        <View style={styles.hero}>
          {employee.profile_photo_url ? (
            <Image source={{ uri: employee.profile_photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.avatarText}>{(employee.full_name[0] || "?").toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.name}>{employee.full_name}</Text>
            <Text style={styles.meta}>
              {employee.employee_id} · {employee.designation || "—"}
            </Text>
            <View style={styles.badges}>
              <StatusBadge status={employee.status} label={employee.status_label} />
              {assignment?.role ? <Badge label={assignment.role.name} tone="primary" /> : null}
              {!employee.account_exists ? <Badge label="No login" tone="warning" /> : null}
            </View>
          </View>
        </View>

        <Section title="Employment">
          <InfoRow label="Status" value={status} />
          <InfoRow label="Department" value={employee.department} />
          <InfoRow label="Designation" value={employee.designation} />
          <InfoRow label="Employment type" value={employee.employment_type_label} />
          <InfoRow label="Joining date" value={formatDisplayDate(employee.joining_date)} />
          <InfoRow label="Shift" value={employee.shift_name || "Company default"} />
          <InfoRow label="Reporting manager" value={employee.reporting_manager} />
        </Section>

        <Section title="Contact">
          <InfoRow label="Email" value={employee.email} onPress={() => Linking.openURL(`mailto:${employee.email}`)} />
          <InfoRow label="Phone" value={employee.phone} onPress={employee.phone ? () => Linking.openURL(`tel:${employee.phone}`) : undefined} />
          <InfoRow label="Date of birth" value={employee.date_of_birth ? formatDisplayDate(employee.date_of_birth) : null} />
          <InfoRow label="Address" value={employee.address} />
          <InfoRow label="Aadhaar" value={employee.aadhaar_number} />
        </Section>

        <Section title="Compensation">
          <InfoRow label="Annual salary" value={employee.annual_salary ? formatMoney(employee.annual_salary) : null} />
          <InfoRow label="Pay frequency" value={employee.pay_frequency_label} />
          <InfoRow label="Increments" value={employee.increment_status === "DISABLED" ? "Disabled" : employee.override_increment_policy ? "Custom policy" : "Company policy"} />
          <InfoRow label="Last increment" value={employee.last_increment_date ? formatDisplayDate(employee.last_increment_date) : null} />
          <InfoRow label="Next increment" value={employee.next_increment_date ? formatDisplayDate(employee.next_increment_date) : null} />
        </Section>

        <Section title="Bank & Tax">
          <InfoRow label="Bank" value={employee.bank_name} />
          <InfoRow label="Account number" value={employee.bank_account_number} />
          <InfoRow label="IFSC" value={employee.ifsc_code} />
          <InfoRow label="Tax ID / PAN" value={employee.tax_id} />
          <InfoRow label="PAN number" value={employee.pan_number} />
          <InfoRow label="PF number" value={employee.pf_number} />
          <InfoRow label="UAN" value={employee.uan_number} />
          <InfoRow label="ESIC" value={employee.esic_number} />
        </Section>

        <Section title="Emergency Contact">
          <InfoRow label="Name" value={employee.emergency_contact_name} />
          <InfoRow label="Relationship" value={employee.emergency_contact_relationship} />
          <InfoRow
            label="Phone"
            value={employee.emergency_contact_phone}
            onPress={employee.emergency_contact_phone ? () => Linking.openURL(`tel:${employee.emergency_contact_phone}`) : undefined}
          />
        </Section>

        <Section title="Documents">
          <InfoRow label="Aadhaar" value={employee.aadhaar_document_url ? "View" : null} onPress={employee.aadhaar_document_url ? () => open(employee.aadhaar_document_url) : undefined} />
          <InfoRow label="PAN card" value={employee.pan_card_document_url ? "View" : null} onPress={employee.pan_card_document_url ? () => open(employee.pan_card_document_url) : undefined} />
          <InfoRow label="CV" value={employee.cv_document_url ? "View" : null} onPress={employee.cv_document_url ? () => open(employee.cv_document_url) : undefined} />
        </Section>
      </ScrollView>

      <ActionSheet visible={menuOpen} title={employee.full_name} options={menu} onClose={() => setMenuOpen(false)} />
      <ActionSheet visible={roleSheetOpen} title="Assign a role" options={roleOptions} onClose={() => setRoleSheetOpen(false)} />
      <PromptModal
        visible={passwordOpen}
        title={employee.account_exists ? "Reset login password" : "Create login account"}
        message="Type a password, or leave it blank to generate a secure one."
        placeholder="New password (optional)"
        confirmLabel="Save"
        onSubmit={setPassword}
        onClose={() => setPasswordOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, marginBottom: 16, ...shadow.card },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarEmpty: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: fonts.bold, fontSize: 24 },
  name: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  section: { backgroundColor: colors.card, borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 14, ...shadow.card },
  sectionTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.primaryDark, marginTop: 6, marginBottom: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.surface, gap: 12 },
  infoLabel: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted },
  infoValue: { flex: 1, textAlign: "right", fontSize: 13, fontFamily: fonts.medium, color: colors.text },
});
