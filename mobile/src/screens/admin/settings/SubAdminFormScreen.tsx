import React, { useLayoutEffect, useState } from "react";
import { ScrollView, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../../api/client";
import { ErrorBanner } from "../../../components/ErrorBanner";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { FormSection, SwitchField, TextField, formStyles } from "../../../components/Form";
import { PermissionMatrix, type Matrix, type ModuleInfo } from "../../../components/PermissionMatrix";
import type { RootStackParamList } from "../../../navigation/types";

type Route = RouteProp<RootStackParamList, "SubAdminForm">;

// Sub-admin accounts use the original per-person permission set.
const SUBADMIN_MODULES: ModuleInfo[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  { key: "attendance", label: "Attendance" },
  { key: "leaves", label: "Leaves" },
  { key: "holidays", label: "Holidays" },
  { key: "payroll", label: "Payroll" },
  { key: "increments", label: "Increments" },
  { key: "tasks", label: "Projects & Tasks" },
  { key: "settings", label: "Settings" },
];

const DEFAULT_MATRIX: Matrix = {
  dashboard: { view: true, edit: false, delete: false },
  employees: { view: true, edit: true, delete: false },
  attendance: { view: true, edit: true, delete: false },
  leaves: { view: true, edit: true, delete: false },
  holidays: { view: true, edit: true, delete: false },
  payroll: { view: false, edit: false, delete: false },
  increments: { view: false, edit: false, delete: false },
  tasks: { view: true, edit: true, delete: false },
  chat: { view: true, edit: true, delete: false },
  settings: { view: false, edit: false, delete: false },
};

export default function SubAdminFormScreen() {
  const navigation = useNavigation();
  const subAdmin = useRoute<Route>().params?.subAdmin;
  const isEdit = Boolean(subAdmin);
  const [email, setEmail] = useState(subAdmin?.email || "");
  const [firstName, setFirstName] = useState(subAdmin?.first_name || "");
  const [lastName, setLastName] = useState(subAdmin?.last_name || "");
  const [phone, setPhone] = useState(subAdmin?.phone || "");
  const [title, setTitle] = useState(subAdmin?.custom_role_title || "HR Manager");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(subAdmin?.is_active !== false);
  const [matrix, setMatrix] = useState<Matrix>({ ...DEFAULT_MATRIX, ...(subAdmin?.permissions || {}) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? "Edit Sub-Admin" : "New Sub-Admin" });
  }, [navigation, isEdit]);

  const save = async () => {
    setError("");
    if (!isEdit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password && password.length < 6) return setError("Password must be at least 6 characters.");
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/accounts/sub-admins/${subAdmin!.id}/`, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          custom_role_title: title.trim() || "HR Manager",
          is_active: active,
          permissions: matrix,
        });
      } else {
        const { data } = await api.post("/accounts/sub-admins/", {
          email: email.trim().toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          custom_role_title: title.trim() || "HR Manager",
          password,
          permissions: matrix,
        });
        Alert.alert("Sub-admin created", `Login: ${data.email}\nPassword: ${data.temp_password}\n\nShare these details securely.`);
      }
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the sub-admin."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <FormSection title="Account">
        <TextField label="Email" required={!isEdit} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={!isEdit} />
        <TextField label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
        <TextField label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. HR Manager" />
        {!isEdit ? (
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="Leave blank to generate a secure one." />
        ) : (
          <SwitchField label="Active" hint="Inactive sub-admins can't sign in." value={active} onChange={setActive} />
        )}
      </FormSection>
      <FormSection title="Permissions">
        <PermissionMatrix modules={SUBADMIN_MODULES} value={matrix} onChange={setMatrix} />
      </FormSection>
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={isEdit ? "Save Changes" : "Create Sub-Admin"} onPress={save} loading={saving} />
    </ScrollView>
  );
}
