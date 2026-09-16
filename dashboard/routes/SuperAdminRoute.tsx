import { v4 as uuid } from "uuid";
import {
  IconLayoutDashboard,
  IconBuildingSkyscraper,
  IconShieldCheck,
  IconActivity,
  IconLogout,
  IconPlus,
  IconCreditCard,
} from "@tabler/icons-react";
import { MenuItemType } from "types/menuTypes";

export const SuperAdminMenu: MenuItemType[] = [
  {
    id: uuid(),
    title: "SUPER ADMIN HUB",
    grouptitle: true,
  },
  {
    id: uuid(),
    title: "Platform Overview",
    link: "/super-admin/dashboard",
    icon: <IconLayoutDashboard size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "BILLING & TIERS",
    grouptitle: true,
  },
  {
    id: uuid(),
    title: "Subscription Plans",
    link: "/super-admin/plans",
    icon: <IconCreditCard size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "TENANTS MANAGEMENT",
    grouptitle: true,
  },
  {
    id: uuid(),
    title: "All Companies",
    link: "/super-admin/companies",
    icon: <IconBuildingSkyscraper size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "Administrators & HRs",
    link: "/super-admin/admins",
    icon: <IconShieldCheck size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "SYSTEM & AUDIT",
    grouptitle: true,
  },
  {
    id: uuid(),
    title: "System Audit Logs",
    link: "/super-admin/system",
    icon: <IconActivity size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    title: "Logout",
    link: "/sign-in",
    icon: <IconLogout size={20} strokeWidth={1.5} />,
    logout: true,
  },
];
