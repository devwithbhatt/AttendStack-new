import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
  Modal,
  Pressable,
  Alert,
  type KeyboardTypeOptions,
  type ViewStyle,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { colors, fonts, radii, shadow } from "../theme";
import { PrimaryButton } from "./PrimaryButton";

// Shared building blocks for the admin forms, so every screen looks and
// behaves the same: label above, rounded white input, green selected chips.

/** Local-time YYYY-MM-DD (toISOString() would give the UTC date, which is
 * yesterday in India before 05:30). */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  return parseISODate(value.slice(0, 10)).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Native confirm dialog; resolves only when the user taps the action. */
export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void, destructive = true) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: actionLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {label}
      {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}

export function FormSection({ title, children, style }: { title: string; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  hint,
  keyboardType,
  multiline,
  secureTextEntry,
  autoCapitalize,
  editable = true,
  tall,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  /** A big editor box (e.g. the rulebook). */
  tall?: boolean;
}) {
  return (
    <View>
      <FieldLabel label={label} required={required} />
      <TextInput
        style={[styles.input, multiline && styles.textArea, tall && { height: 320 }, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        editable={editable}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export interface ChipOption {
  value: string;
  label: string;
}

/** Single-select chips. `scroll` lays them out in one horizontal row (for
 * long lists such as employees); otherwise they wrap. */
export function ChipSelect({
  label,
  options,
  value,
  onChange,
  required,
  scroll,
  hint,
}: {
  label?: string;
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  scroll?: boolean;
  hint?: string;
}) {
  const chips = options.map((o) => {
    const active = o.value === value;
    return (
      <TouchableOpacity key={o.value || "__empty"} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(o.value)}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
      </TouchableOpacity>
    );
  });
  return (
    <View>
      {label ? <FieldLabel label={label} required={required} /> : null}
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {chips}
        </ScrollView>
      ) : (
        <View style={styles.chipsRow}>{chips}</View>
      )}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Multi-select chips (e.g. several task assignees). */
export function MultiChipSelect({
  label,
  options,
  values,
  onChange,
  required,
  hint,
}: {
  label?: string;
  options: ChipOption[];
  values: string[];
  onChange: (v: string[]) => void;
  required?: boolean;
  hint?: string;
}) {
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <View>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <View style={styles.chipsRow}>
        {options.map((o) => {
          const active = values.includes(o.value);
          return (
            <TouchableOpacity key={o.value} style={[styles.chip, active && styles.chipActive]} onPress={() => toggle(o.value)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {active ? "✓ " : ""}
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function PickerButton({ text, placeholder, icon, onPress, onClear }: { text: string; placeholder: string; icon: "calendar" | "clock"; onPress: () => void; onClear?: () => void }) {
  return (
    <TouchableOpacity style={[styles.input, styles.pickerRow]} onPress={onPress} activeOpacity={0.7}>
      <Feather name={icon} size={16} color={colors.muted} />
      <Text style={[styles.pickerText, !text && { color: colors.placeholder }]}>{text || placeholder}</Text>
      {onClear && text ? (
        <TouchableOpacity onPress={onClear} hitSlop={10}>
          <Feather name="x-circle" size={16} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

/** Date input backed by the native picker. `value` is "YYYY-MM-DD" or "". */
export function DateField({
  label,
  value,
  onChange,
  required,
  clearable,
  hint,
  minimumDate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  clearable?: boolean;
  hint?: string;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const handle = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "set" && date) onChange(toISODate(date));
  };
  return (
    <View>
      <FieldLabel label={label} required={required} />
      <PickerButton
        text={value ? formatDisplayDate(value) : ""}
        placeholder="Select date"
        icon="calendar"
        onPress={() => setOpen(true)}
        onClear={clearable ? () => onChange("") : undefined}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {open && Platform.OS === "android" ? (
        <DateTimePicker value={value ? parseISODate(value) : new Date()} mode="date" onChange={handle} minimumDate={minimumDate} />
      ) : null}
      {Platform.OS === "ios" ? (
        <IOSPickerSheet visible={open} onClose={() => setOpen(false)}>
          <DateTimePicker value={value ? parseISODate(value) : new Date()} mode="date" display="inline" onChange={handle} minimumDate={minimumDate} />
        </IOSPickerSheet>
      ) : null}
    </View>
  );
}

/** Time input backed by the native picker. `value` is "HH:MM" (24h) or "". */
export function TimeField({ label, value, onChange, clearable }: { label: string; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  const asDate = () => {
    const d = new Date();
    const [h, m] = value.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
    return d;
  };
  const handle = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "set" && date) {
      onChange(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
    }
  };
  return (
    <View>
      <FieldLabel label={label} />
      <PickerButton text={value} placeholder="Select time" icon="clock" onPress={() => setOpen(true)} onClear={clearable ? () => onChange("") : undefined} />
      {open && Platform.OS === "android" ? <DateTimePicker value={asDate()} mode="time" is24Hour onChange={handle} /> : null}
      {Platform.OS === "ios" ? (
        <IOSPickerSheet visible={open} onClose={() => setOpen(false)}>
          <DateTimePicker value={asDate()} mode="time" display="spinner" onChange={handle} />
        </IOSPickerSheet>
      ) : null}
    </View>
  );
}

function IOSPickerSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {children}
          <PrimaryButton title="Done" onPress={onClose} style={{ marginTop: 12 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SwitchField({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, style }: { value: string; onChangeText: (v: string) => void; placeholder: string; style?: ViewStyle }) {
  return (
    <View style={[styles.searchWrap, style]}>
      <Feather name="search" size={16} color={colors.muted} />
      <TextInput
        style={styles.search}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={10}>
          <Feather name="x" size={16} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Round floating "+" button, bottom-right of a list screen. */
export function Fab({ onPress, icon = "plus" }: { onPress: () => void; icon?: React.ComponentProps<typeof Feather>["name"] }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Feather name={icon} size={24} color="#fff" />
    </TouchableOpacity>
  );
}

/** A small dialog asking for one line of text (e.g. a rejection reason).
 * Alert.prompt is iOS-only, so this is the cross-platform equivalent. */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  confirmLabel,
  required,
  destructive,
  initialValue = "",
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel: string;
  required?: boolean;
  destructive?: boolean;
  initialValue?: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialValue);
  React.useEffect(() => {
    if (visible) setText(initialValue);
  }, [visible, initialValue]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { justifyContent: "center", padding: 24 }]} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {message ? <Text style={styles.dialogMessage}>{message}</Text> : null}
          <TextInput
            style={[styles.input, styles.textArea, { marginTop: 12 }]}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            multiline
            autoFocus
          />
          <View style={styles.dialogActions}>
            <TouchableOpacity onPress={onClose} style={styles.dialogCancel}>
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </TouchableOpacity>
            <PrimaryButton
              title={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              disabled={required && !text.trim()}
              onPress={() => onSubmit(text.trim())}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const formStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.muted, fontFamily: fonts.medium, textAlign: "center" },
  listRow: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    ...shadow.card,
  },
  rowTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.text },
  rowMeta: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
});

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.text, marginBottom: 6, marginTop: 14 },
  hint: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 4 },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    paddingTop: 14,
    marginBottom: 16,
    ...shadow.card,
  },
  sectionTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.primaryDark },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    backgroundColor: "#fff",
    color: colors.text,
  },
  inputDisabled: { backgroundColor: colors.surface, color: colors.muted },
  textArea: { height: 90, textAlignVertical: "top" },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pickerText: { flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.text },
  chipsRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  chipTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  switchLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: fonts.regular, color: colors.text },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
    elevation: 6,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 20, paddingBottom: 32 },
  dialog: { backgroundColor: colors.card, borderRadius: radii.xl, padding: 20 },
  dialogTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  dialogMessage: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 6 },
  dialogActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  dialogCancel: { paddingHorizontal: 16, paddingVertical: 14 },
  dialogCancelText: { fontFamily: fonts.semiBold, color: colors.muted, fontSize: 14 },
});
