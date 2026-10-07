import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import NewLeaveScreen from "../screens/NewLeaveScreen";
import AddHolidayScreen from "../screens/admin/AddHolidayScreen";
import HolidaysScreen from "../screens/HolidaysScreen";
import AttendanceHistoryScreen from "../screens/AttendanceHistoryScreen";
import PayrollScreen from "../screens/PayrollScreen";
import TaskDetailScreen from "../screens/TaskDetailScreen";
import NewTaskScreen from "../screens/admin/NewTaskScreen";
import ProjectsScreen from "../screens/admin/ProjectsScreen";
import NewProjectScreen from "../screens/admin/NewProjectScreen";
import PlansBillingScreen from "../screens/admin/PlansBillingScreen";
import EmployeeCategoriesScreen from "../screens/admin/EmployeeCategoriesScreen";
import EmployeesListScreen from "../screens/admin/EmployeesListScreen";
import AdminAttendanceScreen from "../screens/admin/AdminAttendanceScreen";
import AdminLeaveScreen from "../screens/admin/AdminLeaveScreen";
import EmployeeDetailScreen from "../screens/admin/EmployeeDetailScreen";
import EmployeeFormScreen from "../screens/admin/EmployeeFormScreen";
import EmployeeStatusScreen from "../screens/admin/EmployeeStatusScreen";
import EmployeeLeavePolicyScreen from "../screens/admin/EmployeeLeavePolicyScreen";
import MergeRequestsScreen from "../screens/admin/MergeRequestsScreen";
import AttendanceRecordsScreen from "../screens/admin/AttendanceRecordsScreen";
import AttendanceRecordFormScreen from "../screens/admin/AttendanceRecordFormScreen";
import AdminPayrollScreen from "../screens/admin/AdminPayrollScreen";
import PayrollEditScreen from "../screens/admin/PayrollEditScreen";
import IncrementsScreen from "../screens/admin/IncrementsScreen";
import SettingsHomeScreen from "../screens/admin/settings/SettingsHomeScreen";
import SettingsSectionScreen from "../screens/admin/settings/SettingsSectionScreen";
import ShiftsScreen from "../screens/admin/settings/ShiftsScreen";
import ShiftFormScreen from "../screens/admin/settings/ShiftFormScreen";
import ShiftAssignScreen from "../screens/admin/settings/ShiftAssignScreen";
import RolesScreen from "../screens/admin/settings/RolesScreen";
import RoleFormScreen from "../screens/admin/settings/RoleFormScreen";
import RoleMembersScreen from "../screens/admin/settings/RoleMembersScreen";
import IntegrationsScreen from "../screens/admin/settings/IntegrationsScreen";
import RulebookScreen from "../screens/RulebookScreen";
import ConversationsScreen from "../screens/chat/ConversationsScreen";
import ChatThreadScreen from "../screens/chat/ChatThreadScreen";
import NewChatScreen from "../screens/chat/NewChatScreen";
import NewGroupScreen from "../screens/chat/NewGroupScreen";
import Tabs from "./Tabs";
import AdminTabs from "./AdminTabs";
import { colors, fonts } from "../theme";
import { isFullAdmin } from "../types";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const admin = isFullAdmin(user);

  return (
    <NavigationContainer>
      {user ? (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTitleStyle: { color: colors.text, fontFamily: fonts.bold },
            headerTintColor: colors.primary,
          }}
        >
          <Stack.Screen name="Tabs" component={admin ? AdminTabs : Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="NewLeave" component={NewLeaveScreen} options={{ title: "New Leave Request" }} />
          <Stack.Screen name="Holidays" component={HolidaysScreen} options={{ title: "Holidays" }} />
          <Stack.Screen name="AddHoliday" component={AddHolidayScreen} options={{ title: "Add Holiday" }} />
          <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: "Attendance History" }} />
          <Stack.Screen name="Payroll" component={PayrollScreen} options={{ title: "My Salary" }} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: "Task" }} />
          <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ title: "New Task" }} />
          <Stack.Screen name="Projects" component={ProjectsScreen} options={{ title: "Projects" }} />
          <Stack.Screen name="NewProject" component={NewProjectScreen} options={{ title: "New Project" }} />
          <Stack.Screen name="PlansBilling" component={PlansBillingScreen} options={{ title: "Plans & Billing" }} />
          <Stack.Screen name="EmployeeCategories" component={EmployeeCategoriesScreen} options={{ title: "Employees" }} />
          <Stack.Screen name="Employees" component={EmployeesListScreen} options={{ title: "Employees" }} />
          <Stack.Screen name="AttendanceOverview" component={AdminAttendanceScreen} options={{ title: "Today's Attendance" }} />
          <Stack.Screen name="LeaveApprovals" component={AdminLeaveScreen} options={{ title: "Leave Approvals" }} />
          <Stack.Screen name="EmployeeDetail" component={EmployeeDetailScreen} options={{ title: "Employee" }} />
          <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen} options={{ title: "Employee" }} />
          <Stack.Screen name="EmployeeStatus" component={EmployeeStatusScreen} options={{ title: "Change Status" }} />
          <Stack.Screen name="EmployeeLeavePolicy" component={EmployeeLeavePolicyScreen} options={{ title: "Leave Policy" }} />
          <Stack.Screen name="MergeRequests" component={MergeRequestsScreen} options={{ title: "Join Requests" }} />
          <Stack.Screen name="AttendanceRecords" component={AttendanceRecordsScreen} options={{ title: "Attendance Records" }} />
          <Stack.Screen name="AttendanceRecordForm" component={AttendanceRecordFormScreen} options={{ title: "Attendance" }} />
          <Stack.Screen name="AdminPayroll" component={AdminPayrollScreen} options={{ title: "Payroll" }} />
          <Stack.Screen name="PayrollEdit" component={PayrollEditScreen} options={{ title: "Edit Payroll" }} />
          <Stack.Screen name="Increments" component={IncrementsScreen} options={{ title: "Salary Increments" }} />
          <Stack.Screen name="SettingsHome" component={SettingsHomeScreen} options={{ title: "Settings" }} />
          <Stack.Screen name="SettingsSection" component={SettingsSectionScreen} options={{ title: "Settings" }} />
          <Stack.Screen name="Shifts" component={ShiftsScreen} options={{ title: "Shifts" }} />
          <Stack.Screen name="ShiftForm" component={ShiftFormScreen} options={{ title: "Shift" }} />
          <Stack.Screen name="ShiftAssign" component={ShiftAssignScreen} options={{ title: "Assign Shift" }} />
          <Stack.Screen name="Roles" component={RolesScreen} options={{ title: "Roles & Permissions" }} />
          <Stack.Screen name="RoleForm" component={RoleFormScreen} options={{ title: "Role" }} />
          <Stack.Screen name="RoleMembers" component={RoleMembersScreen} options={{ title: "Role Members" }} />
          <Stack.Screen name="Integrations" component={IntegrationsScreen} options={{ title: "Invite Code & Integrations" }} />
          <Stack.Screen name="Rulebook" component={RulebookScreen} options={{ title: "Company Rulebook" }} />
          <Stack.Screen name="Conversations" component={ConversationsScreen} options={{ title: "Chat" }} />
          <Stack.Screen
            name="ChatThread"
            component={ChatThreadScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: "New Message" }} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: "New Group" }} />
        </Stack.Navigator>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
