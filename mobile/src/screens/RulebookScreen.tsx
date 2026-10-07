import React, { useCallback, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, radii, shadow } from "../theme";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { TextField, formStyles } from "../components/Form";
import { SimpleHtml } from "../components/SimpleHtml";
import { hasModulePermission } from "../types";

/** The company rulebook (attendance & conduct rules). Everyone can read it;
 * people with Settings edit can change it. */
export default function RulebookScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const canEdit = hasModulePermission(user, "settings", "edit");
  const [html, setHtml] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ attendance_rules?: string }>("/settings/");
      setHtml(data.attendance_rules || "");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        canEdit && !editing
          ? () => (
              <TouchableOpacity
                onPress={() => {
                  setDraft(html);
                  setEditing(true);
                }}
                hitSlop={10}
              >
                <Feather name="edit-2" size={18} color={colors.primary} />
              </TouchableOpacity>
            )
          : undefined,
    });
  }, [navigation, canEdit, editing, html]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch<{ attendance_rules?: string }>("/settings/", { attendance_rules: draft });
      setHtml(data.attendance_rules || draft);
      setEditing(false);
    } catch (err) {
      Alert.alert("Could not save", extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (editing) {
    return (
      <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>
          Formatting uses simple tags: {"<h4>Heading</h4>"}, {"<p>Paragraph</p>"}, {"<ul><li>Point</li></ul>"}, {"<strong>bold</strong>"}.
        </Text>
        <TextField label="Rulebook" value={draft} onChangeText={setDraft} multiline tall autoCapitalize="sentences" />
        <Text style={styles.previewLabel}>Preview</Text>
        <View style={styles.card}>
          <SimpleHtml html={draft} />
        </View>
        <PrimaryButton title="Save Rulebook" onPress={save} loading={saving} style={{ marginTop: 16 }} />
        <PrimaryButton title="Cancel" variant="outline" onPress={() => setEditing(false)} style={{ marginTop: 10 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={formStyles.screen}
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
      <View style={styles.card}>
        {html.trim() ? <SimpleHtml html={html} /> : <Text style={styles.empty}>No rulebook has been published yet.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 16, paddingTop: 8, ...shadow.card },
  empty: { fontSize: 13, fontFamily: fonts.medium, color: colors.muted, marginTop: 8 },
  help: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, lineHeight: 18 },
  previewLabel: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.text, marginTop: 18, marginBottom: 8 },
});
