import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { api, extractErrorMessage } from "../api/client";
import { colors, fonts, radii, shadow } from "../theme";
import { StatusBadge } from "./Badge";
import { ErrorBanner } from "./ErrorBanner";
import { PrimaryButton } from "./PrimaryButton";
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

/** Today's status plus the Check In / Check Out button, for anyone with an
 * employee profile — employees, managers and admins alike. Reloads whenever
 * the host screen regains focus; bump `refreshKey` to force a reload (e.g.
 * on pull-to-refresh). */
export function AttendanceCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(true);
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
      loadToday().finally(() => setLoading(false));
    }, [loadToday, refreshKey])
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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const canCheckIn = !today?.check_in;
  const canCheckOut = !!today?.check_in && !today?.check_out;

  return (
    <View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },
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
