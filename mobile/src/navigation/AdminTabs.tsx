import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import AdminHomeScreen from "../screens/admin/AdminHomeScreen";
import ConversationsScreen from "../screens/chat/ConversationsScreen";
import TasksScreen from "../screens/TasksScreen";
import AdminLeaveScreen from "../screens/admin/AdminLeaveScreen";
import MoreScreen from "../screens/MoreScreen";
import { BrandHeader } from "../components/BrandHeader";
import { colors, fonts } from "../theme";
import type { AdminTabParamList } from "./types";

const Tab = createBottomTabNavigator<AdminTabParamList>();

const ICONS: Record<keyof AdminTabParamList, React.ComponentProps<typeof Feather>["name"]> = {
  Home: "home",
  Chat: "message-circle",
  Tasks: "check-square",
  Leaves: "file-text",
  More: "menu",
};

export default function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.bold },
        headerTitle: () => <BrandHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10 },
        tabBarIcon: ({ color, size }) => <Feather name={ICONS[route.name as keyof AdminTabParamList]} size={size ? size - 2 : 18} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={AdminHomeScreen} />
      <Tab.Screen name="Chat" component={ConversationsScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Leaves" component={AdminLeaveScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
