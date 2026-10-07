import React, { useEffect, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { api, extractErrorMessage, unwrapList } from "../../api/client";
import { colors, fonts, radii } from "../../theme";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, DateField, FormSection, SwitchField, TextField, formStyles, todayISO } from "../../components/Form";
import { pickDocument, type PickedFile } from "../chat/attachments";
import { DEPARTMENTS, EMPLOYMENT_TYPES, INCREMENT_INTERVALS, INCREMENT_TYPES, PAY_FREQUENCIES } from "../../constants";
import type { EmployeeDetail, Shift } from "../../types";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "EmployeeForm">;

const EMPTY = {
  employee_id: "",
  full_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  aadhaar_number: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  joining_date: todayISO(),
  department: "",
  designation: "",
  employment_type: "FULL_TIME",
  reporting_manager: "",
  shift: "",
  annual_salary: "",
  pay_frequency: "MONTHLY",
  bank_name: "",
  bank_account_number: "",
  ifsc_code: "",
  tax_id: "",
  pan_number: "",
  pf_number: "",
  uan_number: "",
  esic_number: "",
  custom_increment_months: "12",
  custom_increment_type: "PERCENTAGE",
  custom_increment_value: "",
};
type FormState = typeof EMPTY;

const DOCUMENTS = [
  { key: "aadhaar_document", label: "Aadhaar document", urlKey: "aadhaar_document_url" },
  { key: "pan_card_document", label: "PAN card", urlKey: "pan_card_document_url" },
  { key: "cv_document", label: "CV / Resume", urlKey: "cv_document_url" },
] as const;
type DocKey = (typeof DOCUMENTS)[number]["key"];

