import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii } from "../theme";
import { AttendanceCard } from "../components/AttendanceCard";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefreshKey((k) => k + 1)} />}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.first_name?.[0] || "?").toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.greeting}>Hi, {user?.first_name || "there"} 👋</Text>
            <Text style={styles.subGreeting}>{new Date().toDateString()}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn} hitSlop={8}>
          <Feather name="log-out" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <AttendanceCard refreshKey={refreshKey} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontFamily: fonts.bold, fontSize: 17 },
  greeting: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  subGreeting: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoftBg,
    alignItems: "center",
    justifyContent: "center",
  },
});
