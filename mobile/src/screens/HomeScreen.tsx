import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { api, extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "../components/Badge";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import type { TodayAttendance } from "../types";

async function getLocationSilently(): Promise<{ latitude: number; longitude: number; accuracy: number | null } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch {
    return null;
  }
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const loadToday = useCallback(async () => {
    setError("");
    try {
      const response = await api.get<TodayAttendance>("/attendance/me/today/");
      setToday(response.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadToday().finally(() => setLoading(false));
    }, [loadToday])
  );

  const handleAction = async (action: "check-in" | "check-out") => {
    setActionLoading(true);
    setError("");
    try {
      const location = await getLocationSilently();
      await api.post(`/attendance/${action}/`, location ?? {});
      await loadToday();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const canCheckIn = !today?.check_in;
  const canCheckOut = !!today?.check_in && !today?.check_out;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadToday();
            setRefreshing(false);
          }}
        />
      }
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

      <ErrorBanner message={error} style={{ marginBottom: 16 }} />

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <Text style={styles.heroLabel}>Today's Status</Text>
          <StatusBadge status={today?.status || "NOT_MARKED"} label={today?.status?.replace(/_/g, " ") || "Not marked"} />
        </View>

        <View style={styles.timesRow}>
          <View style={styles.timeBox}>
            <Feather name="log-in" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={styles.timeValue}>{formatTime(today?.check_in ?? null)}</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeBox}>
            <Feather name="log-out" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.timeLabel}>Check-out</Text>
            <Text style={styles.timeValue}>{formatTime(today?.check_out ?? null)}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ marginTop: 20 }}>
        {canCheckIn || canCheckOut ? (
          <PrimaryButton
            title={canCheckIn ? "Check In" : "Check Out"}
            onPress={() => handleAction(canCheckIn ? "check-in" : "check-out")}
            loading={actionLoading}
            variant={canCheckIn ? "primary" : "danger"}
          />
        ) : (
          <View style={styles.doneCard}>
            <Feather name="check-circle" size={18} color={colors.successSoftText} />
            <Text style={styles.doneText}>Day complete — see you tomorrow!</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
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
  heroCard: {
    borderRadius: radii.xl,
    padding: 22,
    ...shadow.card,
  },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.semiBold, fontSize: 13 },
  timesRow: { flexDirection: "row", alignItems: "center" },
  timeBox: { flex: 1, alignItems: "center" },
  timeDivider: { width: 1, height: 44, backgroundColor: "rgba(255,255,255,0.3)" },
  timeLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: fonts.medium, marginTop: 6 },
  timeValue: { color: "#fff", fontSize: 22, fontFamily: fonts.bold, marginTop: 4 },
  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.successSoftBg,
    borderWidth: 1,
    borderColor: colors.successSoftBorder,
    borderRadius: radii.md,
    paddingVertical: 16,
  },
  doneText: { color: colors.successSoftText, fontFamily: fonts.semiBold, fontSize: 14 },
});
