//import node modules libraries
import {
  IconBuilding,
  IconUsers,
} from "@tabler/icons-react";
import { v4 as uuid } from "uuid";

//import custom types
import {
  DashboardStatType,
} from "types/DashboardTypes";

export const AdminDashboardStatsData: DashboardStatType[] = [
  {
    id: uuid(),
    title: "Total Organizations",
    value: "0",
    icon: <IconBuilding size={24} strokeWidth={1.5} />,
    bgColor: "bg-gradient-primary",
    textColor: "text-primary-emphasis",
    bottomValue: "",
    description: "",
  },
  {
    id: uuid(),
    title: "Total Employees",
    value: "0",
    icon: <IconUsers size={24} strokeWidth={1.5} />,
    bgColor: " bg-gradient-warning",
    textColor: "text-warning-emphasis",
    bottomValue: "",
    description: "",
  },
];