import type { ChipOption } from "./components/Form";

// Choice lists mirrored from the Django models, so admin forms offer exactly
// the values the backend accepts.

export const EMPLOYEE_STATUSES: ChipOption[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "PROVISION", label: "Provision" },
  { value: "ON_LEAVE", label: "On Leave" },
  { value: "NOTICE_PERIOD", label: "Notice Period" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "TERMINATED", label: "Terminated" },
];

export const EMPLOYMENT_TYPES: ChipOption[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

export const PAY_FREQUENCIES: ChipOption[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BI_WEEKLY", label: "Bi-Weekly" },
];

/** The web form's preset departments; any other value can still be typed in. */
export const DEPARTMENTS = ["Engineering", "Design", "Marketing", "Sales", "Human Resources"];

export const INCREMENT_INTERVALS: ChipOption[] = [1, 3, 6, 9, 12, 18, 24].map((m) => ({
  value: String(m),
  label: m === 12 ? "12 months (1 yr)" : m === 24 ? "24 months (2 yrs)" : `${m} month${m > 1 ? "s" : ""}`,
}));

export const INCREMENT_TYPES: ChipOption[] = [
  { value: "PERCENTAGE", label: "Percentage (%)" },
  { value: "FLAT_AMOUNT", label: "Flat Amount (₹)" },
];

export const ATTENDANCE_STATUSES: ChipOption[] = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late Entry" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
  { value: "LEAVE", label: "Leave" },
  { value: "PAID_LEAVE", label: "Paid Leave" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "SUNDAY_PAID", label: "Sunday" },
  { value: "SUNDAY_UNPAID", label: "Sunday Unpaid" },
];

export const HOLIDAY_TYPES: ChipOption[] = [
  { value: "Public Holiday", label: "Public" },
  { value: "National Holiday", label: "National" },
  { value: "Festival", label: "Festival" },
  { value: "Optional Holiday", label: "Optional" },
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
