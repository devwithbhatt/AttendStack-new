import React, { useEffect, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { colors, fonts, radii } from "../../../theme";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { ChipSelect, FormSection, MultiChipSelect, SwitchField, TextField, TimeField, formStyles } from "../../../components/Form";
import { hasModulePermission } from "../../../types";
import { SETTINGS_SECTIONS, type SettingField } from "./settingsSpec";
import type { RootStackParamList } from "../../../navigation/types";

type Route = RouteProp<RootStackParamList, "SettingsSection">;
type Raw = Record<string, unknown>;

/** Turn an API value into what the input holds (strings for text inputs). */
function toInput(field: SettingField, value: unknown): unknown {
  if (field.type === "switch") return Boolean(value);
  if (field.type === "multi") return Array.isArray(value) ? value : [];
  if (value === null || value === undefined) return "";
  if (field.type === "decimal") return String(Number(value));
  return String(value);
}

/** And back, keeping the API's original type (numbers stay numbers). */
function toApi(field: SettingField, input: unknown, original: unknown): unknown {
  if (field.type === "switch" || field.type === "multi") return input;
  const text = String(input ?? "").trim();
  if (field.type === "number" || field.type === "decimal") return text === "" ? null : Number(text);
  if (field.type === "choice" && typeof original === "number") return Number(text);
  return text;
}

export default function SettingsSectionScreen() {
  const navigation = useNavigation();
  const { section: sectionKey } = useRoute<Route>().params;
  const section = SETTINGS_SECTIONS.find((s) => s.key === sectionKey)!;
  const fields = section.groups.flatMap((g) => g.fields);
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "settings", "edit");

  const [original, setOriginal] = useState<Raw>({});
  const [values, setValues] = useState<Raw>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: section.title });
  }, [navigation, section]);

  const apply = (data: Raw) => {
    setOriginal(data);
    setValues(Object.fromEntries(fields.map((f) => [f.key, toInput(f, data[f.key])])));
    setLogo((data.company_logo as string) || null);
  };

  useEffect(() => {
    api
      .get<Raw>("/settings/")
      .then((res) => apply(res.data))
      .catch((err) => setError(extractErrorMessage(err, "Could not load settings.")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: string) => (v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    setError("");
    const changes: Raw = {};
    for (const f of fields) {
      const next = toApi(f, values[f.key], original[f.key]);
      if ((f.type === "number" || f.type === "decimal") && next !== null && Number.isNaN(next as number)) {
        setError(`${f.label} must be a number.`);
        return;
      }
      const before = toApi(f, toInput(f, original[f.key]), original[f.key]);
      if (JSON.stringify(next) !== JSON.stringify(before)) changes[f.key] = next;
    }
    if (Object.keys(changes).length === 0) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch<Raw>("/settings/", changes);
      apply(data);
      Alert.alert("Saved", `${section.title} updated.`);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  };

  // ---- Mobile extras ----

  const useCurrentLocation = async () => {
    setBusy("location");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "Allow location access to use your current position as the office.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setValues((prev) => ({
        ...prev,
        office_latitude: pos.coords.latitude.toFixed(6),
        office_longitude: pos.coords.longitude.toFixed(6),
      }));
    } catch {
      Alert.alert("Couldn't get your location", "Try again outdoors or with location services on.");
    } finally {
      setBusy("");
    }
  };

  const addMyIp = async () => {
    setBusy("ip");
    try {
      const { data } = await api.get<{ client_ip?: string }>("/attendance/my-ip/");
      const ip = data.client_ip;
      if (!ip) throw new Error();
      const current = String(values.allowed_ip_ranges || "");
      if (!current.split(",").map((s) => s.trim()).includes(ip)) {
        setValues((prev) => ({ ...prev, allowed_ip_ranges: current.trim() ? `${current.trim()}, ${ip}` : ip }));
      }
      Alert.alert("IP added", `${ip} — this is the network your phone is on right now. Save to apply.`);
    } catch {
      Alert.alert("Couldn't detect your IP", "Check your connection and try again.");
    } finally {
      setBusy("");
    }
  };

  const changeLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    setBusy("logo");
    try {
      const body = new FormData();
      body.append("company_logo", { uri: asset.uri, name: asset.fileName || `logo_${Date.now()}.png`, type: asset.mimeType || "image/png" } as unknown as Blob);
      const { data } = await api.patch<Raw>("/settings/", body, { headers: { "Content-Type": "multipart/form-data" } });
      setLogo((data.company_logo as string) || null);
    } catch (err) {
      Alert.alert("Could not upload logo", extractErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const renderField = (f: SettingField) => {
    if (f.showIf && !values[f.showIf]) return null;
    const v = values[f.key];
    switch (f.type) {
      case "switch":
        return <SwitchField key={f.key} label={f.label} hint={f.hint} value={Boolean(v)} onChange={set(f.key)} />;
      case "time":
        return <TimeField key={f.key} label={f.label} value={String(v || "")} onChange={set(f.key)} />;
      case "choice":
        return <ChipSelect key={f.key} label={f.label} hint={f.hint} options={f.options || []} value={String(v ?? "")} onChange={set(f.key)} />;
      case "multi":
        return <MultiChipSelect key={f.key} label={f.label} hint={f.hint} options={f.options || []} values={(v as string[]) || []} onChange={set(f.key)} />;
      default:
        return (
          <TextField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={String(v ?? "")}
            onChangeText={set(f.key)}
            multiline={f.type === "textarea"}
            autoCapitalize={["email", "url"].includes(f.type) ? "none" : undefined}
            keyboardType={
              f.type === "number" ? "number-pad" : f.type === "decimal" ? "decimal-pad" : f.type === "email" ? "email-address" : f.type === "phone" ? "phone-pad" : f.type === "url" ? "url" : "default"
            }
            editable={canEdit}
          />
        );
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
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      {!canEdit ? <Text style={styles.readOnly}>View only — your role can't change settings.</Text> : null}

      {sectionKey === "company" ? (
        <TouchableOpacity style={styles.logoRow} onPress={changeLogo} disabled={!canEdit || busy === "logo"}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" /> : <View style={[styles.logo, styles.logoEmpty]}><Feather name="image" size={22} color={colors.primaryDark} /></View>}
          <Text style={styles.logoText}>{busy === "logo" ? "Uploading…" : canEdit ? (logo ? "Change logo" : "Upload logo") : "Company logo"}</Text>
        </TouchableOpacity>
      ) : null}

      <View pointerEvents={canEdit ? "auto" : "none"}>
        {section.groups.map((g) => (
          <FormSection key={g.title} title={g.title}>
            {g.fields.map(renderField)}
            {sectionKey === "location" && g.title === "Geofencing" && values.geofencing_enabled ? (
              <TouchableOpacity style={styles.extra} onPress={useCurrentLocation} disabled={busy === "location"}>
                <Feather name="crosshair" size={15} color={colors.primaryDark} />
                <Text style={styles.extraText}>{busy === "location" ? "Locating…" : "Use my current location as the office"}</Text>
              </TouchableOpacity>
            ) : null}
            {sectionKey === "location" && g.title === "Office Network" ? (
              <TouchableOpacity style={styles.extra} onPress={addMyIp} disabled={busy === "ip"}>
                <Feather name="wifi" size={15} color={colors.primaryDark} />
                <Text style={styles.extraText}>{busy === "ip" ? "Detecting…" : "Add the network I'm on now"}</Text>
              </TouchableOpacity>
            ) : null}
          </FormSection>
        ))}
      </View>

      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      {canEdit ? <PrimaryButton title="Save Changes" onPress={save} loading={saving} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  readOnly: { fontSize: 12, fontFamily: fonts.medium, color: colors.warningSoftText, marginBottom: 12 },
  logoRow: { alignItems: "center", marginBottom: 16 },
  logo: { width: 96, height: 96, borderRadius: radii.lg, backgroundColor: "#fff" },
  logoEmpty: { backgroundColor: "#e6f7f1", alignItems: "center", justifyContent: "center" },
  logoText: { marginTop: 8, fontFamily: fonts.semiBold, fontSize: 13, color: colors.primaryDark },
  extra: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: "#e6f7f1" },
  extraText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.primaryDark },
});
