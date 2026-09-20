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
          <Stack.Screen name="Payroll" component={PayrollScreen} options={{ title: "Salary & Payroll" }} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: "Task" }} />
          <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ title: "New Task" }} />
          <Stack.Screen name="Projects" component={ProjectsScreen} options={{ title: "Projects" }} />
          <Stack.Screen name="NewProject" component={NewProjectScreen} options={{ title: "New Project" }} />
          <Stack.Screen name="PlansBilling" component={PlansBillingScreen} options={{ title: "Plans & Billing" }} />
          <Stack.Screen name="EmployeeCategories" component={EmployeeCategoriesScreen} options={{ title: "Employees" }} />
          <Stack.Screen name="Employees" component={EmployeesListScreen} options={{ title: "Employees" }} />
          <Stack.Screen name="AttendanceOverview" component={AdminAttendanceScreen} options={{ title: "Today's Attendance" }} />
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
