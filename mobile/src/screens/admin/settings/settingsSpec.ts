import type { ChipOption } from "../../../components/Form";
import { INCREMENT_INTERVALS, INCREMENT_TYPES } from "../../../constants";

// Every web Settings tab that edits the company's SystemSettings row,
// described as data so one screen can render and save any of them.

export type FieldType = "text" | "textarea" | "email" | "phone" | "url" | "number" | "decimal" | "switch" | "time" | "choice" | "multi";

export interface SettingField {
  key: string;
  label: string;
  type: FieldType;
  options?: ChipOption[];
  hint?: string;
  /** Show only when another (switch) field is on. */
  showIf?: string;
}

export interface SettingSection {
  key: SectionKey;
  title: string;
  subtitle: string;
  icon: string;
  groups: Array<{ title: string; fields: SettingField[] }>;
}

export type SectionKey = "company" | "locale" | "attendance" | "location" | "leave" | "increment" | "notifications" | "security";

const WEEKDAYS: ChipOption[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => ({
  value: d,
  label: d.charAt(0).toUpperCase() + d.slice(1, 3),
}));

export const SETTINGS_SECTIONS: SettingSection[] = [
  {
    key: "company",
    title: "Company Profile",
    subtitle: "Name, contact, logo, registration & bank details",
    icon: "briefcase",
    groups: [
      {
        title: "Company",
        fields: [
          { key: "company_name", label: "Company name", type: "text" },
          { key: "company_address", label: "Address", type: "textarea" },
          { key: "company_email", label: "Email", type: "email" },
          { key: "company_phone", label: "Phone", type: "phone" },
          { key: "company_website", label: "Website", type: "url" },
          {
            key: "industry",
            label: "Industry",
            type: "choice",
            options: [
              { value: "Technology", label: "Technology & Software" },
              { value: "Professional Services", label: "Professional Services" },
              { value: "Manufacturing", label: "Manufacturing" },
              { value: "Retail & Commerce", label: "Retail & Commerce" },
              { value: "Healthcare", label: "Healthcare" },
              { value: "Education", label: "Education" },
              { value: "Construction & Real Estate", label: "Real Estate" },
              { value: "Other", label: "Other" },
            ],
          },
          {
            key: "company_size",
            label: "Company size",
            type: "choice",
            options: ["1-10", "11-50", "51-200", "201-500", "501+"].map((v) => ({ value: v, label: v })),
          },
        ],
      },
      {
        title: "Registration & Tax",
        fields: [
          { key: "registration_number", label: "Registration number (CIN)", type: "text" },
          { key: "tax_id", label: "GSTIN / Tax ID", type: "text" },
        ],
      },
      {
        title: "Company Bank Account",
        fields: [
          { key: "company_bank_name", label: "Bank name", type: "text" },
          { key: "company_bank_account_no", label: "Account number", type: "text" },
          { key: "company_bank_ifsc", label: "IFSC", type: "text" },
          { key: "company_bank_branch", label: "Branch", type: "text" },
          { key: "company_upi_id", label: "UPI ID", type: "text" },
        ],
      },
    ],
  },
  {
    key: "locale",
    title: "Working Days & Region",
    subtitle: "Working days, timezone, currency, date format",
    icon: "globe",
    groups: [
      {
        title: "Working Week",
        fields: [{ key: "working_days", label: "Working days", type: "multi", options: WEEKDAYS }],
      },
      {
        title: "Region",
        fields: [
          {
            key: "timezone",
            label: "Timezone",
            type: "choice",
            options: [
              { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
              { value: "America/New_York", label: "New York (EST)" },
              { value: "Europe/London", label: "London (GMT)" },
              { value: "Asia/Dubai", label: "Dubai (GST)" },
            ],
          },
          {
            key: "currency",
            label: "Currency",
            type: "choice",
            options: [
              { value: "INR", label: "₹ INR" },
              { value: "USD", label: "$ USD" },
              { value: "EUR", label: "€ EUR" },
              { value: "GBP", label: "£ GBP" },
              { value: "AED", label: "AED" },
            ],
          },
          {
            key: "date_format",
            label: "Date format",
            type: "choice",
            options: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((v) => ({ value: v, label: v })),
          },
        ],
      },
    ],
  },
  {
    key: "attendance",
    title: "Attendance Rules",
    subtitle: "Shift timing, late cut-off, auto check-out, early leave",
    icon: "clock",
    groups: [
      {
        title: "Default Timing",
        fields: [
          { key: "shift_start_time", label: "Shift starts", type: "time" },
          { key: "late_cutoff_time", label: "Late after", type: "time", hint: "Check-ins after this time are marked Late." },
          { key: "shift_end_time", label: "Shift ends", type: "time" },
        ],
      },
      {
        title: "Auto Check-out",
        fields: [
          { key: "auto_checkout_enabled", label: "Auto check-out forgotten punches", type: "switch" },
          { key: "auto_checkout_time", label: "Auto check-out at", type: "time", showIf: "auto_checkout_enabled" },
        ],
      },
      {
        title: "Early Check-out & Hours",
        fields: [
          { key: "early_checkout_grace_minutes", label: "Grace before shift end (minutes)", type: "number" },
          {
            key: "early_checkout_penalty",
            label: "Penalty for leaving early",
            type: "choice",
            options: [
              { value: "HALF_DAY", label: "Half day" },
              { value: "PRO_RATED", label: "Pro-rated hours" },
              { value: "NONE", label: "No penalty" },
            ],
          },
          { key: "min_hours_half_day", label: "Minimum hours for a half day", type: "decimal" },
          { key: "min_hours_full_day", label: "Minimum hours for a full day", type: "decimal" },
        ],
      },
    ],
  },
  {
    key: "location",
    title: "Check-in Location & Network",
    subtitle: "Geofencing and allowed office IP addresses",
    icon: "map-pin",
    groups: [
      {
        title: "Geofencing",
        fields: [
          { key: "geofencing_enabled", label: "Only allow check-in near the office", type: "switch" },
          { key: "office_latitude", label: "Office latitude", type: "decimal", showIf: "geofencing_enabled" },
          { key: "office_longitude", label: "Office longitude", type: "decimal", showIf: "geofencing_enabled" },
          { key: "geofence_radius", label: "Allowed radius (metres)", type: "number", showIf: "geofencing_enabled" },
        ],
      },
      {
        title: "Office Network",
        fields: [
          { key: "ip_restriction_enabled", label: "Only allow check-in from office IPs", type: "switch", hint: "With geofencing also on, either one is accepted." },
          { key: "allowed_ip_ranges", label: "Allowed IPs / ranges", type: "textarea", hint: "Comma-separated, e.g. 203.0.113.5, 10.0.0.0/24" },
        ],
      },
    ],
  },
  {
    key: "leave",
    title: "Leave Policy",
    subtitle: "Yearly allowances, monthly limits, sandwich rules",
    icon: "file-text",
    groups: [
      {
        title: "Yearly Allowance (days)",
        fields: [
          { key: "casual_leave_days", label: "Casual leave", type: "number" },
          { key: "sick_leave_days", label: "Sick leave", type: "number" },
          { key: "maternity_leave_days", label: "Maternity leave", type: "number" },
          { key: "paternity_leave_days", label: "Paternity leave", type: "number" },
          { key: "bereavement_leave_days", label: "Bereavement leave", type: "number" },
          { key: "marriage_leave_days", label: "Marriage leave", type: "number" },
        ],
      },
      {
        title: "Monthly Limits (days)",
        fields: [
          { key: "casual_leave_monthly_limit", label: "Casual leave per month", type: "number" },
          { key: "sick_leave_monthly_limit", label: "Sick leave per month", type: "number" },
        ],
      },
      {
        title: "Rules",
        fields: [
          { key: "sunday_unpaid_rule_enabled", label: "Sunday unpaid rule", type: "switch", hint: "Sunday is unpaid if leave is taken before and after it." },
          { key: "burger_rule_enabled", label: "Sandwich (burger) rule", type: "switch", hint: "A holiday is unpaid if sandwiched between leaves." },
        ],
      },
    ],
  },
  {
    key: "increment",
    title: "Salary Increment Policy",
    subtitle: "Company-wide default raise cycle",
    icon: "trending-up",
    groups: [
      {
        title: "Default Policy",
        fields: [
          { key: "increment_enabled", label: "Automatic increment cycles", type: "switch" },
          { key: "default_increment_months", label: "Every", type: "choice", options: INCREMENT_INTERVALS, showIf: "increment_enabled" },
          { key: "default_increment_type", label: "Type", type: "choice", options: INCREMENT_TYPES, showIf: "increment_enabled" },
          { key: "default_increment_value", label: "Value", type: "decimal", hint: "% or ₹ depending on the type.", showIf: "increment_enabled" },
        ],
      },
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    subtitle: "Email alerts and weekly report",
    icon: "bell",
    groups: [
      {
        title: "Alerts",
        fields: [
          { key: "email_notifications", label: "Email notifications", type: "switch" },
          { key: "late_entry_alert", label: "Late entry alerts", type: "switch" },
          { key: "leave_request_alert", label: "Leave request alerts", type: "switch" },
          { key: "salary_processed_alert", label: "Salary processed alerts", type: "switch" },
          { key: "new_employee_alert", label: "New employee alerts", type: "switch" },
          { key: "browser_notifications", label: "Browser notifications", type: "switch" },
        ],
      },
      {
        title: "Weekly Report",
        fields: [
          { key: "weekly_report_enabled", label: "Send a weekly report", type: "switch" },
          { key: "weekly_report_day", label: "Send on", type: "choice", options: WEEKDAYS, showIf: "weekly_report_enabled" },
        ],
      },
    ],
  },
  {
    key: "security",
    title: "Security",
    subtitle: "Password and session policy",
    icon: "lock",
    groups: [
      {
        title: "Passwords & Sessions",
        fields: [
          { key: "min_password_length", label: "Minimum password length", type: "number" },
          { key: "password_expiry_enabled", label: "Passwords expire periodically", type: "switch" },
          { key: "two_factor_required", label: "Require two-factor sign-in", type: "switch" },
          { key: "session_timeout_enabled", label: "Sign out idle sessions", type: "switch" },
        ],
      },
    ],
  },
];
