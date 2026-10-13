// Mirrors the ZuperHR web dashboard's design tokens
// (dashboard/styles/theme/_theme-variables.scss) so the mobile app feels
// like the same product.

export const colors = {
  primary: "#00a76f",
  primaryDark: "#007867",
  primaryLight: "#5be49b",
  gradientStart: "#10b981",
  gradientEnd: "#059669",

  background: "#f8fafc",
  surface: "#f1f5f9",
  card: "#ffffff",

  text: "#141a21",
  muted: "#64748b",
  placeholder: "#94a3b8",
  border: "#e2e8f0",

  success: "#22c55e",
  successSoftBg: "#f0fdf4",
  successSoftBorder: "#bbf7d0",
  successSoftText: "#059669",

  warning: "#ffab00",
  warningSoftBg: "#fffbeb",
  warningSoftBorder: "#fde68a",
  warningSoftText: "#b45309",

  danger: "#ff5630",
  dangerSoftBg: "#fef2f2",
  dangerSoftBorder: "#fecaca",
  dangerSoftText: "#b3261e",

  info: "#00b8d9",
  infoSoftBg: "#ecfeff",
  infoSoftBorder: "#a5f3fc",
  infoSoftText: "#0e7490",
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};

export const fonts = {
  regular: "PublicSans_400Regular",
  medium: "PublicSans_500Medium",
  semiBold: "PublicSans_600SemiBold",
  bold: "PublicSans_700Bold",
};

type SoftTone = "success" | "warning" | "danger" | "info" | "muted" | "primary";

export function softTone(tone: SoftTone) {
  switch (tone) {
    case "success":
      return { bg: colors.successSoftBg, border: colors.successSoftBorder, text: colors.successSoftText };
    case "warning":
      return { bg: colors.warningSoftBg, border: colors.warningSoftBorder, text: colors.warningSoftText };
    case "danger":
      return { bg: colors.dangerSoftBg, border: colors.dangerSoftBorder, text: colors.dangerSoftText };
    case "info":
      return { bg: colors.infoSoftBg, border: colors.infoSoftBorder, text: colors.infoSoftText };
    case "primary":
      return { bg: "#e6f7f1", border: "#b7ead4", text: colors.primaryDark };
    default:
      return { bg: "#f1f5f9", border: colors.border, text: colors.muted };
  }
}

export function toneForStatus(status: string): SoftTone {
  const key = status.toUpperCase();
  if (["PRESENT", "APPROVED", "ACTIVE"].includes(key)) return "success";
  if (["LATE_ENTRY", "HALF_DAY", "PENDING", "ON_LEAVE", "NOTICE_PERIOD"].includes(key)) return "warning";
  if (["ABSENT", "REJECTED", "TERMINATED", "INACTIVE"].includes(key)) return "danger";
  if (["LEAVE", "HOLIDAY", "SUNDAY_UNPAID", "SUNDAY_PAID"].includes(key)) return "info";
  return "muted";
}
