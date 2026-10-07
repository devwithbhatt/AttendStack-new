import React, { useLayoutEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { api, extractErrorMessage } from "../../api/client";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ChipSelect, DateField, FormSection, TextField, formStyles, todayISO } from "../../components/Form";
import { HOLIDAY_TYPES } from "../../constants";
import type { RootStackParamList } from "../../navigation/types";

type Route = RouteProp<RootStackParamList, "AddHoliday">;

/** Add a holiday, or edit one when opened with `holiday`. */
export default function AddHolidayScreen() {
  const navigation = useNavigation();
  const holiday = useRoute<Route>().params?.holiday;
  const [name, setName] = useState(holiday?.name || "");
  const [date, setDate] = useState(holiday?.date || todayISO());
  const [type, setType] = useState(holiday?.type || HOLIDAY_TYPES[0].value);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: holiday ? "Edit Holiday" : "Add Holiday" });
  }, [navigation, holiday]);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim() || !date) {
      setError("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      const body = { name: name.trim(), date, type };
      if (holiday) await api.put(`/holidays/${holiday.id}/`, body);
      else await api.post("/holidays/", body);
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not save the holiday."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={formStyles.screen} contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
      <FormSection title="Holiday">
        <TextField label="Holiday name" required value={name} onChangeText={setName} placeholder="e.g. Independence Day" autoCapitalize="words" />
        <DateField label="Date" required value={date} onChange={(v) => v && setDate(v)} />
        <ChipSelect label="Type" options={HOLIDAY_TYPES} value={type} onChange={setType} />
      </FormSection>
      <ErrorBanner message={error} style={{ marginBottom: 12 }} />
      <PrimaryButton title={holiday ? "Save Changes" : "Add Holiday"} onPress={handleSubmit} loading={submitting} />
    </ScrollView>
  );
}
