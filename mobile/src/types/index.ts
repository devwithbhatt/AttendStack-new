export type UserRole = "SUPER_ADMIN" | "HR" | "SUB_ADMIN" | "EMPLOYEE";

export type ModuleKey =
  | "dashboard"
  | "employees"
  | "attendance"
  | "leaves"
  | "holidays"
  | "payroll"
  | "tasks"
  | "settings"
  | "subadmins";

export interface ModulePermission {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

export type ModulePermissions = Partial<Record<ModuleKey, ModulePermission>>;

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  employee_id: string | null;
  /** Only a true Super Admin or a Role explicitly flagged Full Access — the
   * same "who sees the Admin Dashboard" test the web app uses. Everyone else
   * (including Sub-Admins with only partial module permissions) is treated
   * as a regular employee for navigation purposes, even though they may
   * still reach specific admin screens via `hasModulePermission`. */
  is_admin?: boolean;
  /** {module: {view, edit, delete}} — absent/undefined for plain employees. */
  permissions?: ModulePermissions;
  /** Human-readable role label (e.g. "Admin", "Floor Manager", "Employee") —
   * always prefer this over the raw `role` field for display. */
  custom_role_title?: string;
}

/** True only for a full-access account (Super Admin or a Role flagged Full
 * Access) — mirrors the web app's `user.is_admin`. Chat is deliberately not
 * gated by this or by any module permission. */
export function isFullAdmin(user: AuthUser | undefined | null): boolean {
  return user?.is_admin === true;
}

/** Per-module View/Edit/Delete check, for managers with partial permissions
 * who aren't a full admin but should still reach specific admin screens. */
export function hasModulePermission(
  user: AuthUser | undefined | null,
  module: ModuleKey,
  action: keyof ModulePermission = "view"
): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  return user.permissions?.[module]?.[action] === true;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

export interface TwoFactorChallengeResponse {
  requires_2fa: true;
  email: string;
  detail: string;
}

export interface TodayAttendance {
  employee_name?: string;
  employee_avatar_url?: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
}

export interface LeaveType {
  value: string;
  label: string;
}

export interface LeaveRequest {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_department?: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  leave_type_label: string;
  is_half_day: boolean;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  status_label: string;
  admin_notes: string | null;
  created_at: string;
}

export interface EmployeeListItem {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
  status_label: string;
  joining_date?: string;
  profile_photo_url?: string | null;
  account_exists?: boolean;
  shift?: string | null;
  shift_name?: string | null;
  annual_salary?: string | null;
}

// ---- Admin: employees ----

export interface EmployeeDetail {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  aadhaar_number: string | null;
  address: string;
  profile_photo_url: string | null;
  aadhaar_document_url: string | null;
  pan_card_document_url: string | null;
  cv_document_url: string | null;
  account_exists: boolean;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  joining_date: string;
  department: string;
  designation: string;
  employment_type: string;
  employment_type_label: string;
  shift: string | null;
  shift_name: string | null;
  reporting_manager: string;
  status: string;
  status_label: string;
  status_end_date: string | null;
  auto_transition_status: string | null;
  auto_transition_status_label: string | null;
  annual_salary: string | null;
  casual_leave_days_override: number | null;
  sick_leave_days_override: number | null;
  override_increment_policy: boolean;
  custom_increment_months: number | null;
  custom_increment_type: "PERCENTAGE" | "FLAT_AMOUNT" | null;
  custom_increment_value: string | null;
  increment_status: "ENABLED" | "DISABLED";
  last_increment_date: string | null;
  next_increment_date: string | null;
  pay_frequency: string;
  pay_frequency_label: string;
  bank_name: string;
  bank_account_number: string;
  ifsc_code: string;
  tax_id: string;
  pan_number: string;
  pf_number: string;
  uan_number: string;
  esic_number: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string;
  is_admin: boolean;
  is_system: boolean;
  employee_count?: number;
}

export interface Shift {
  id: string;
  name: string;
  code?: string;
  start_time: string;
  end_time: string;
  start_time_display?: string;
  end_time_display?: string;
  late_grace_minutes?: number;
  early_checkout_grace_minutes?: number;
  early_checkout_penalty?: string;
  min_hours_half_day?: string;
  min_hours_full_day?: string;
  is_default?: boolean;
  is_active?: boolean;
  employee_count?: number;
}

export interface LeaveBalance {
  leave_type: string;
  label: string;
  entitlement: number;
  used: number;
  remaining: number;
}

export interface LeavePolicy {
  year: number;
  joining_date: string;
  is_prorated: boolean;
  eligible_months: number;
  casual_leave_days_override: number | null;
  sick_leave_days_override: number | null;
  company_casual_leave_days: number;
  company_sick_leave_days: number;
  balances: LeaveBalance[];
  leave_requests: LeaveRequest[];
}

export interface AdminAttendanceRecord {
  id: number | string;
  employee_uuid: string;
  employee_id: string;
  employee_name: string;
  employee_department: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  status_label: string;
  notes: string | null;
}

