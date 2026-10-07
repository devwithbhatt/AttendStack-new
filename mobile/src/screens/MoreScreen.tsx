import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { colors, fonts, radii, shadow } from "../theme";
import { Badge } from "../components/Badge";
import { PrimaryButton } from "../components/PrimaryButton";
import { hasModulePermission, isFullAdmin } from "../types";
import type { RootStackParamList } from "../navigation/types";

type FeatherName = React.ComponentProps<typeof Feather>["name"];
type Nav = NativeStackNavigationProp<RootStackParamList>;

function MenuRow({ icon, label, sub, onPress }: { icon: FeatherName; label: string; sub?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={17} color={colors.primaryDark} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout } = useAuth();
  const { companyName, logoUrl } = useBranding();
  const admin = isFullAdmin(user);
  const canViewEmployees = hasModulePermission(user, "employees", "view");
  const canViewTasks = hasModulePermission(user, "tasks", "view");
  const canViewAttendance = hasModulePermission(user, "attendance", "view");
  const canViewPayroll = hasModulePermission(user, "payroll", "view");
  const canViewHolidays = hasModulePermission(user, "holidays", "edit");
  // Full admins already have a Leaves tab; managers reach approvals from here.
  const canReviewLeaves = !admin && hasModulePermission(user, "leaves", "view");

  // Exactly what the web dashboard grants this account, module by module.
  const companyRows: Array<React.ComponentProps<typeof MenuRow>> = [];
  if (canViewAttendance) {
    companyRows.push({ icon: "clock", label: "Today's Attendance", sub: "Who's in, who's absent", onPress: () => navigation.navigate("AttendanceOverview") });
    companyRows.push({ icon: "calendar", label: "Attendance Records", sub: "Any day or month · mark & correct", onPress: () => navigation.navigate("AttendanceRecords") });
  }
  if (canReviewLeaves) {
    companyRows.push({ icon: "file-text", label: "Leave Approvals", sub: "Review team leave requests", onPress: () => navigation.navigate("LeaveApprovals") });
  }
  if (canViewEmployees) {
    companyRows.push({ icon: "users", label: "Employees", sub: "Browse by role", onPress: () => navigation.navigate("EmployeeCategories") });
  }
  if (canViewPayroll) {
    companyRows.push({ icon: "dollar-sign", label: "Payroll", sub: "Generate, review & mark paid", onPress: () => navigation.navigate("AdminPayroll") });
    companyRows.push({ icon: "trending-up", label: "Salary Increments", sub: "Approve, reschedule or edit hikes", onPress: () => navigation.navigate("Increments") });
  }
  if (canViewHolidays) {
    companyRows.push({ icon: "gift", label: "Manage Holidays", sub: "Add, edit or remove holidays", onPress: () => navigation.navigate("Holidays") });
  }
  if (canViewTasks) {
    companyRows.push({ icon: "briefcase", label: "Projects", sub: "View all projects & progress", onPress: () => navigation.navigate("Projects") });
  }
  if (admin) {
    companyRows.push({ icon: "credit-card", label: "Plans & Billing", onPress: () => navigation.navigate("PlansBilling") });
  }
  const canSettings =
    hasModulePermission(user, "settings", "view") || hasModulePermission(user, "subadmins", "view") || user?.role === "HR" || user?.role === "SUPER_ADMIN";
  if (canSettings) {
    companyRows.push({ icon: "settings", label: "Settings", sub: "Company, attendance rules, shifts, roles & more", onPress: () => navigation.navigate("SettingsHome") });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      {companyName ? (
        <View style={styles.companyRow}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.companyLogo} resizeMode="contain" />
          ) : (
            <View style={styles.companyLogoFallback}>
              <Feather name="briefcase" size={18} color={colors.primaryDark} />
            </View>
          )}
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.companyLabel}>Company</Text>
            <Text style={styles.companyName} numberOfLines={1}>{companyName}</Text>
          </View>
        </View>
      ) : null}

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.first_name?.[0] || "?").toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.name}>{user?.full_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
            <Badge label={user?.custom_role_title || user?.role || ""} tone="primary" />
          </View>
        </View>
      </LinearGradient>

      <Text style={styles.sectionTitle}>Workspace</Text>
      <View style={styles.card}>
        <MenuRow icon="calendar" label="Attendance History" onPress={() => navigation.navigate("AttendanceHistory")} />
        <View style={styles.divider} />
        <MenuRow icon="dollar-sign" label="My Salary" onPress={() => navigation.navigate("Payroll")} />
        <View style={styles.divider} />
        <MenuRow icon="gift" label="Holidays" onPress={() => navigation.navigate("Holidays")} />
        <View style={styles.divider} />
        <MenuRow icon="book-open" label="Company Rulebook" onPress={() => navigation.navigate("Rulebook")} />
      </View>

      {companyRows.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Company</Text>
          <View style={styles.card}>
            {companyRows.map((row, i) => (
              <React.Fragment key={row.label}>
                {i > 0 && <View style={styles.divider} />}
                <MenuRow {...row} />
              </React.Fragment>
            ))}
          </View>
        </>
      )}

      <PrimaryButton title="Log Out" onPress={logout} variant="outline" style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 14,
    ...shadow.card,
  },
  companyLogo: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
  },
  companyLogoFallback: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  companyLabel: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  companyName: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.text,
    marginTop: 2,
  },
  hero: {
    borderRadius: radii.xl,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    ...shadow.card,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  avatarText: { color: "#fff", fontSize: 22, fontFamily: fonts.bold },
  name: { fontSize: 16, fontFamily: fonts.bold, color: "#fff" },
  email: { fontSize: 12, fontFamily: fonts.regular, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginBottom: 24,
    ...shadow.card,
  },
  row: { flexDirection: "row", alignItems: "center", padding: 14 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: "#e6f7f1",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  rowSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 62 },
});
