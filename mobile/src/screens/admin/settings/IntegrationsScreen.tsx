import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Share } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { colors, fonts, radii } from "../../../theme";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { FormSection, TextField, confirmAction, formStyles } from "../../../components/Form";
import type { OrganizationInfo } from "../../../types";

/** Invite code, API key and SimplyJob — the web "API & Integrations" tab. */
export default function IntegrationsScreen() {
  const { user } = useAuth();
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [simplyjobId, setSimplyjobId] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<OrganizationInfo>("/organizations/me/");
      setOrg(data);
      setSimplyjobId(data.external_company_id || "");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${what} copied to the clipboard.`);
  };

  const regenerate = (kind: "invite-code" | "api-key") =>
    confirmAction(
      kind === "invite-code" ? "New invite code?" : "New API key?",
      kind === "invite-code"
        ? "The old code stops working. Update the new code in SimplyJob to keep employee onboarding active."
        : "The old key stops working immediately. Anything using it (like SimplyJob) must be updated.",
      "Regenerate",
      async () => {
        setBusy(kind);
        try {
          const { data } = await api.post<OrganizationInfo & { message?: string }>(`/organizations/me/regenerate-${kind}/`);
          setOrg(data);
          if (data.message) Alert.alert("Done", data.message);
        } catch (err) {
          Alert.alert("Could not regenerate", extractErrorMessage(err));
        } finally {
          setBusy("");
        }
      }
    );

  const linkSimplyJob = async () => {
    if (!org) return;
    setBusy("link");
    try {
      const { data } = await api.post<OrganizationInfo>(`/organizations/${org.id}/link-simplyjob/`, { simplyjob_org_id: simplyjobId.trim() });
      setOrg(data);
      Alert.alert("Linked", "SimplyJob organisation saved.");
    } catch (err) {
      Alert.alert("Could not link", extractErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const syncProfile = async () => {
    setBusy("sync");
    try {
      const { data } = await api.post<{ detail?: string; message?: string; synced_fields?: string[] }>("/settings/sync-simplyjob/");
      Alert.alert("SimplyJob sync", data.message || data.detail || (data.synced_fields?.length ? `Updated: ${data.synced_fields.join(", ")}` : "Company profile is up to date."));
    } catch (err) {
      Alert.alert("Could not sync", extractErrorMessage(err));
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!org) return <ErrorBanner message={error || "No company found."} style={{ margin: 16 }} />;

  const canManage = org.can_manage_invite_code;
  const isOwner = user?.role === "SUPER_ADMIN" || org.owner === user?.id;

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />

      <FormSection title="Company Invite Code">
        <Text style={styles.note}>Employees enter this code when they sign up to join {org.name}.</Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{org.invite_code}</Text>
          <TouchableOpacity onPress={() => copy(org.invite_code, "Invite code")} hitSlop={10}>
            <Feather name="copy" size={18} color={colors.primaryDark} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Share.share({ message: `Join ${org.name} on ZuperHR with invite code: ${org.invite_code}` })} hitSlop={10}>
            <Feather name="share-2" size={18} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
        {canManage ? <PrimaryButton title="Generate New Code" variant="outline" onPress={() => regenerate("invite-code")} loading={busy === "invite-code"} style={{ marginTop: 12 }} /> : null}
      </FormSection>

      {canManage && org.api_key ? (
        <FormSection title="Organisation API Key">
          <Text style={styles.note}>Used by SimplyJob and other systems to connect to your company. Keep it secret.</Text>
          <View style={styles.codeBox}>
            <Text style={[styles.code, { fontSize: 13 }]} numberOfLines={1}>
              {showKey ? org.api_key : "•".repeat(24)}
            </Text>
            <TouchableOpacity onPress={() => setShowKey((v) => !v)} hitSlop={10}>
              <Feather name={showKey ? "eye-off" : "eye"} size={18} color={colors.primaryDark} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => copy(org.api_key!, "API key")} hitSlop={10}>
              <Feather name="copy" size={18} color={colors.primaryDark} />
            </TouchableOpacity>
          </View>
          <PrimaryButton title="Regenerate API Key" variant="outline" onPress={() => regenerate("api-key")} loading={busy === "api-key"} style={{ marginTop: 12 }} />
        </FormSection>
      ) : null}

      <FormSection title="SimplyJob">
        <Text style={styles.note}>{org.is_simplyjob_linked ? "Linked — employees hired on SimplyJob can join automatically." : "Not linked yet."}</Text>
        {isOwner ? (
          <>
            <TextField label="SimplyJob organisation ID" value={simplyjobId} onChangeText={setSimplyjobId} autoCapitalize="none" />
            <PrimaryButton title="Save Link" onPress={linkSimplyJob} loading={busy === "link"} disabled={!simplyjobId.trim()} style={{ marginTop: 12 }} />
          </>
        ) : null}
        {canManage ? (
          <PrimaryButton title="Sync Company Profile from SimplyJob" variant="outline" onPress={syncProfile} loading={busy === "sync"} style={{ marginTop: 12 }} />
        ) : null}
      </FormSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 6, lineHeight: 17 },
  codeBox: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12, padding: 14, borderRadius: radii.md, backgroundColor: colors.surface },
  code: { flex: 1, fontSize: 20, fontFamily: fonts.bold, letterSpacing: 2, color: colors.text },
});