export interface TodayOverviewEntry {
  employee_uuid: string;
  employee_id: string;
  employee_name: string;
  employee_department: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  status_label: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  day: string;
  type: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---- Projects & Tasks ----

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  status: string;
  status_label: string;
  owner?: string | null;
  owner_name: string | null;
  start_date?: string | null;
  department: string;
  due_date: string | null;
  color: string;
  task_count: number;
  completed_task_count: number;
  progress: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  project: string | null;
  project_name: string | null;
  project_color: string | null;
  assignee: string;
  assignee_name: string;
  assignee_department: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  priority_label: string;
  status: "PENDING" | "TODO" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CLOSED" | "CANCELLED";
  status_label: string;
  due_date: string | null;
  start_date?: string | null;
  employee_notes: string;
  admin_notes: string;
  is_overdue: boolean;
  created_at: string;
  assignees?: string[];
  assignee_names?: string[];
  parent?: string | null;
  parent_title?: string | null;
  subtask_count?: number;
  attachment_url?: string | null;
  attachment_name?: string | null;
  employee_attachment_url?: string | null;
  employee_attachment_name?: string | null;
  assigned_by_name?: string | null;
}

export interface TaskSummary {
  total: number;
  pending: number;
  todo: number;
  in_progress: number;
  on_hold: number;
  completed: number;
  closed: number;
  cancelled: number;
  overdue: number;
}

export interface TaskChoices {
  statuses: LeaveType[];
  priorities: LeaveType[];
}

// ---- Chat ----

export interface ChatUserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employee_id: string | null;
  profile_photo_url: string | null;
  designation: string | null;
  department: string | null;
  status: string;
}

export interface ChatAttachment {
  id: string;
  file_url: string | null;
  file_type: string | null;
  file_size: number;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  users: Array<{ id: string; name: string }>;
  reacted_by_me: boolean;
}

export interface ChatMessage {
  id: string;
  conversation: string;
  sender: ChatUserSummary;
  content: string;
  message_type: "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "STICKER" | "SYSTEM";
  is_deleted: boolean;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  created_at: string;
}

export interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  display_name: string;
  avatar: string | null;
  last_message: ChatMessage | null;
  unread_count: number;
  other_user: ChatUserSummary | null;
  updated_at: string;
}

// ---- Payroll ----

export interface PayrollRecord {
  id: string;
  employee_details: {
    id: string;
    full_name: string;
    employee_id: string;
  };
  month: number;
  year: number;
  month_name: string;
  basic_salary: string;
  allowances: string;
  deductions: string;
  net_salary: string;
  payable_salary?: string;
  status: "PAID" | "PENDING" | string;
  paid_on: string | null;
  modification_reason?: string | null;
  is_modified_after_payment?: boolean;
  attendance_summary?: Record<string, unknown> | null;
}

export interface AdminIncrement {
  id: number;
  employee: string;
  employee_details: { id: string; full_name: string; employee_id: string };
  due_date: string;
  current_salary: string;
  increment_type: "PERCENTAGE" | "FLAT_AMOUNT";
  increment_type_display: string;
  increment_value: string;
  calculated_increment_amount: string;
  new_salary: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RESCHEDULED";
  status_display: string;
  rescheduled_date: string | null;
  action_by_name: string | null;
  notes: string;
  cycle_display?: string;
  is_custom?: boolean;
}

export interface EmployeeIncrement {
  id: number;
  employee_id: string;
  full_name: string;
  annual_salary: string | number;
  last_increment_date: string | null;
  next_increment_date: string | null;
  increment_type: "PERCENTAGE" | "FLAT_AMOUNT";
  increment_value: string | number;
  pending_increment: {
    due_date: string;
    new_salary: string;
    status: string;
    status_display: string;
  } | null;
}

// ---- Organization / Plan ----

export interface CompanyBranding {
  company_name: string;
  company_logo: string | null;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  plan_name: string;
  plan_status: string;
  plan_expires_at: string | null;
  days_until_plan_expiry: number | null;
  is_plan_expiring_soon: boolean;
  is_plan_expired: boolean;
  max_employees: number | null;
  employee_count: number;
  active_employee_count: number;
  invite_code: string;
  api_key?: string;
  can_manage_invite_code: boolean;
  external_company_id?: string | null;
  is_simplyjob_linked?: boolean;
  plan_source?: string | null;
  owner?: string | null;
  email?: string;
  phone?: string;
  website?: string;
}

export interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  monthly_price: string | number;
  yearly_price: string | number;
  max_employees: number;
  included_employees: number;
  direct_overage_price_per_employee: string | number | null;
  simplyjob_overage_price_per_employee: string | number;
  badge_text: string;
  is_popular: boolean;
  is_active: boolean;
  requires_contact_sales: boolean;
  features_list: string[];
}

export interface RoleDetail extends RoleSummary {
  permissions: Record<string, ModulePermission>;
}

export interface SubAdmin {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  custom_role_title: string;
  permissions: Record<string, ModulePermission>;
}
