import type { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<AdminTabParamList> | NavigatorScreenParams<TabParamList> | undefined;
  NewLeave: undefined;
  AddHoliday: undefined;
  TaskDetail: { taskId: string };
  NewTask: undefined;
  NewProject: undefined;
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
