//import node modules libraries
import { v4 as uuid } from "uuid";
import {
  IconActivity,
  IconHome2,
  IconInbox,
  IconMessage,
  IconSettings,
} from "@tabler/icons-react";

export const UserMenuItem = [
  {
    id: uuid(),
    link: "#",
    title: "Home",
    icon: <IconHome2 size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    link: "#",
    title: "Inbox",
    icon: <IconInbox size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    link: "#",
    title: "Chat",
    icon: <IconMessage size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    link: "#",
    title: "Activity",
    icon: <IconActivity size={20} strokeWidth={1.5} />,
  },
  {
    id: uuid(),
    link: "#",
    title: "Account Settings",
    icon: <IconSettings size={20} strokeWidth={1.5} />,
  },
];
