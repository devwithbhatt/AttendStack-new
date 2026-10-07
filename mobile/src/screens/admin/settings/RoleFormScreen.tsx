import React, { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Text, StyleSheet } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { colors, fonts } from "../../../theme";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { FormSection, SwitchField, TextField, formStyles } from "../../../components/Form";
import { PermissionMatrix, type Matrix, type ModuleInfo } from "../../../components/PermissionMatrix";
import { isFullAdmin } from "../../../types";
import type { RootStackParamList } from "../../../navigation/types";

type Route = RouteProp<RootStackParamList, "RoleForm">;

export default function RoleFormScreen() {
  const navigation = useNavigation();
  const role = useRoute<Route>().params?.role;
  const { user } = useAuth();
  const fullAdmin = isFullAdmin(user);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [isAdmin, setIsAdmin] = useState(Boolean(role?.is_admin));
  const [matrix, setMatrix] = useState<Matrix>(role?.permissions || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: role ? `Edit ${role.name}` : "New Role" });
  }, [navigation, role]);

  useEffect(() => {
    api
      .get<ModuleInfo[]>("/roles/modules/")
      .then((r) => setModules(r.data))
      .catch(() => setError("Could not load the module list."));
  }, []);

  const save = async () => {
    setError("");
    if (name.trim().length < 2) return setError("Role name must be at least 2 characters.");
    setSaving(true);
    const body = { name: name.trim(), description: description.trim(), is_admin: isAdmin, permissions: matrix };
    try {
      if (role) await api.patch(`/roles/${role.id}/`, body);
      else await api.post("/roles/", body);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the role."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <FormSection title="Role">
        <TextField label="Role name" required value={name} onChangeText={setName} placeholder="e.g. Floor Manager" />
        <TextField label="Description" value={description} onChangeText={setDescription} multiline />
        {fullAdmin ? (
          <SwitchField label="Full access (Admin)" hint="Every module, including Settings — and they'll need email 2FA to sign in." value={isAdmin} onChange={setIsAdmin} />
        ) : null}
      </FormSection>
      {!isAdmin ? (
        <FormSection title="Module Permissions">
          {!fullAdmin ? <Text style={styles.note}>You can only grant access your own role has.</Text> : null}
          <PermissionMatrix modules={modules} value={matrix} onChange={setMatrix} />
        </FormSection>
      ) : null}
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={role ? "Save Role" : "Create Role"} onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 8 },
});
