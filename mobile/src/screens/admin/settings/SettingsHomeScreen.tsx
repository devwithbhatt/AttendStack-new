import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { colors, fonts, radii, shadow } from "../../../theme";
import { formStyles } from "../../../components/Form";
import { hasModulePermission, isFullAdmin } from "../../../types";
import { SETTINGS_SECTIONS, type SectionKey } from "./settingsSpec";
import type { RootStackParamList } from "../../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface Item {
  icon: FeatherName;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/** Everything under the web dashboard's Settings, grouped like the web tabs
 * and shown only as far as the account's permissions reach. */
export default function SettingsHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const canSettings = hasModulePermission(user, "settings", "view");
  const canRoles = hasModulePermission(user, "subadmins", "view");

  const section = (key: SectionKey): Item => {
    const s = SETTINGS_SECTIONS.find((x) => x.key === key)!;
    return { icon: s.icon as FeatherName, title: s.title, subtitle: s.subtitle, onPress: () => navigation.navigate("SettingsSection", { section: key }) };
  };

  const groups: Array<{ title: string; items: Item[] }> = [
    {
      title: "Company",
      items: [
        ...(canSettings ? [section("company"), section("locale")] : []),
        ...(isFullAdmin(user) ? [{ icon: "credit-card" as FeatherName, title: "Plans & Billing", subtitle: "Current plan, upgrades, renewals", onPress: () => navigation.navigate("PlansBilling") }] : []),
        ...(canSettings ? [{ icon: "key" as FeatherName, title: "Invite Code & Integrations", subtitle: "Invite code, API key, SimplyJob", onPress: () => navigation.navigate("Integrations") }] : []),
      ],
    },
    {
      title: "Attendance",
      items: canSettings
        ? [
            section("attendance"),
            section("location"),
            { icon: "clock" as FeatherName, title: "Shifts", subtitle: "Work shifts, default shift, assignments", onPress: () => navigation.navigate("Shifts") },
          ]
        : [],
    },
    {
      title: "People & Pay",
      items: [
        ...(canSettings ? [section("leave"), section("increment")] : []),
        ...(canRoles ? [{ icon: "shield" as FeatherName, title: "Roles & Permissions", subtitle: "Who can see and change what", onPress: () => navigation.navigate("Roles") }] : []),
      ],
    },
    {
      title: "System",
      items: [
        ...(canSettings ? [section("notifications"), section("security")] : []),
        { icon: "book-open" as FeatherName, title: "Rulebook", subtitle: "Attendance & conduct rules for everyone", onPress: () => navigation.navigate("Rulebook") },
      ],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content}>
      {groups.map((g) => (
        <View key={g.title} style={{ marginBottom: 18 }}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          <View style={styles.card}>
            {g.items.map((it, i) => (
              <TouchableOpacity key={it.title} style={[styles.row, i > 0 && styles.rowBorder]} onPress={it.onPress} activeOpacity={0.7}>
                <View style={styles.icon}>
                  <Feather name={it.icon} size={17} color={colors.primaryDark} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.title}>{it.title}</Text>
                  <Text style={styles.subtitle}>{it.subtitle}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: "#e6f7f1", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  subtitle: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
});
