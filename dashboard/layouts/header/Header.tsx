"use client";
//import node module libraries
import React, { Fragment, useState, useEffect } from "react";
import Link from "next/link";
import { useMediaQuery } from "react-responsive";
import {
  IconArrowBarLeft,
  IconArrowBarRight,
  IconBell,
  IconMenu2,
} from "@tabler/icons-react";
import { Container, ListGroup, Navbar, Button } from "react-bootstrap";

//import custom components
import UserMenu from "./UserMenu";
import Flex from "components/common/Flex";
import NoficationList from "components/common/NoficationList";
import OffcanvasSidebar from "layouts/OffcanvasSidebar";

//import custom hooks
import useMenu from "hooks/useMenu";

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  type: "attendance" | "holiday" | "payroll" | "system" | "leave";
  unread: boolean;
  href?: string;
  createdAt?: string;
}

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT;

const toArray = (payload: any) => Array.isArray(payload) ? payload : payload?.results || [];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

const formatTimeAgo = (value?: string) => {
  if (!value) return "Just now";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  return formatDate(value);
};

const Header = () => {
  const [isNoficationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { toggleMenuHandler, handleCollapsed } = useMenu();

  // useMediaQuery reads `window` — it returns false on the server.
  // We gate all its usages behind `mounted` so the server render and
  // the initial client render both produce the desktop layout, preventing
  // the React hydration mismatch.
  const isTablet = useMediaQuery({ maxWidth: 990 });
  const isTabletMounted = mounted && isTablet;

  const getReadStorageKey = () => {
    const userData = localStorage.getItem("user");
    if (!userData) return "attendstack_notification_reads_guest";
    try {
      const user = JSON.parse(userData);
      return `attendstack_notification_reads_${user.email || user.id || user.role || "user"}`;
    } catch {
      return "attendstack_notification_reads_user";
    }
  };

  const getReadIds = () => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(getReadStorageKey()) || "[]"));
    } catch {
      return new Set<string>();
    }
  };

  const saveReadIds = (ids: Set<string>) => {
    localStorage.setItem(getReadStorageKey(), JSON.stringify(Array.from(ids).slice(-200)));
  };

  const fetchJson = async (url: string, token: string) => {
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      // Notifications are supplementary. Let the rest of the header keep working
      // when an API endpoint is temporarily unreachable or blocked by the browser.
      return null;
    }
  };

  const loadDynamicNotifications = async () => {
    const token = localStorage.getItem("authToken");
    const userData = localStorage.getItem("user");
    if (!token || !userData) return;

    try {
      const parsedUser = JSON.parse(userData);
      const isEmployee = parsedUser.role === "EMPLOYEE";
      const isAdmin = parsedUser.role === "SUPER_ADMIN" || parsedUser.role === "HR" || parsedUser.is_staff;
      const readIds = getReadIds();
      const generatedNotifications: NotificationItem[] = [];

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);

      const holidays = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/holidays/`, token));
      holidays
        .filter((holiday: any) => holiday.date >= todayStr)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .slice(0, 3)
        .forEach((holiday: any) => {
          const id = `holiday-${holiday.id}-${holiday.date}`;
          generatedNotifications.push({
            id,
            title: "Upcoming Holiday",
            description: `${holiday.name} is scheduled on ${formatDate(holiday.date)}.`,
            timeLabel: "Holiday Calendar",
            type: "holiday",
            unread: !readIds.has(id),
            href: isEmployee ? "/employee-dashboard/holidays" : "/holidays",
            createdAt: holiday.date,
          });
        });

      if (isEmployee) {
        const attendance = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/attendance/me/?date_from=${lastWeek.toISOString().slice(0, 10)}`, token));
        attendance.slice(0, 3).forEach((record: any) => {
          const id = `attendance-${record.id}-${record.updated_at || record.date}`;
          generatedNotifications.push({
            id,
            title: "Attendance Logged",
            description: `Your ${formatDate(record.date)} attendance is ${record.status_label || record.status}.`,
            timeLabel: record.check_in ? `Punched ${formatTimeAgo(record.check_in)}` : formatTimeAgo(record.updated_at || record.date),
            type: "attendance",
            unread: !readIds.has(id),
            href: "/employee-dashboard/attendance",
            createdAt: record.updated_at || record.check_in || record.date,
          });
        });

        const leaves = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/attendance/leaves/`, token));
        leaves.slice(0, 3).forEach((leave: any) => {
          const id = `leave-${leave.id}-${leave.status}-${leave.updated_at}`;
          generatedNotifications.push({
            id,
            title: leave.status === "PENDING" ? "Leave Awaiting Review" : `Leave ${leave.status_label || leave.status}`,
            description: `${leave.leave_type_label || "Leave"} from ${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}.`,
            timeLabel: formatTimeAgo(leave.updated_at || leave.created_at),
            type: "leave",
            unread: !readIds.has(id),
            href: "/employee-dashboard/leaves",
            createdAt: leave.updated_at || leave.created_at,
          });
        });

        const payrolls = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/payroll/`, token));
        payrolls.slice(0, 2).forEach((payroll: any) => {
          const id = `payroll-${payroll.id}-${payroll.status}-${payroll.updated_at}`;
          generatedNotifications.push({
            id,
            title: payroll.status === "PAID" ? "Salary Paid" : "Payslip Generated",
            description: `${payroll.month_name || payroll.month} ${payroll.year} payout is ${payroll.status}.`,
            timeLabel: payroll.paid_on ? formatTimeAgo(payroll.paid_on) : "Payroll Alert",
            type: "payroll",
            unread: !readIds.has(id),
            href: "/employee-dashboard/salary",
            createdAt: payroll.updated_at || payroll.created_at,
          });
        });
      } else if (isAdmin) {
        const attendance = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/attendance/today/`, token));
        const pendingLeaves = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/attendance/leaves/?status=PENDING`, token))
          .filter((leave: any) => leave.status === "PENDING");
        const payrolls = toArray(await fetchJson(`${API_ENDPOINT}/api/v1/payroll/?month=${month}&year=${year}`, token));
        const pendingPayrolls = payrolls.filter((payroll: any) => payroll.status === "PENDING");
        const presentToday = attendance.filter((record: any) => ["PRESENT", "LATE", "HALF_DAY"].includes(record.status)).length;

        const attendanceId = `admin-attendance-${todayStr}-${presentToday}-${attendance.length}`;
        generatedNotifications.push({
          id: attendanceId,
          title: "Today's Attendance Snapshot",
          description: `${presentToday} of ${attendance.length} active employees have a present, late, or half-day record today.`,
          timeLabel: "Live Attendance",
          type: "attendance",
          unread: !readIds.has(attendanceId),
          href: "/attendance/todays-attendance",
          createdAt: today.toISOString(),
        });

        if (pendingLeaves.length > 0) {
          const id = `admin-leaves-pending-${pendingLeaves.length}`;
          generatedNotifications.push({
            id,
            title: "Leave Requests Need Review",
            description: `${pendingLeaves.length} leave request${pendingLeaves.length === 1 ? "" : "s"} pending approval.`,
            timeLabel: "HR Queue",
            type: "leave",
            unread: !readIds.has(id),
            href: "/leaves",
            createdAt: pendingLeaves[0]?.created_at || today.toISOString(),
          });
        }

        if (pendingPayrolls.length > 0) {
          const id = `admin-payroll-pending-${month}-${year}-${pendingPayrolls.length}`;
          generatedNotifications.push({
            id,
            title: "Payroll Pending Payout",
            description: `${pendingPayrolls.length} salary record${pendingPayrolls.length === 1 ? "" : "s"} pending payment for this month.`,
            timeLabel: "Payroll",
            type: "payroll",
            unread: !readIds.has(id),
            href: "/salary",
            createdAt: pendingPayrolls[0]?.updated_at || today.toISOString(),
          });
        }

        generatedNotifications.push({
          id: "admin-system-timing",
          title: "Timing Synced",
          description: "Standard corporate timing check-in limits set to 10:00 AM and check-out to 06:00 PM.",
          timeLabel: "Settings Check",
          type: "system",
          unread: !readIds.has("admin-system-timing"),
          href: "/settings",
          createdAt: today.toISOString(),
        });
      }

      generatedNotifications.push({
        id: "system-welcome",
        title: "Welcome to AttendStack",
        description: "Keep tracking your logs daily and check your dashboard regularly for holiday schedules.",
        timeLabel: "System Welcome",
        type: "system",
        unread: !readIds.has("system-welcome"),
        createdAt: today.toISOString(),
      });

      const sortedNotifications = generatedNotifications
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 12);

      setNotifications(sortedNotifications);
      setUnreadCount(sortedNotifications.filter((n) => n.unread).length);
    } catch (err) {
      console.error("Error loading dynamic notifications", err);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadDynamicNotifications();
    const interval = window.setInterval(loadDynamicNotifications, 60000);
    return () => window.clearInterval(interval);
  }, [mounted]);

  // Recalculate unread whenever notifications change
  useEffect(() => {
    setUnreadCount(notifications.filter((n) => n.unread).length);
  }, [notifications]);

  const handleMarkAsRead = (id: string) => {
    const readIds = getReadIds();
    readIds.add(id);
    saveReadIds(readIds);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
    );
  };

  const handleMarkAllAsRead = () => {
    const readIds = getReadIds();
    notifications.forEach((notification) => readIds.add(notification.id));
    saveReadIds(readIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <Fragment>
      <Navbar expand="lg" className="navbar-glass px-0 px-lg-4">
        <Container fluid className="px-lg-0">
          <Flex alignItems="center" className="gap-4">
            {isTabletMounted && (
              <div
                className="d-block d-lg-none"
                style={{ cursor: "pointer" }}
                onClick={() => toggleMenuHandler(true)}
              >
                <IconMenu2 size={24} />
              </div>
            )}
            {!isTabletMounted && (
              <div>
                <Link href={"#"} className="sidebar-toggle d-flex p-3">
                  <span
                    className="collapse-mini"
                    onClick={() => handleCollapsed("expanded")}
                  >
                    <IconArrowBarLeft
                      size={20}
                      strokeWidth={1.5}
                      className="text-secondary"
                    />
                  </span>
                  <span
                    className="collapse-expanded"
                    onClick={() => handleCollapsed("collapsed")}
                  >
                    <IconArrowBarRight
                      size={20}
                      strokeWidth={1.5}
                      className="text-secondary"
                    />
                  </span>
                </Link>
              </div>
            )}
          </Flex>
          <ListGroup
            bsPrefix="list-unstyled"
            as={"ul"}
            className="d-flex align-items-center mb-0 gap-2"
          >


            <ListGroup.Item as="li">
              <Button
                variant="ghost"
                className="position-relative btn-icon rounded-circle"
                onClick={() => setIsNotificationOpen(true)}
              >
                <IconBell size={20} />
                {unreadCount > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger mt-2 ms-n2">
                    {unreadCount}
                    <span className="visually-hidden">unread messages</span>
                  </span>
                )}
              </Button>
            </ListGroup.Item>
            <ListGroup.Item as="li">
              <UserMenu />
            </ListGroup.Item>
          </ListGroup>
        </Container>
      </Navbar>
      <NoficationList
        isOpen={isNoficationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
      />
      {isTabletMounted && <OffcanvasSidebar />}
    </Fragment>
  );
};

export default Header;
