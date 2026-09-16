"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  IconBeach,
  IconCalendarCheck,
  IconChartBar,
  IconFingerprint,
  IconFlag,
  IconMail,
  IconPhone,
  IconUser,
  IconWallet,
  IconBuilding,
  IconBriefcase,
  IconClock,
  IconShield,
  IconLogin2,
  IconListDetails,
  IconLogout2,
  IconCircleCheck,
  IconNotes,
  IconActivity,
} from "@tabler/icons-react";
import { useCurrentEmployee } from "./useCurrentEmployee";
import { Spinner, Alert, Badge, Card, Button, Row, Col } from "react-bootstrap";
import EmployeeIncrementWidget from "components/EmployeeIncrementWidget";
import {
  getCurrentPosition,
  getGeolocationPermissionState,
  isGeolocationPermissionDenied,
  isGeolocationUnavailable,
  toAttendanceLocationPayload,
} from "../../../helper/locationPermission";

const formatDate = (value?: string | null) => {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const formatCurrency = (value?: string | number | null) => {
  if (!value) return "Not provided";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
};

const taskStatusClass = (status: TaskDashboardItem["status"]) => {
  return `task-status-badge task-status-${status.toLowerCase().replace("_", "-")}`;
};

const quickActions = [
  {
    title: "My Profile",
    text: "Personal details, bank records, and documents.",
    href: "/employee-dashboard/profile",
    icon: <IconUser size={24} />,
    color: "#4f46e5", // Indigo
    bgColor: "#eeebff",
  },
  {
    title: "Clock-In & Attendance",
    text: "Daily punch, live status, and attendance history.",
    href: "/employee-dashboard/attendance",
    icon: <IconFingerprint size={24} />,
    color: "#0ea5e9", // Sky
    bgColor: "#e0f2fe",
  },
  {
    title: "Monthly Reports",
    text: "Working hours, check-in trends, and present ratio.",
    href: "/employee-dashboard/attendance-report",
    icon: <IconChartBar size={24} />,
    color: "#10b981", // Emerald
    bgColor: "#ecfdf5",
  },
  {
    title: "My Paychecks",
    text: "Payslips, salary status, and payout breakdowns.",
    href: "/employee-dashboard/salary",
    icon: <IconWallet size={24} />,
    color: "#f59e0b", // Amber
    bgColor: "#fef3c7",
  },
  {
    title: "Holiday Calendar",
    text: "Upcoming holidays and company calendar.",
    href: "/employee-dashboard/holidays",
    icon: <IconBeach size={24} />,
    color: "#ec4899", // Pink
    bgColor: "#fdf2f8",
  },
  {
    title: "My Tasks",
    text: "Assigned work, due dates, files, and progress updates.",
    href: "/employee-dashboard/tasks",
    icon: <IconListDetails size={24} />,
    color: "#2563eb",
    bgColor: "#dbeafe",
  },
];

type EmployeeActivity = {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  color: string;
  createdAt: string;
};

type TaskDashboardItem = {
  id: string;
  title: string;
  project_key?: string | null;
  project_name?: string | null;
  project_color?: string | null;
  subtask_count?: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  priority_label?: string;
  status: "PENDING" | "TODO" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CLOSED" | "CANCELLED";
  status_label?: string;
  due_date?: string | null;
  is_overdue?: boolean;
  updated_at?: string;
  created_at?: string;
};

const toArray = (payload: any) => Array.isArray(payload) ? payload : payload?.results || [];

const formatTimeLabel = (value?: string | null) => {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const showLocationEnablePopup = async (reason: "blocked" | "unavailable" | "prompt") => {
  const title = reason === "prompt" ? "Allow location access" : "Enable location access";
  const text =
    reason === "blocked"
      ? "Location is blocked for this site. Open the browser lock/site settings, allow Location, then come back and retry."
      : reason === "unavailable"
        ? "Your device location service looks disabled or unavailable. Turn on Location/GPS in system settings, then retry."
        : "Your browser will show a location permission popup. Please choose Allow to mark attendance.";

  const result = await Swal.fire({
    icon: "warning",
    title,
    html: `<div style="text-align:left">
      <p>${text}</p>
      <ol style="margin:0 0 0 18px;padding:0">
        <li>Click the lock icon near the address bar.</li>
        <li>Set Location to Allow.</li>
        <li>Refresh or retry attendance after changing it.</li>
      </ol>
    </div>`,
    showCancelButton: true,
    confirmButtonText: reason === "prompt" ? "Show location popup" : "I enabled it, retry",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#0d6efd",
  });

  return result.isConfirmed;
};

const EmployeeDashboard = () => {
  const { employee, isLoading, error } = useCurrentEmployee();

  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState<any>(null);
  const [todayLoadError, setTodayLoadError] = useState("");
  const [attendanceBlocked, setAttendanceBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [actionLoading, setActionLoading] = useState<"check-in" | "check-out" | null>(null);
  const [punchError, setPunchError] = useState("");
  const [punchSuccess, setPunchSuccess] = useState("");
  const [activityFeed, setActivityFeed] = useState<EmployeeActivity[]>([]);
  const [tasks, setTasks] = useState<TaskDashboardItem[]>([]);
  const DEFAULT_RULES = `1. Core Working Hours: 10:00 AM to 6:00 PM.
2. Late Entry: Arriving after 10:15 AM will be marked as Late.
3. Half Day: Checking out before the final two hours of the scheduled shift is considered a half day. An approved Casual or Sick half-day leave uses 0.5 of that leave balance.
4. Leave Requests: Must be submitted at least 24 hours in advance.
5. Unpaid Leave: Absences without prior approval will be considered Unpaid.`;

  const [attendanceRules, setAttendanceRules] = useState("");
  const [settings, setSettings] = useState<any>(null);

  const apiEndpoint = (process.env.NEXT_PUBLIC_API_ENDPOINT || 'http://localhost:8001').replace(/\/$/, '');

  const loadSettings = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    try {
      const res = await fetch(`${apiEndpoint}/api/v1/settings/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  const loadActivityFeed = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    try {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      const headers = { Authorization: `Bearer ${token}` };

      const [attendanceRes, leavesRes, payrollRes, holidaysRes] = await Promise.all([
        fetch(`${apiEndpoint}/api/v1/attendance/me/?date_from=${weekStart.toISOString().slice(0, 10)}`, { headers }),
        fetch(`${apiEndpoint}/api/v1/attendance/leaves/`, { headers }),
        fetch(`${apiEndpoint}/api/v1/payroll/`, { headers }),
        fetch(`${apiEndpoint}/api/v1/holidays/`, { headers }),
      ]);

      const activities: EmployeeActivity[] = [];

      if (attendanceRes.ok) {
        toArray(await attendanceRes.json()).slice(0, 4).forEach((record: any) => {
          activities.push({
            id: `attendance-${record.id}`,
            title: "Attendance Updated",
            description: `${formatDate(record.date)} marked as ${record.status_label || record.status}.`,
            timeLabel: formatTimeLabel(record.updated_at || record.check_in || record.date),
            color: record.status === "ABSENT" || record.status === "LEAVE" ? "danger" : record.status === "LATE" ? "warning" : "success",
            createdAt: record.updated_at || record.check_in || record.date,
          });
        });
      }

      if (leavesRes.ok) {
        toArray(await leavesRes.json()).slice(0, 4).forEach((leave: any) => {
          activities.push({
            id: `leave-${leave.id}`,
            title: leave.status === "PENDING" ? "Leave Awaiting Review" : `Leave ${leave.status_label || leave.status}`,
            description: `${leave.leave_type_label || "Leave"} from ${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}.`,
            timeLabel: formatTimeLabel(leave.updated_at || leave.created_at),
            color: leave.status === "APPROVED" ? "success" : leave.status === "REJECTED" ? "danger" : "warning",
            createdAt: leave.updated_at || leave.created_at,
          });
        });
      }

      if (payrollRes.ok) {
        toArray(await payrollRes.json()).slice(0, 2).forEach((payroll: any) => {
          activities.push({
            id: `payroll-${payroll.id}`,
            title: payroll.status === "PAID" ? "Salary Paid" : "Payslip Generated",
            description: `${payroll.month_name || payroll.month} ${payroll.year} payroll is ${payroll.status}.`,
            timeLabel: formatTimeLabel(payroll.paid_on || payroll.updated_at),
            color: payroll.status === "PAID" ? "success" : "primary",
            createdAt: payroll.paid_on || payroll.updated_at || payroll.created_at,
          });
        });
      }

      if (holidaysRes.ok) {
        const todayStr = today.toISOString().slice(0, 10);
        toArray(await holidaysRes.json())
          .filter((holiday: any) => holiday.date >= todayStr)
          .slice(0, 2)
          .forEach((holiday: any) => {
            activities.push({
              id: `holiday-${holiday.id}`,
              title: "Upcoming Holiday",
              description: `${holiday.name} on ${formatDate(holiday.date)}.`,
              timeLabel: "Holiday Calendar",
              color: "info",
              createdAt: holiday.date,
            });
          });
      }

      setActivityFeed(
        activities
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 6)
      );
    } catch (err) {
      console.error("Error loading employee activity feed:", err);
    }
  };

  const loadTaskSummary = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    try {
      const res = await fetch(`${apiEndpoint}/api/v1/tasks/?page_size=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(toArray(data));
      }
    } catch (err) {
      console.error("Error loading employee task summary:", err);
    }
  };

  const loadTodayAttendance = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setTodayLoadError("Your session has expired. Please sign in again to load attendance.");
      return;
    }
    setTodayLoadError("");
    try {
      const res = await fetch(`${apiEndpoint}/api/v1/attendance/me/today/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const detail = errorData?.detail || "Unable to load your attendance status.";
        if (
          typeof detail === "string"
          && (detail.includes("Inactive") || detail.includes("Terminated"))
        ) {
          setToday(null);
          setAttendanceBlocked(true);
          setTodayLoadError(detail);
          return;
        }
        throw new Error(detail);
      }

      const data = await res.json();
      setAttendanceBlocked(false);
      setToday(data);
    } catch (err) {
      console.error("Error loading today attendance:", err);
      setToday(null);
      setAttendanceBlocked(false);
      setTodayLoadError(err instanceof Error ? err.message : "Unable to load your attendance status.");
    }
  };

  useEffect(() => {
    setMounted(true);
    loadTodayAttendance();
    loadActivityFeed();
    loadTaskSummary();
    loadSettings();
    const rules = localStorage.getItem("attendance_rules");
    setAttendanceRules(rules || settings?.attendance_rules || DEFAULT_RULES);
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    const activityTimer = window.setInterval(loadActivityFeed, 60000);
    const taskTimer = window.setInterval(loadTaskSummary, 60000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(activityTimer);
      window.clearInterval(taskTimer);
    };
  }, []);

  const [isCheckinActive, setCheckinActive] = useState(false);
  const [isCheckoutActive, setCheckoutActive] = useState(false);

  useEffect(() => {
    const checkTime = () => {
      if (!settings) return;

      const now = new Date();
      const [startHours, startMinutes] = settings.shift_start_time.split(':').map(Number);
      const [endHours, endMinutes] = settings.shift_end_time.split(':').map(Number);

      const shiftStart = new Date(now);
      shiftStart.setHours(startHours, startMinutes, 0, 0);

      const shiftEnd = new Date(now);
      shiftEnd.setHours(endHours, endMinutes, 0, 0);

      const checkinWindowStart = new Date(shiftStart);
      checkinWindowStart.setHours(checkinWindowStart.getHours() - 1);

      setCheckinActive(now >= checkinWindowStart && now <= shiftEnd);

      if (today?.check_in) {
        const checkinTime = new Date(today.check_in);
        const minCheckoutTime = new Date(checkinTime);
        minCheckoutTime.setHours(minCheckoutTime.getHours() + 3);
        setCheckoutActive(now >= minCheckoutTime);
      } else {
        setCheckoutActive(false);
      }
    };

    checkTime();
    const timer = setInterval(checkTime, 60000); // Re-check every minute
    return () => clearInterval(timer);
  }, [currentTime, today, settings]);

  const markAttendance = async (action: "check-in" | "check-out") => {
    setActionLoading(action);
    setPunchError("");
    setPunchSuccess("");

    if (action === "check-in" && !isCheckinActive) {
      setPunchError("Check-in is not active at this time.");
      setActionLoading(null);
      return;
    }

    if (action === "check-out" && !isCheckoutActive) {
      setPunchError("Checkout is not active at this time.");
      setActionLoading(null);
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      setPunchError("Session expired. Please sign in again.");
      setActionLoading(null);
      return;
    }

    try {
      let locationData = {};
      const shouldCollectLocation = action === "check-in" || settings?.geofencing_enabled;
      if (shouldCollectLocation) {
        const permissionState = await getGeolocationPermissionState();
        if (permissionState === "denied") {
          const shouldRetry = await showLocationEnablePopup("blocked");
          if (!shouldRetry) {
            throw new Error("Location permission is required to mark attendance.");
          }
        } else if (permissionState === "prompt") {
          const shouldPrompt = await showLocationEnablePopup("prompt");
          if (!shouldPrompt) {
            throw new Error("Location permission is required to mark attendance.");
          }
        }

        try {
          const position = await getCurrentPosition();
          locationData = toAttendanceLocationPayload(position);
        } catch (geoError) {
          if (isGeolocationPermissionDenied(geoError)) {
            await showLocationEnablePopup("blocked");
            throw new Error("Location permission denied. Please enable it in your browser settings.");
          }
          if (isGeolocationUnavailable(geoError)) {
            await showLocationEnablePopup("unavailable");
            throw new Error("Could not get your location. Please enable device location services and try again.");
          }
          throw new Error("Could not get your location. Please enable location services and try again.");
        }
      }

      const res = await fetch(`${apiEndpoint}/api/v1/attendance/${action}/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(locationData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || "Attendance operation failed.");
      }

      setPunchSuccess(action === "check-in" ? "Checked in successfully!" : "Checked out successfully!");
      await loadTodayAttendance();
      await loadActivityFeed();
    } catch (err) {
      setPunchError(err instanceof Error ? err.message : "Unable to mark attendance.");
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-6 min-vh-50">
        <div className="text-center">
          <Spinner animation="border" variant="primary" role="status" className="mb-3">
            <span className="visually-hidden">Loading Dashboard...</span>
          </Spinner>
          <p className="text-secondary">Assembling your personal workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <Alert variant="danger" className="border-0 shadow-sm p-4">
        <h5 className="fw-bold mb-2">Workspace Unreachable</h5>
        <p className="mb-0">{error || "Unable to fetch your personal employee credentials. Please log in again."}</p>
      </Alert>
    );
  }

  const monthlySalary = Number(employee.annual_salary) / 12;
  const taskStats = {
    total: tasks.length,
    active: tasks.filter((task) => ["PENDING", "TODO", "IN_PROGRESS", "ON_HOLD"].includes(task.status)).length,
    overdue: tasks.filter((task) => task.is_overdue).length,
    completed: tasks.filter((task) => ["COMPLETED", "CLOSED"].includes(task.status)).length,
    onHold: tasks.filter((task) => task.status === "ON_HOLD").length,
    dueSoon: tasks.filter((task) => {
      const days = daysUntil(task.due_date);
      return days !== null && days >= 0 && days <= 3 && !["COMPLETED", "CLOSED", "CANCELLED"].includes(task.status);
    }).length,
  };
  const taskCompletionRate = taskStats.total ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
  const taskHealthLabel = taskStats.overdue > 0 ? "Needs Attention" : taskStats.onHold > 0 ? "On Hold" : taskStats.active > 0 ? "In Progress" : "Clear";
  const taskHealthVariant = taskStats.overdue > 0 ? "danger" : taskStats.onHold > 0 ? "warning" : "success";
  const nextTasks = [...tasks]
    .filter((task) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(task.status))
    .sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      return new Date(a.due_date || a.updated_at || a.created_at || 0).getTime() - new Date(b.due_date || b.updated_at || b.created_at || 0).getTime();
    })
    .slice(0, 5);

  return (
    <div className="employee-dashboard-container py-3">
      {/* Welcome Hero Banner */}
      <div className="card border-0 shadow-sm mb-4 overflow-hidden welcome-hero-card">
        <div className="card-body employee-hero-body">
          <div className="employee-hero-layout">
            <div className="avatar-wrapper">
              <img
                src={employee.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                alt={employee.full_name}
                className="rounded-circle border border-3 border-white shadow-sm employee-avatar"
              />
              <span className={`status-dot ${employee.status === "ACTIVE" ? "bg-success" : "bg-warning"}`}></span>
            </div>
            <div className="employee-hero-copy">
              <div className="employee-hero-title-row">
                <h1 className="fw-bold mb-0 text-dark heading-welcome">Welcome back, {employee.full_name.split(" ")[0]}!</h1>
                <Badge bg="success" className="employee-status-badge bg-success-subtle text-success border border-success-subtle">
                  {employee.status_label}
                </Badge>
              </div>
              <p className="employee-designation-line text-secondary fw-medium mb-3">
                {employee.designation} <span className="mx-1 text-muted">-</span> {employee.department} <span className="mx-1 text-muted">-</span> Bhatt Square Pvt Ltd
              </p>

              <div className="employee-contact-grid text-muted small">
                <span>
                  <IconMail size={16} className="text-secondary" /> <span>{employee.email}</span>
                </span>
                <span>
                  <IconPhone size={16} className="text-secondary" /> <span>{employee.phone}</span>
                </span>
                <span>
                  <IconCalendarCheck size={16} className="text-secondary" /> <span>Joined {formatDate(employee.joining_date)}</span>
                </span>
              </div>
            </div>
            <div className="employee-hero-action">
              <Link href="/employee-dashboard/profile" className="btn btn-primary shadow-sm px-4 fw-semibold text-white">
                View Official Profile
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Helpful Tip Banner */}
      <div className="shift-banner alert alert-primary border-0 shadow-sm d-flex align-items-start gap-3 mb-4">
        <IconClock size={20} className="text-primary flex-shrink-0 mt-1" />
        <div>
          <strong className="text-primary-emphasis">Shift Schedule:</strong>
          <span className="text-secondary">
            Standard office timing is <strong>{settings ? `${settings.shift_start_time} to ${settings.shift_end_time}` : "10:00 AM to 06:00 PM"}</strong>. Please check in and check out daily from your portal to track working hours accurately.
          </span>
        </div>
      </div>

      {/* Attendance Punch In/Out Quick Action Panel */}
      {mounted && (
        <Card className="dashboard-panel attendance-panel border-0 shadow-sm mb-4 overflow-hidden bg-white">
          <Card.Body>
            <Row className="align-items-center g-3 g-lg-4">
              <Col xs={12} lg={6}>
                <div className="attendance-panel-heading">
                  <div className="panel-icon bg-primary-subtle text-primary">
                    <IconFingerprint size={24} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h4 className="fw-bold text-dark mb-1">Daily Attendance Punch</h4>
                    <p className="text-secondary small mb-0">
                      Standard timing: <strong>{settings ? `${settings.shift_start_time} to ${settings.shift_end_time}` : "10:00 AM to 06:00 PM"}</strong>
                    </p>
                  </div>
                </div>

                {/* Ticking Digital Clock */}
                <div className="dashboard-clock mt-3">
                  <IconClock size={18} className="text-primary" />
                  <div>
                    <div className="fw-bold text-dark font-monospace">
                      {currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                    </div>
                    <div className="text-secondary small">
                      {currentTime.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                </div>
              </Col>

              <Col xs={12} lg={6} className="d-flex flex-column justify-content-center align-items-lg-end">
                {punchSuccess && (
                  <Alert variant="success" className="border-0 shadow-sm rounded-3 w-100 mb-3 py-2 px-3 small" onClose={() => setPunchSuccess("")} dismissible>
                    {punchSuccess}
                  </Alert>
                )}
                {punchError && (
                  <Alert variant="danger" className="border-0 shadow-sm rounded-3 w-100 mb-3 py-2 px-3 small" onClose={() => setPunchError("")} dismissible>
                    {punchError}
                  </Alert>
                )}

                {today ? (
                  <div className="w-100 d-flex flex-column gap-3 align-items-lg-end">
                    {/* Punch States */}
                    {!today.check_in ? (
                      <div className="w-100 text-lg-end">
                        <p className="text-secondary small mb-3">You haven't clocked in today yet.</p>
                        <Button
                          variant="primary"
                          size="lg"
                          onClick={() => markAttendance("check-in")}
                          disabled={actionLoading !== null || !isCheckinActive}
                          className="dashboard-action-btn d-inline-flex align-items-center justify-content-center gap-2 fw-bold shadow-sm text-white border-0"
                        >
                          <IconLogin2 size={22} />
                          {actionLoading === "check-in" ? "Punching In..." : "Clock In Now"}
                        </Button>
                        {!isCheckinActive && (
                          <p className="text-danger small mt-2">Check-in is only available 1 hour before and during the shift.</p>
                        )}
                      </div>
                    ) : !today.check_out ? (
                      <div className="w-100 text-lg-end">
                        <div className="mb-3 d-inline-flex align-items-center gap-2 px-3 py-2 bg-success-subtle text-success border border-success-subtle rounded-3 small">
                          <IconCircleCheck size={16} />
                          <strong>Checked In at:</strong>{" "}
                          {new Date(today.check_in).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>
                        <br />
                        <Button
                          variant="warning"
                          size="lg"
                          onClick={() => markAttendance("check-out")}
                          disabled={actionLoading !== null || !isCheckoutActive}
                          className="dashboard-action-btn d-inline-flex align-items-center justify-content-center gap-2 fw-bold shadow-sm text-dark border-0"
                          style={{ backgroundColor: "#ffb020", color: "#1e293b" }}
                        >
                          <IconLogout2 size={22} />
                          {actionLoading === "check-out" ? "Punching Out..." : "Clock Out Now"}
                        </Button>
                        {!isCheckoutActive && (
                          <p className="text-danger small mt-2">Checkout is available only after 3 hours of work.</p>
                        )}
                      </div>
                    ) : (
                      <div className="w-100 text-lg-end">
                        <div className="shift-complete-box p-3 bg-light border text-center text-lg-end d-inline-block w-100">
                          <h6 className="fw-bold text-success mb-2 d-flex align-items-center gap-2 justify-content-center justify-content-lg-end">
                            <IconCircleCheck size={20} /> Shift Completed Today!
                          </h6>
                          <p className="text-secondary small mb-0">
                            Check In: <strong>{new Date(today.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</strong> |
                            Check Out: <strong>{new Date(today.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</strong>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : todayLoadError ? (
                  <Alert variant={attendanceBlocked ? "secondary" : "warning"} className="w-100 mb-0 text-start small">
                    <strong>{attendanceBlocked ? "Attendance access disabled" : "Attendance unavailable"}:</strong>{" "}
                    {attendanceBlocked
                      ? "Your employment status is Inactive or Terminated. Check-in and check-out are disabled. Please contact HR if this status needs to be reviewed."
                      : todayLoadError}
                  </Alert>
                ) : (
                  <div className="text-center w-100 py-3">
                    <Spinner animation="border" size="sm" variant="primary" />
                    <span className="ms-2 text-secondary small">Synchronizing punch status...</span>
                  </div>
                )}
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      <Card className="dashboard-panel border-0 shadow-sm mb-4 employee-task-focus-card">
        <Card.Header className="bg-white border-0 py-3 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div className="metric-icon-box bg-primary-subtle text-primary">
              <IconListDetails size={24} />
            </div>
            <div>
              <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                <h5 className="fw-bold text-dark mb-0">My Project Focus</h5>
                <Badge bg={`${taskHealthVariant}-subtle`} className={`text-${taskHealthVariant} border border-${taskHealthVariant}-subtle rounded-pill`}>
                  {taskHealthLabel}
                </Badge>
              </div>
              <p className="text-secondary small mb-0">Your project work, due dates, priorities, and updates that need attention.</p>
            </div>
          </div>
          <div className="employee-task-header-actions">
            <div className="employee-task-progress">
              <span>Completion</span>
              <strong>{taskCompletionRate}%</strong>
              <div><i style={{ width: `${taskCompletionRate}%` }} /></div>
            </div>
            <Link href="/employee-dashboard/tasks" className="btn btn-outline-primary btn-sm px-3">
              Open Tasks
            </Link>
          </div>
        </Card.Header>
        <Card.Body className="pt-0">
          <Row className="g-3 mb-4">
            <Col xs={6} lg={2}>
              <div className="employee-task-metric is-neutral">
                <span>Total</span>
                <strong>{taskStats.total}</strong>
              </div>
            </Col>
            <Col xs={6} lg={2}>
              <div className="employee-task-metric is-primary">
                <span>Active</span>
                <strong>{taskStats.active}</strong>
              </div>
            </Col>
            <Col xs={6} lg={2}>
              <div className="employee-task-metric is-danger">
                <span>Overdue</span>
                <strong>{taskStats.overdue}</strong>
              </div>
            </Col>
            <Col xs={6} lg={2}>
              <div className="employee-task-metric is-warning">
                <span>Due Soon</span>
                <strong>{taskStats.dueSoon}</strong>
              </div>
            </Col>
            <Col xs={6} lg={2}>
              <div className="employee-task-metric is-warning">
                <span>On Hold</span>
                <strong>{taskStats.onHold}</strong>
              </div>
            </Col>
            <Col xs={6} lg={2}>
              <div className="employee-task-metric is-success">
                <span>Completed</span>
                <strong>{taskStats.completed}</strong>
              </div>
            </Col>
          </Row>


        </Card.Body>
      </Card>

      <Row className="g-4 mb-4">
        <Col xs={12} xl={7}>
          <Card className="dashboard-panel border-0 shadow-sm h-100 employee-activity-card">
            <Card.Header className="bg-white border-0 py-3 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <IconActivity size={20} className="text-primary" />
                <h5 className="mb-0 fw-bold text-dark">My Live Activity</h5>
              </div>
              <Badge bg="success-subtle" text="success" className="border border-success-subtle rounded-pill">
                Live
              </Badge>
            </Card.Header>
            <Card.Body className="pt-0">
              {activityFeed.length === 0 ? (
                <div className="text-center text-secondary py-4">
                  No recent personal activity yet.
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {activityFeed.map((activity) => (
                    <div key={activity.id} className="d-flex gap-3 align-items-start p-3 rounded-3 bg-light-subtle border">
                      <span className={`rounded-circle bg-${activity.color}-subtle text-${activity.color} d-flex align-items-center justify-content-center flex-shrink-0`} style={{ width: 34, height: 34 }}>
                        <IconCircleCheck size={17} />
                      </span>
                      <div className="min-w-0">
                        <div className="fw-semibold text-dark">{activity.title}</div>
                        <div className="small text-secondary">{activity.description}</div>
                        <div className="small text-muted mt-1">{activity.timeLabel}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} xl={5}>
          <Card className="dashboard-panel border-0 shadow-sm h-100">
            <Card.Body className="p-4">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="metric-icon-box bg-success-subtle text-success">
                  <IconShield size={24} />
                </div>
                <div>
                  <h5 className="fw-bold text-dark mb-1">Work Readiness</h5>
                  <p className="text-secondary small mb-0">Your profile, attendance, and payroll signals in one place.</p>
                </div>
              </div>
              <div className="d-flex flex-column gap-3">
                <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                  <span className="text-secondary">Today status</span>
                  <Badge bg={today?.status === "ABSENT" ? "danger" : "success"}>{today?.status_label || "Syncing"}</Badge>
                </div>
                <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                  <span className="text-secondary">Employee status</span>
                  <Badge bg={employee.status === "ACTIVE" ? "success" : "warning"}>{employee.status_label}</Badge>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-secondary">Reporting manager</span>
                  <strong className="text-dark">{employee.reporting_manager || "Admin Desk"}</strong>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Key Metrics grid */}
      <div className="row g-3 g-lg-4 mb-4">
        <div className="col-12 col-md-4">
          <div className="card border-0 shadow-sm h-100 metric-card position-relative overflow-hidden">
            <div className="card-body p-4 position-relative d-flex align-items-center gap-3">
              <div className="metric-icon-box bg-primary-subtle text-primary">
                <IconBriefcase size={24} />
              </div>
              <div>
                <span className="text-muted d-block small fw-semibold text-uppercase">Corporate ID</span>
                <strong className="fs-4 fw-bold text-dark">{employee.employee_id}</strong>
                <span className="d-block text-secondary small mt-1">{employee.employment_type_label || "Permanent"} Employee</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card border-0 shadow-sm h-100 metric-card position-relative overflow-hidden">
            <div className="card-body p-4 position-relative d-flex align-items-center gap-3">
              <div className="metric-icon-box bg-success-subtle text-success">
                <IconWallet size={24} />
              </div>
              <div>
                <span className="text-muted d-block small fw-semibold text-uppercase">Monthly Salary Est.</span>
                <strong className="fs-4 fw-bold text-success">{formatCurrency(monthlySalary)}</strong>
                <span className="d-block text-secondary small mt-1">CTC: {formatCurrency(employee.annual_salary)} / yr</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-4">
          <div className="card border-0 shadow-sm h-100 metric-card position-relative overflow-hidden">
            <div className="card-body p-4 position-relative d-flex align-items-center gap-3">
              <div className="metric-icon-box bg-info-subtle text-info">
                <IconBuilding size={24} />
              </div>
              <div>
                <span className="text-muted d-block small fw-semibold text-uppercase">Reporting Officer</span>
                <strong className="fs-5 fw-bold text-dark">{employee.reporting_manager || "Admin Desk"}</strong>
                <span className="d-block text-secondary small mt-1">Department: {employee.department}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <h4 className="section-heading fw-bold mb-3 text-dark d-flex align-items-center gap-2">
        <IconShield size={22} className="text-primary" /> Core Workspaces & Actions
      </h4>

      <div className="row g-3 g-lg-4">
        {quickActions.map((action) => (
          <div className="col-12 col-md-6 col-xl-4" key={action.href}>
            <Link href={action.href} className="card h-100 border-0 shadow-sm quick-action-card text-decoration-none">
              <div className="card-body p-4 d-flex gap-3">
                <div
                  className="action-icon-wrapper d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ backgroundColor: action.bgColor, color: action.color }}
                >
                  {action.icon}
                </div>
                <div>
                  <h6 className="fw-bold text-dark mb-1 card-title-action">{action.title}</h6>
                  <p className="text-secondary small mb-0">{action.text}</p>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>


      {/* Salary Increment Growth & History Widget */}
      <EmployeeIncrementWidget />


      {/* Attendance Rules Section */}
      {attendanceRules && (
        <Card className="dashboard-panel border-0 shadow-sm mt-4 overflow-hidden bg-white">
          <Card.Header className="bg-light d-flex align-items-center gap-2 py-3 border-bottom-0">
            <IconNotes size={20} className="text-primary" />
            <h5 className="mb-0 fw-bold text-dark">My Attendance Rules</h5>
          </Card.Header>
          <Card.Body className="p-4 bg-light-subtle">
            <div className="rules-content text-secondary" style={{ whiteSpace: "pre-line", lineHeight: "1.6" }}>
              {attendanceRules}
            </div>
          </Card.Body>
        </Card>
      )}



      <style jsx global>{`
        .employee-dashboard-container {
          font-family: 'Inter', sans-serif;
        }

        .employee-dashboard-container .card,
        .employee-dashboard-container .alert {
          border-radius: 8px !important;
        }

        .employee-dashboard-container .card-body {
          min-width: 0;
        }

        .dashboard-panel {
          border: 1px solid #eef2f6 !important;
        }

        .welcome-hero-card {
          background: #ffffff;
          border: 1px solid #eef2f6 !important;
        }

        .employee-hero-body,
        .attendance-panel .card-body {
          padding: 22px;
        }

        .employee-hero-layout {
          align-items: center;
          display: grid;
          gap: 20px;
          grid-template-columns: auto minmax(0, 1fr) auto;
        }

        .employee-hero-copy {
          min-width: 0;
        }

        .employee-hero-title-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .employee-avatar {
          height: 92px;
          object-fit: cover;
          width: 92px;
        }

        .avatar-wrapper {
          display: inline-block;
          position: relative;
        }

        .status-dot {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 3px solid #ffffff;
          bottom: 4px;
          right: 4px;
        }

        .employee-status-badge {
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 10px;
        }

        .employee-designation-line {
          font-size: 15px;
          line-height: 1.45;
        }

        .employee-contact-grid {
          display: grid;
          gap: 8px 18px;
          grid-template-columns: repeat(3, minmax(0, max-content));
        }

        .employee-contact-grid > span {
          align-items: center;
          display: inline-flex;
          gap: 7px;
          min-width: 0;
        }

        .employee-contact-grid > span > span {
          overflow-wrap: anywhere;
        }

        .employee-hero-action .btn,
        .dashboard-action-btn {
          min-height: 44px;
          border-radius: 8px;
        }

        .shift-banner {
          background: #eff6ff;
          color: #1e3a8a;
          line-height: 1.5;
          padding: 14px 16px;
        }

        .shift-banner span {
          display: inline;
          margin-left: 4px;
        }

        .attendance-panel-heading {
          align-items: center;
          display: flex;
          gap: 12px;
        }

        .panel-icon,
        .metric-icon-box,
        .action-icon-wrapper {
          flex-shrink: 0;
        }

        .panel-icon,
        .metric-icon-box,
        .action-icon-wrapper {
          align-items: center;
          display: flex;
          justify-content: center;
        }

        .panel-icon {
          border-radius: 8px;
          height: 46px;
          width: 46px;
        }

        .dashboard-clock {
          align-items: center;
          background: #f8fafc;
          border: 1px solid #e8edf3;
          border-radius: 8px;
          display: inline-flex;
          gap: 12px;
          padding: 12px 14px;
        }

        .dashboard-clock .font-monospace {
          font-size: 18px;
        }

        .dashboard-action-btn {
          padding: 12px 28px;
        }

        .shift-complete-box {
          border-radius: 8px;
        }

        .metric-card {
          border: 1px solid #eef2f6 !important;
          border-radius: 8px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 24, 40, 0.06) !important;
        }

        .metric-icon-box {
          width: 48px;
          height: 48px;
          border-radius: 8px;
        }

        .quick-action-card {
          border: 1px solid #eef2f6 !important;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .quick-action-card:hover {
          transform: translateY(-3px);
          border-color: #4f46e5 !important;
          box-shadow: 0 10px 20px rgba(79, 70, 229, 0.05) !important;
        }

        .employee-task-metric {
          background: #ffffff;
          border: 1px solid #eef2f6;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-height: 88px;
          padding: 14px;
          position: relative;
          overflow: hidden;
        }

        .task-status-badge {
          border: 1px solid transparent;
          border-radius: 999px;
          font-weight: 700;
          padding: 5px 9px;
        }

        .task-status-pending {
          background: #e0f2fe !important;
          border-color: #bae6fd !important;
          color: #0369a1 !important;
        }

        .task-status-todo {
          background: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          color: #334155 !important;
        }

        .task-status-in-progress {
          background: #dbeafe !important;
          border-color: #bfdbfe !important;
          color: #1d4ed8 !important;
        }

        .task-status-on-hold {
          background: #fef3c7 !important;
          border-color: #fde68a !important;
          color: #b45309 !important;
        }

        .task-status-completed {
          background: #dcfce7 !important;
          border-color: #bbf7d0 !important;
          color: #15803d !important;
        }

        .task-status-closed {
          background: #ede9fe !important;
          border-color: #ddd6fe !important;
          color: #6d28d9 !important;
        }

        .task-status-cancelled {
          background: #fee2e2 !important;
          border-color: #fecaca !important;
          color: #b91c1c !important;
        }

        .employee-task-metric::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
        }

        .employee-task-metric.is-neutral::before {
          background: #64748b;
        }

        .employee-task-metric.is-primary::before {
          background: #2563eb;
        }

        .employee-task-metric.is-danger::before {
          background: #dc2626;
        }

        .employee-task-metric.is-warning::before {
          background: #f59e0b;
        }

        .employee-task-metric.is-success::before {
          background: #16a34a;
        }

        .employee-task-metric span {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .employee-task-metric strong {
          color: #0f172a;
          font-size: 24px;
          line-height: 1;
        }

        .employee-task-list {
          display: grid;
          gap: 10px;
        }

        .employee-task-header-actions {
          align-items: center;
          display: flex;
          gap: 10px;
        }

        .employee-task-progress {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          min-width: 170px;
          padding: 8px 10px;
        }

        .employee-task-progress span {
          color: #64748b;
          display: block;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
          margin-bottom: 6px;
          text-transform: uppercase;
        }

        .employee-task-progress strong {
          color: #0f172a;
          display: block;
          font-size: 17px;
          line-height: 1;
          margin-bottom: 8px;
        }

        .employee-task-progress div {
          background: #e2e8f0;
          border-radius: 999px;
          height: 6px;
          overflow: hidden;
        }

        .employee-task-progress i {
          background: #2563eb;
          border-radius: inherit;
          display: block;
          height: 100%;
          transition: width 0.25s ease;
        }

        .employee-task-row {
          align-items: center;
          border: 1px solid #eef2f6;
          border-radius: 8px;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 12px 14px;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .employee-task-row:hover {
          border-color: #cbd5e1;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
          transform: translateY(-1px);
        }

        .dashboard-project-chip {
          display: inline-flex;
          align-items: center;
          border: 1px solid currentColor;
          border-radius: 5px;
          background: color-mix(in srgb, currentColor 10%, white);
          font-size: 0.64rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 1;
          padding: 3px 6px;
        }

        .employee-task-due-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          color: #475569;
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
        }

        .employee-task-empty {
          align-items: center;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          display: flex;
          gap: 14px;
          padding: 22px;
        }

        .action-icon-wrapper {
          width: 46px;
          height: 46px;
          border-radius: 8px;
        }

        .section-heading {
          font-size: 18px;
        }

        .heading-welcome {
          font-family: 'Outfit', sans-serif;
          font-size: 28px;
          letter-spacing: 0;
          line-height: 1.15;
        }

        @media (max-width: 991.98px) {
          .employee-hero-layout {
            align-items: flex-start;
            grid-template-columns: auto minmax(0, 1fr);
          }

          .employee-hero-action {
            grid-column: 1 / -1;
          }

          .employee-hero-action .btn {
            width: 100%;
          }

          .employee-contact-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 575.98px) {
          .employee-dashboard-container {
            padding-top: 8px !important;
          }

          .employee-hero-body,
          .attendance-panel .card-body,
          .employee-dashboard-container .card-body {
            padding: 16px !important;
          }

          .employee-hero-layout {
            gap: 14px;
            grid-template-columns: 64px minmax(0, 1fr);
          }

          .employee-avatar {
            height: 64px;
            width: 64px;
          }

          .status-dot {
            border-width: 2px;
            height: 12px;
            width: 12px;
          }

          .heading-welcome {
            font-size: 18px;
          }

          .employee-designation-line {
            font-size: 12px;
            grid-column: 1 / -1;
            margin-bottom: 10px !important;
          }

          .employee-contact-grid {
            font-size: 11px;
            gap: 6px;
            grid-column: 1 / -1;
          }

          .employee-hero-copy {
            display: contents;
          }

          .employee-hero-title-row {
            align-content: center;
            min-height: 64px;
          }

          .employee-status-badge {
            font-size: 10px;
            padding: 4px 8px;
          }

          .employee-hero-action {
            grid-column: 1 / -1;
          }

          .shift-banner {
            font-size: 12px;
            padding: 12px;
          }

          .shift-banner span {
            display: block;
            margin-left: 0;
            margin-top: 2px;
          }

          .attendance-panel-heading h4 {
            font-size: 16px;
          }

          .dashboard-clock {
            display: flex;
            width: 100%;
          }

          .dashboard-clock .font-monospace {
            font-size: 16px;
          }

          .dashboard-action-btn {
            padding: 12px 16px;
            width: 100%;
          }

          .metric-card .card-body,
          .quick-action-card .card-body {
            padding: 14px !important;
          }

          .metric-card strong {
            font-size: 17px !important;
            overflow-wrap: anywhere;
          }

          .metric-icon-box,
          .action-icon-wrapper {
            height: 40px;
            width: 40px;
          }

          .section-heading {
            font-size: 16px;
          }

          .employee-task-header-actions {
            align-items: stretch;
            flex-direction: column;
            width: 100%;
          }

          .employee-task-header-actions .btn,
          .employee-task-progress {
            width: 100%;
          }

          .employee-task-row {
            grid-template-columns: 1fr;
          }

          .employee-task-empty {
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
};

export default EmployeeDashboard;
