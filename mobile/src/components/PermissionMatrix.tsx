import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { colors, fonts } from "../theme";
import type { ModulePermission } from "../types";

export interface ModuleInfo {
  key: string;
  label: string;
  description?: string;
}

export type Matrix = Record<string, ModulePermission>;

/** View / Edit / Delete switches per module. Keeps the matrix consistent the
 * same way the backend does: delete ⇒ edit ⇒ view. */
export function PermissionMatrix({ modules, value, onChange, disabled }: { modules: ModuleInfo[]; value: Matrix; onChange: (m: Matrix) => void; disabled?: boolean }) {
  const setFlag = (module: string, action: keyof ModulePermission, on: boolean) => {
    const cur = value[module] || { view: false, edit: false, delete: false };
    let next = { ...cur, [action]: on };
    if (action === "delete" && on) next = { view: true, edit: true, delete: true };
    if (action === "edit") next = on ? { ...next, view: true } : { ...next, delete: false };
    if (action === "view" && !on) next = { view: false, edit: false, delete: false };
    onChange({ ...value, [module]: next });
  };

  return (
    <View>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.module, styles.headText]}>Module</Text>
        {(["view", "edit", "delete"] as const).map((a) => (
          <Text key={a} style={[styles.cellHead, styles.headText]}>
            {a[0].toUpperCase() + a.slice(1)}
          </Text>
        ))}
      </View>
      {modules.map((m) => {
        const flags = value[m.key] || { view: false, edit: false, delete: false };
        return (
          <View key={m.key} style={styles.row}>
            <View style={styles.module}>
              <Text style={styles.moduleLabel}>{m.label}</Text>
            </View>
            {(["view", "edit", "delete"] as const).map((a) => (
              <View key={a} style={styles.cell}>
                <Switch
                  value={flags[a]}
                  onValueChange={(on) => setFlag(m.key, a, on)}
                  disabled={disabled}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#fff"
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.surface },
  head: { marginTop: 10 },
  headText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.muted },
  module: { flex: 1 },
  moduleLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },
  cellHead: { width: 56, textAlign: "center" },
  cell: { width: 56, alignItems: "center" },
});
