//import node modules libraries
import { v4 as uuid } from "uuid";
import {
  IconLayoutDashboard,
  IconLogout,
  IconUser,
  IconBeach,
  IconFingerprint,
  IconChartBar,
  IconWallet,
  IconCalendarTime,
  IconListDetails,
  IconMessage,
} from "@tabler/icons-react";

//import custom type
import { MenuItemType } from "types/menuTypes";

export const EmployeeDashboardMenu: MenuItemType[] = [
  {
    id: uuid(),
    title: "Employee Dashboard",
    link: "/employee-dashboard",
    icon: <IconLayoutDashboard size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "My Profile",
    link: "/employee-dashboard/profile",
    icon: <IconUser size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "Holidays",
    link: "/employee-dashboard/holidays",
    icon: <IconBeach size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "My Attendance",
    link: "/employee-dashboard/attendance",
    icon: <IconFingerprint size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "Attendance Report",
    link: "/employee-dashboard/attendance-report",
    icon: <IconChartBar size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "My Salary",
    link: "/employee-dashboard/salary",
    icon: <IconWallet size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "Leave Requests",
    link: "/employee-dashboard/leaves",
    icon: <IconCalendarTime size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "My Projects & Tasks",
    link: "/employee-dashboard/tasks",
    icon: <IconListDetails size={18} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "Chat & Messages",
    link: "/chat",
    icon: <IconMessage size={18} strokeWidth={1.5} />,
    badge: "Beta",
    badgecolor: "primary",
  },
  {
    id: uuid(),
    title: "Logout",
    link: "/sign-in",
    icon: <IconLogout size={18} strokeWidth={1.5} />,
    logout: true,
  },
];