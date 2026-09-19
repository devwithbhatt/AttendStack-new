import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import TasksScreen from "../screens/TasksScreen";
import ConversationsScreen from "../screens/chat/ConversationsScreen";
import LeaveScreen from "../screens/LeaveScreen";
import MoreScreen from "../screens/MoreScreen";
import { BrandHeader } from "../components/BrandHeader";
import { colors, fonts } from "../theme";
import type { TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, React.ComponentProps<typeof Feather>["name"]> = {
  Home: "home",
  Tasks: "check-square",
  Chat: "message-circle",
  Leave: "file-text",
  More: "grid",
};

export default function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.bold },
        headerTitle: () => <BrandHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarIcon: ({ color, size }) => <Feather name={ICONS[route.name as keyof TabParamList]} size={size ? size - 2 : 20} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Chat" component={ConversationsScreen} />
      <Tab.Screen name="Leave" component={LeaveScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
