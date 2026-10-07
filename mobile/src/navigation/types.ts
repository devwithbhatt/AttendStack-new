import type { NavigatorScreenParams } from "@react-navigation/native";
import type { AdminAttendanceRecord, Holiday, PayrollRecord, Project, RoleDetail, Shift } from "../types";
import type { SectionKey } from "../screens/admin/settings/settingsSpec";

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<AdminTabParamList> | NavigatorScreenParams<TabParamList> | undefined;
  NewLeave: undefined;
  AddHoliday: { holiday?: Holiday } | undefined;
  TaskDetail: { taskId: string };
  NewTask: { taskId?: string; parentId?: string; projectId?: string } | undefined;
  NewProject: { project?: Project } | undefined;
  Projects: undefined;
  Conversations: undefined;
  ChatThread: { conversationId: string; title: string };
  NewChat: undefined;
  NewGroup: undefined;
  PlansBilling: undefined;
  AttendanceHistory: undefined;
  Payroll: undefined;
  Holidays: undefined;
  EmployeeCategories: undefined;
  Employees: { designation?: string } | undefined;
  AttendanceOverview: { filter?: "present" | "absent" } | undefined;
  LeaveApprovals: undefined;
  EmployeeDetail: { employeeId: string };
  EmployeeForm: { employeeId?: string } | undefined;
  EmployeeStatus: { employeeId: string; name: string };
  EmployeeLeavePolicy: { employeeId: string; name: string };
  MergeRequests: undefined;
  AttendanceRecords: undefined;
  AttendanceRecordForm: { record?: AdminAttendanceRecord; date?: string } | undefined;
  AdminPayroll: undefined;
  PayrollEdit: { payroll: PayrollRecord };
  Increments: undefined;
  SettingsHome: undefined;
  SettingsSection: { section: SectionKey };
  Shifts: undefined;
  ShiftForm: { shift?: Shift } | undefined;
  ShiftAssign: { shift: Shift };
  Roles: undefined;
  RoleForm: { role?: RoleDetail } | undefined;
  RoleMembers: { role: RoleDetail };
  Integrations: undefined;
  Rulebook: undefined;
};

export type TabParamList = {
  Home: undefined;
  Tasks: undefined;
  Chat: undefined;
  Leave: undefined;
  More: undefined;
};

export type AdminTabParamList = {
  Home: undefined;
  Chat: undefined;
  Tasks: undefined;
  Leaves: undefined;
  More: undefined;
};