/** Same rules the web wizard enforces before submitting. */
function validate(f: FormState): string {
  const required: Array<[keyof FormState, string]> = [
    ["full_name", "Full name"],
    ["email", "Email address"],
    ["phone", "Phone number"],
    ["aadhaar_number", "Aadhaar number"],
    ["joining_date", "Joining date"],
    ["department", "Department"],
    ["designation", "Designation"],
    ["employment_type", "Employment type"],
    ["annual_salary", "Annual salary"],
    ["pay_frequency", "Pay frequency"],
    ["bank_name", "Bank name"],
    ["bank_account_number", "Bank account number"],
    ["ifsc_code", "IFSC code"],
    ["tax_id", "Tax ID / PAN"],
  ];
  for (const [key, label] of required) if (!String(f[key]).trim()) return `${label} is required.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Enter a valid email address.";
  if (!/^\+?[0-9]{10,15}$/.test(f.phone.trim())) return "Enter a valid phone number (10–15 digits).";
  if (!/^[0-9]{12}$/.test(f.aadhaar_number.trim())) return "Aadhaar number must be 12 digits.";
  if (!(Number(f.annual_salary) > 0)) return "Annual salary must be greater than zero.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc_code.trim().toUpperCase())) return "Enter a valid 11-character IFSC code.";
  return "";
}

export default function EmployeeFormScreen() {
  const navigation = useNavigation();
  const { employeeId } = useRoute<Route>().params ?? {};
  const isEdit = Boolean(employeeId);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [overrideIncrement, setOverrideIncrement] = useState(false);
  const [incrementEnabled, setIncrementEnabled] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocKey, PickedFile>>>({});
  const [existingDocs, setExistingDocs] = useState<Partial<Record<DocKey, boolean>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? "Edit Employee" : "Add Employee" });
  }, [navigation, isEdit]);

  useEffect(() => {
    api
      .get("/attendance/shifts/", { params: { page_size: 100 } })
      .then((res) => setShifts(unwrapList<Shift>(res.data)))
      .catch(() => undefined);
    if (!employeeId) return;
    api
      .get<EmployeeDetail>(`/employees/${employeeId}/`)
      .then(({ data: e }) => {
        const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
        setForm({
          employee_id: text(e.employee_id),
          full_name: text(e.full_name),
          email: text(e.email),
          phone: text(e.phone),
          date_of_birth: text(e.date_of_birth),
          aadhaar_number: text(e.aadhaar_number),
          address: text(e.address),
          emergency_contact_name: text(e.emergency_contact_name),
          emergency_contact_relationship: text(e.emergency_contact_relationship),
          emergency_contact_phone: text(e.emergency_contact_phone),
          joining_date: text(e.joining_date),
          department: text(e.department),
          designation: text(e.designation),
          employment_type: text(e.employment_type) || "FULL_TIME",
          reporting_manager: text(e.reporting_manager),
          shift: text(e.shift),
          annual_salary: e.annual_salary ? String(Number(e.annual_salary)) : "",
          pay_frequency: text(e.pay_frequency) || "MONTHLY",
          bank_name: text(e.bank_name),
          bank_account_number: text(e.bank_account_number),
          ifsc_code: text(e.ifsc_code),
          tax_id: text(e.tax_id),
          pan_number: text(e.pan_number),
          pf_number: text(e.pf_number),
          uan_number: text(e.uan_number),
          esic_number: text(e.esic_number),
          custom_increment_months: text(e.custom_increment_months) || "12",
          custom_increment_type: e.custom_increment_type || "PERCENTAGE",
          custom_increment_value: e.custom_increment_value ? String(Number(e.custom_increment_value)) : "",
        });
        setOverrideIncrement(e.override_increment_policy);
        setIncrementEnabled(e.increment_status !== "DISABLED");
        setExistingPhoto(e.profile_photo_url);
        setExistingDocs({
          aadhaar_document: Boolean(e.aadhaar_document_url),
          pan_card_document: Boolean(e.pan_card_document_url),
          cv_document: Boolean(e.cv_document_url),
        });
      })
      .catch((err) => setError(extractErrorMessage(err, "Could not load this employee.")))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const choosePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to choose a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset) {
      setPhoto({ uri: asset.uri, name: asset.fileName || `photo_${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" });
    }
  };

  const chooseDoc = async (key: DocKey) => {
    const file = await pickDocument();
    if (file) setDocs((d) => ({ ...d, [key]: file }));
  };

  const handleSubmit = async () => {
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSubmitting(true);

    // Multipart, exactly like the web wizard: only non-empty values are sent
    // (so an edit never blanks a field it didn't load), plus any new files.
    const body = new FormData();
    const fields: Record<string, string> = {
      ...form,
      ifsc_code: form.ifsc_code.trim().toUpperCase(),
      tax_id: form.tax_id.trim().toUpperCase(),
      pan_number: form.pan_number.trim().toUpperCase(),
      override_increment_policy: String(overrideIncrement),
      increment_status: incrementEnabled ? "ENABLED" : "DISABLED",
    };
    if (!overrideIncrement) {
      delete fields.custom_increment_months;
      delete fields.custom_increment_type;
      delete fields.custom_increment_value;
    }
    Object.entries(fields).forEach(([key, value]) => {
      const v = String(value).trim();
      if (v) body.append(key, v);
    });
    if (isEdit && !form.shift) body.append("shift", ""); // "Default shift" clears an explicit assignment
    if (photo) body.append("profile_photo", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
    DOCUMENTS.forEach(({ key }) => {
      const f = docs[key];
      if (f) body.append(key, { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
    });

    try {
      const response = isEdit
        ? await api.patch(`/employees/${employeeId}/`, body, { headers: { "Content-Type": "multipart/form-data" } })
        : await api.post("/employees/", body, { headers: { "Content-Type": "multipart/form-data" } });
      const warning = response.data?.warning;
      if (warning) Alert.alert("Employee saved", warning);
      else if (!isEdit) Alert.alert("Employee added", `${form.full_name.trim()} will get a welcome email with sign-in instructions.`);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save this employee."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const departmentOptions = Array.from(new Set([...DEPARTMENTS, ...(form.department ? [form.department] : [])])).map((d) => ({ value: d, label: d }));
  const photoUri = photo?.uri || existingPhoto;

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.photoRow} onPress={choosePhoto} activeOpacity={0.8}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Feather name="camera" size={22} color={colors.primaryDark} />
          </View>
        )}
        <Text style={styles.photoText}>{photoUri ? "Change profile photo" : "Add profile photo"}</Text>
      </TouchableOpacity>

      <FormSection title="Personal Info">
        <TextField label="Full name" required value={form.full_name} onChangeText={set("full_name")} autoCapitalize="words" />
        <TextField label="Email address" required value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Phone number" required value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <DateField label="Date of birth" value={form.date_of_birth} onChange={set("date_of_birth")} clearable />
        <TextField label="Aadhaar number" required value={form.aadhaar_number} onChangeText={set("aadhaar_number")} keyboardType="number-pad" hint="12 digits" />
        <TextField label="Address" value={form.address} onChangeText={set("address")} multiline />
      </FormSection>

      <FormSection title="Employment Details">
        <TextField
          label="Employee ID"
          value={form.employee_id}
          onChangeText={set("employee_id")}
          autoCapitalize="characters"
          editable={!isEdit}
          hint={isEdit ? undefined : "Leave blank to generate one automatically."}
        />
        <DateField label="Joining date" required value={form.joining_date} onChange={set("joining_date")} />
        <ChipSelect label="Department" required options={departmentOptions} value={form.department} onChange={set("department")} />
        <TextField label="…or another department" value={DEPARTMENTS.includes(form.department) ? "" : form.department} onChangeText={set("department")} placeholder="Type a department" />
        <TextField label="Designation" required value={form.designation} onChangeText={set("designation")} autoCapitalize="words" />
        <ChipSelect label="Employment type" required options={EMPLOYMENT_TYPES} value={form.employment_type} onChange={set("employment_type")} />
        <TextField label="Reporting manager" value={form.reporting_manager} onChangeText={set("reporting_manager")} autoCapitalize="words" />
        <ChipSelect
          label="Work shift"
          scroll
          options={[{ value: "", label: "Company default" }, ...shifts.map((s) => ({ value: String(s.id), label: s.name }))]}
          value={form.shift}
          onChange={set("shift")}
        />
      </FormSection>

      <FormSection title="Salary & Bank">
        <TextField label="Annual salary (₹)" required value={form.annual_salary} onChangeText={set("annual_salary")} keyboardType="decimal-pad" />
        <ChipSelect label="Pay frequency" required options={PAY_FREQUENCIES} value={form.pay_frequency} onChange={set("pay_frequency")} />
        <TextField label="Bank name" required value={form.bank_name} onChangeText={set("bank_name")} autoCapitalize="words" />
        <TextField label="Bank account number" required value={form.bank_account_number} onChangeText={set("bank_account_number")} keyboardType="number-pad" />
        <TextField label="IFSC code" required value={form.ifsc_code} onChangeText={set("ifsc_code")} autoCapitalize="characters" />
        <TextField label="Tax ID / PAN" required value={form.tax_id} onChangeText={set("tax_id")} autoCapitalize="characters" />
        <TextField label="PAN number" value={form.pan_number} onChangeText={set("pan_number")} autoCapitalize="characters" />
        <TextField label="PF number" value={form.pf_number} onChangeText={set("pf_number")} />
        <TextField label="UAN number" value={form.uan_number} onChangeText={set("uan_number")} />
        <TextField label="ESIC number" value={form.esic_number} onChangeText={set("esic_number")} />
      </FormSection>

      <FormSection title="Salary Increments">
        <SwitchField label="Increments enabled" value={incrementEnabled} onChange={setIncrementEnabled} />
        <SwitchField
          label="Custom increment policy"
          hint="Off = follow the company's increment settings."
          value={overrideIncrement}
          onChange={setOverrideIncrement}
        />
        {overrideIncrement ? (
          <>
            <ChipSelect label="Increment every" options={INCREMENT_INTERVALS} value={form.custom_increment_months} onChange={set("custom_increment_months")} />
            <ChipSelect label="Increment type" options={INCREMENT_TYPES} value={form.custom_increment_type} onChange={set("custom_increment_type")} />
            <TextField
              label={form.custom_increment_type === "PERCENTAGE" ? "Increment (%)" : "Increment amount (₹)"}
              value={form.custom_increment_value}
              onChangeText={set("custom_increment_value")}
              keyboardType="decimal-pad"
            />
          </>
        ) : null}
      </FormSection>

      <FormSection title="Emergency Contact">
        <TextField label="Contact name" value={form.emergency_contact_name} onChangeText={set("emergency_contact_name")} autoCapitalize="words" />
        <TextField label="Relationship" value={form.emergency_contact_relationship} onChangeText={set("emergency_contact_relationship")} />
        <TextField label="Contact phone" value={form.emergency_contact_phone} onChangeText={set("emergency_contact_phone")} keyboardType="phone-pad" />
      </FormSection>

      <FormSection title="Documents">
        {DOCUMENTS.map(({ key, label }) => (
          <TouchableOpacity key={key} style={styles.docRow} onPress={() => chooseDoc(key)} activeOpacity={0.7}>
            <Feather name="paperclip" size={16} color={colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.docLabel}>{label}</Text>
              <Text style={styles.docMeta} numberOfLines={1}>
                {docs[key]?.name || (existingDocs[key] ? "Uploaded — tap to replace" : "Not uploaded — tap to choose")}
              </Text>
            </View>
            <Feather name="upload" size={16} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </FormSection>

      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={isEdit ? "Save Changes" : "Add Employee"} onPress={handleSubmit} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photoRow: { alignItems: "center", marginBottom: 18 },
  photo: { width: 84, height: 84, borderRadius: 42 },
  photoEmpty: { backgroundColor: "#e6f7f1", alignItems: "center", justifyContent: "center" },
  photoText: { marginTop: 8, fontFamily: fonts.semiBold, fontSize: 13, color: colors.primaryDark },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    marginTop: 12,
  },
  docLabel: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.text },
  docMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
});
