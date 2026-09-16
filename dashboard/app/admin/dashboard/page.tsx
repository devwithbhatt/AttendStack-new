"use client";

import { useEffect, useMemo, useState ,  } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Alert, Badge, Card, Col, Row, Spinner } from "react-bootstrap";
import {
  IconAlertTriangle,
  IconCalendarTime,
  IconCircleCheck,
  IconClock,
  IconFlag,
  IconListDetails,
  IconListCheck,
  IconUsers,
  IconBuildingSkyscraper,
  IconShieldCheck,
} from "@tabler/icons-react";
import DashboardStats from "components/dashboard/DashboardStats";
import ActivityLog from "components/dashboard/ActivityLog";
import UpcomingIncrementsChartWidget from "components/UpcomingIncrementsChartWidget";
import { DashboardStatType } from "types/DashboardTypes";

const EmployeesByOrgChart = dynamic(
  () => import("components/dashboard/EmployeesByOrgChart"),
  { ssr: false }
);

type AttendanceRecord = {
  id: number | string;
  employee_name?: string;
  status: string;
  status_label?: string;
  date: string;
  check_in?: string | null;
  updated_at?: string;
};

type LeaveRequest = {
  id: number | string;
  employee_name?: string;
  leave_type_label?: string;
  status: string;
  start_date: string;
  end_date: string;
  created_at?: string;
  updated_at?: string;
};

type PayrollRecord = {
  id: number | string;
  employee_details?: { full_name?: string };
  status: string;
  month_name?: string;
  month: number;
  year: number;
  updated_at?: string;
  paid_on?: string | null;
};

type TaskRecord = {
  id: string;
  title: string;
  project_key?: string | null;
  project_name?: string | null;
  project_color?: string | null;
  subtask_count?: number;
  assignee_name?: string;
  assignee_department?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  priority_label?: string;
  status: "PENDING" | "TODO" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CLOSED" | "CANCELLED";
  status_label?: string;
  due_date?: string | null;
  is_overdue?: boolean;
  updated_at?: string;
  created_at?: string;
};

type ActivityItem = {
  description: string;
  timestamp: string;
  colorClass: string;
  createdAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
 
const authConfig = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  
  if (!token) {
    return { headers: {} };
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const toArray = (payload: any) => Array.isArray(payload) ? payload : payload?.results || [];

const formatDateTime = (value?: string | null) => {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatDate = (value?: string | null) => {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
};

const taskStatusClass = (status: TaskRecord["status"]) => {
  return `task-status-badge task-status-${status.toLowerCase().replace("_", "-")}`;
};

const getAttendanceDescription = (record: AttendanceRecord) => {
  const employee = record.employee_name || "Employee";
  const punchTime = record.check_in
    ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(record.check_in))
    : null;

  switch (record.status) {
    case "PRESENT":
      return { text: `${employee} checked in${punchTime ? ` at ${punchTime}` : ""}`, color: "success" };
    case "LATE":
      return { text: `${employee} checked in late${punchTime ? ` at ${punchTime}` : ""}`, color: "warning" };
    case "HALF_DAY":
      return { text: `${employee} has a half-day attendance record`, color: "info" };
    case "LEAVE":
      return { text: `${employee} is on unpaid leave`, color: "danger" };
    case "PAID_LEAVE":
      return { text: `${employee} is on paid leave`, color: "primary" };
    case "ABSENT":
      return { text: `${employee} is marked absent`, color: "danger" };
    case "HOLIDAY":
      return { text: `${employee} has a holiday record`, color: "success" };
    case "SUNDAY_UNPAID":
      return { text: `${employee} has Sunday unpaid`, color: "secondary" };
    default:
      return { text: `${employee} attendance updated to ${record.status_label || record.status}`, color: "primary" };
  }
};

const AdminDashboard = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [superAdminOverview, setSuperAdminOverview] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const router = useRouter();

  const isSuperAdmin = useMemo(() => {
    if (typeof window === "undefined") return false;
    const userData = localStorage.getItem("user");
    if (!userData) return false;
    try {
      const u = JSON.parse(userData);
      return u.role === "SUPER_ADMIN" || u.is_superuser;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("authToken");

    if (!token) {
      router.replace("/");
      return;
    }

    loadDashboard();
  }, [router]);

  const loadDashboard = async () => {
    setIsLoading(true);
    setError("");

    try {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      const month = today.getMonth() + 1;
      const year = today.getFullYear();

      const [employeesRes, todayRes, recentRes, leavesRes, payrollRes, tasksRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/employees/`, authConfig()),
        axios.get(`${API_URL}/api/v1/attendance/today/`, authConfig()),
        axios.get(`${API_URL}/api/v1/attendance/?date_from=${weekStart.toISOString().slice(0, 10)}`, authConfig()),
        axios.get(`${API_URL}/api/v1/attendance/leaves/`, authConfig()),
        axios.get(`${API_URL}/api/v1/payroll/?month=${month}&year=${year}`, authConfig()),
        axios.get(`${API_URL}/api/v1/tasks/?page_size=500`, authConfig()),
      ]);

      setEmployees(toArray(employeesRes.data));
      setTodayAttendance(toArray(todayRes.data));
      setRecentAttendance(toArray(recentRes.data));
      setLeaves(toArray(leavesRes.data));
      setPayrolls(toArray(payrollRes.data));
      setTasks(toArray(tasksRes.data));

      if (isSuperAdmin) {
        try {
          const superRes = await axios.get(`${API_URL}/api/v1/organizations/superadmin-overview/`, authConfig());
          setSuperAdminOverview(superRes.data);
        } catch {
          // Ignore if superadmin endpoint not reachable for normal user
        }
      }
    } catch (loadError: any) {
      console.error("Failed to load admin dashboard.", loadError);
      if (loadError.response?.status === 401) {
        localStorage.removeItem("authToken");
        router.replace("/");
        return;
      }
      setError("Unable to load live dashboard data. Please refresh or sign in again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const interval = window.setInterval(loadDashboard, 1800000);
    return () => window.clearInterval(interval);
  }, []);

  const attendanceCounts = useMemo(() => {
    const present = todayAttendance.filter((record) => ["PRESENT", "HALF_DAY"].includes(record.status)).length;
    const late = todayAttendance.filter((record) => record.status === "LATE").length;
    const absent = todayAttendance.filter((record) => record.status === "ABSENT").length;
    const leave = todayAttendance.filter((record) => record.status === "LEAVE").length;
    const paidLeave = todayAttendance.filter((record) => record.status === "PAID_LEAVE").length;
    return { present, late, absent, leave, paidLeave };
  }, [todayAttendance]);

  const activeEmployees = employees.filter((employee) => employee.status === "ACTIVE" || !employee.status).length;
  const attendanceRate = activeEmployees
    ? Math.round(((attendanceCounts.present + attendanceCounts.late) / activeEmployees) * 100)
    : 0;
  const pendingLeaves = leaves.filter((leave) => leave.status === "PENDING").length;
  const pendingPayroll = payrolls.filter((payroll) => payroll.status === "PENDING").length;
  const pendingTasks = tasks.filter((task) => task.status === "PENDING").length;
  const todoTasks = tasks.filter((task) => task.status === "TODO").length;
  const activeTasks = tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const overdueTasks = tasks.filter((task) => task.is_overdue).length;
  const onHoldTasks = tasks.filter((task) => task.status === "ON_HOLD").length;
  const urgentTasks = tasks.filter((task) => ["URGENT", "HIGH"].includes(task.priority) && !["COMPLETED", "CLOSED", "CANCELLED"].includes(task.status)).length;
  const completedTasks = tasks.filter((task) => ["COMPLETED", "CLOSED"].includes(task.status)).length;
  const taskCompletionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const recentTasks = useMemo(() => {
    const priorityRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    return [...tasks]
      .filter((task) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(task.status))
      .sort((a, b) => {
        const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
        if (priorityDifference) return priorityDifference;
        if (Boolean(a.is_overdue) !== Boolean(b.is_overdue)) return a.is_overdue ? -1 : 1;
        if (a.status === "ON_HOLD" && b.status !== "ON_HOLD") return -1;
        if (b.status === "ON_HOLD" && a.status !== "ON_HOLD") return 1;
        const aDue = daysUntil(a.due_date);
        const bDue = daysUntil(b.due_date);
        if (aDue !== null && bDue !== null) return aDue - bDue;
        if (aDue !== null) return -1;
        if (bDue !== null) return 1;
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
      })
      .slice(0, 5);
  }, [tasks]);

  const stats: DashboardStatType[] = [
    {
      id: "employees",
      title: "Active Employees",
      value: String(activeEmployees),
      icon: <IconUsers size={24} strokeWidth={1.5} />,
      bgColor: "bg-gradient-primary",
      textColor: "text-primary-emphasis",
      bottomValue: String(employees.length),
      description: "total profiles",
    },
    {
      id: "attendance-rate",
      title: "Attendance Rate",
      value: `${attendanceRate}%`,
      icon: <IconListCheck size={24} strokeWidth={1.5} />,
      bgColor: "bg-gradient-success",
      textColor: "text-success-emphasis",
      bottomValue: String(attendanceCounts.present + attendanceCounts.late),
      description: "checked in today",
    },
    {
      id: "pending-leaves",
      title: "Pending Leaves",
      value: String(pendingLeaves),
      icon: <IconCalendarTime size={24} strokeWidth={1.5} />,
      bgColor: "bg-gradient-warning",
      textColor: "text-warning-emphasis",
      bottomValue: String(attendanceCounts.leave + attendanceCounts.paidLeave),
      description: "on leave today",
    },
    {
      id: "payroll-pending",
      title: "Payroll Queue",
      value: String(pendingPayroll),
      icon: <IconClock size={24} strokeWidth={1.5} />,
      bgColor: "bg-gradient-info",
      textColor: "text-info-emphasis",
      bottomValue: payrolls.length ? String(payrolls.length) : "0",
      description: "records this month",
    },
  ];

  const attendanceChartData = [
    { status: "Present", count: attendanceCounts.present, color: "#16a34a" },
    { status: "Late", count: attendanceCounts.late, color: "#f59e0b" },
    { status: "Absent", count: attendanceCounts.absent, color: "#dc2626" },
    { status: "Leave", count: attendanceCounts.leave, color: "#ef4444" },
    { status: "Paid Leave", count: attendanceCounts.paidLeave, color: "#2563eb" },
  ];

  const activityLogs = useMemo(() => {
    const attendanceActivities: ActivityItem[] = recentAttendance.slice(0, 8).map((record) => {
      const descriptor = getAttendanceDescription(record);
      const createdAt = record.updated_at || record.check_in || record.date;
      return {
        description: descriptor.text,
        timestamp: formatDateTime(createdAt),
        colorClass: descriptor.color,
        createdAt,
      };
    });

    const leaveActivities: ActivityItem[] = leaves.slice(0, 8).map((leave) => ({
      description: `${leave.employee_name || "Employee"} ${leave.status.toLowerCase()} ${leave.leave_type_label || "leave"} request`,
      timestamp: formatDateTime(leave.updated_at || leave.created_at),
      colorClass: leave.status === "APPROVED" ? "success" : leave.status === "REJECTED" ? "danger" : "warning",
      createdAt: leave.updated_at || leave.created_at || leave.start_date,
    }));

    const payrollActivities: ActivityItem[] = payrolls.slice(0, 6).map((payroll) => ({
      description: `${payroll.employee_details?.full_name || "Employee"} payroll is ${payroll.status}`,
      timestamp: formatDateTime(payroll.paid_on || payroll.updated_at),
      colorClass: payroll.status === "PAID" ? "success" : "warning",
      createdAt: payroll.paid_on || payroll.updated_at || new Date().toISOString(),
    }));

    return [...attendanceActivities, ...leaveActivities, ...payrollActivities]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }, [recentAttendance, leaves, payrolls]);

  return (
    <div className="admin-dashboard-page">
      {/* Super Admin Top Control Banner */}
      {isSuperAdmin && (
        <Card className="border-0 shadow-sm mb-4 bg-gradient text-white" style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", borderRadius: 14 }}>
          <Card.Body className="p-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <Badge bg="warning" text="dark" className="fw-bold px-2.5 py-1 rounded-pill">
                  SUPER ADMIN
                </Badge>
                <span className="text-white-50 small">Multi-tenant Control Hub</span>
              </div>
              <h4 className="fw-bold text-white mb-1 d-flex align-items-center gap-2">
                <IconBuildingSkyscraper size={24} className="text-warning" />
                Manage All Registered Companies
              </h4>
              <p className="text-white-50 mb-0 small">
                You have platform-wide access. Oversee {superAdminOverview?.summary?.total_companies ?? "all"} companies, HR managers, and global workforce operations.
              </p>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Link href="/admin/organizations" className="btn btn-warning fw-semibold px-4 py-2 shadow-sm d-flex align-items-center gap-2 text-dark">
                <IconShieldCheck size={18} />
                Manage Every Company Panel
              </Link>
            </div>
          </Card.Body>
        </Card>
      )}

      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-5">
        <div>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Badge bg="primary-subtle" text="primary" className="border border-primary-subtle px-3 py-2 rounded-pill">
              Live Operations
            </Badge>
            <span className="text-secondary small">Auto-refreshes every 30 minutes</span>
          </div>
          <h2 className="mb-1 fw-bold text-dark">Admin Dashboard</h2>
          <p className="text-secondary mb-0">Workforce attendance, leave approvals, payroll queue, and operational activity.</p>
        </div>
        <Card className="border-0 shadow-sm admin-health-card">
          <Card.Body className="py-3 px-4 d-flex align-items-center gap-3">
            <div className="rounded-circle bg-success-subtle text-success d-flex align-items-center justify-content-center" style={{ width: 42, height: 42 }}>
              <IconCircleCheck size={22} />
            </div>
            <div>
              <div className="fw-bold text-dark">System Live</div>
              <div className="small text-secondary" suppressHydrationWarning>{formatDateTime(new Date().toISOString())}</div>
            </div>
          </Card.Body>
        </Card>
      </div>


      {error && (
        <Alert variant="danger" className="border-0 shadow-sm d-flex align-items-center gap-2">
          <IconAlertTriangle size={18} />
          {error}
        </Alert>
      )}

      {isLoading ? (
        <div className="d-flex justify-content-center align-items-center py-6">
          <Spinner animation="border" variant="primary" />
        </div>
      ) : (
        <>
          <Row className="g-4 mb-5">
            <DashboardStats stats={stats} />
          </Row>

          <Card className="border-0 shadow-sm mb-4 admin-task-panel">
            <Card.Header className="bg-white border-0 py-4 d-flex flex-column flex-xl-row align-items-xl-center justify-content-between gap-3 admin-task-header">
              <div className="d-flex align-items-center gap-3 admin-task-heading">
                <div className="rounded bg-primary-subtle text-primary d-flex align-items-center justify-content-center" style={{ width: 44, height: 44 }}>
                  <IconListDetails size={22} />
                </div>
                <div>
                  <h5 className="mb-1 fw-bold text-dark">Project Delivery Overview</h5>
                  <p className="text-secondary small mb-0">Live project workload, ownership, deadlines, and delivery risk across your team.</p>
                </div>
              </div>
              <div className="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center gap-2 admin-task-actions">
                <div className="task-completion-pill">
                  <span>Completion</span>
                  <strong>{taskCompletionRate}%</strong>
                  <div className="task-completion-track">
                    <div style={{ width: `${taskCompletionRate}%` }} />
                  </div>
                </div>
                <Link href="/tasks" className="btn btn-outline-primary btn-sm px-3">
                  Open Workspace
                </Link>
              </div>
            </Card.Header>
            <Card.Body className="pt-0">
              <Row className="g-3 mb-4">
                <Col xs={6} lg={3} xl={2}>
                  <Link href="/tasks?status=PENDING" className="task-dashboard-metric is-neutral">
                    <span>Pending</span>
                    <strong>{pendingTasks}</strong>
                  </Link>
                </Col>
                <Col xs={6} lg={3} xl={2}>
                  <Link href="/tasks?status=TODO" className="task-dashboard-metric is-neutral">
                    <span>To Do</span>
                    <strong>{todoTasks}</strong>
                  </Link>
                </Col>
                <Col xs={6} lg={3} xl={2}>
                  <Link href="/tasks?task_filter=active" className="task-dashboard-metric is-primary">
                    <span>Active</span>
                    <strong>{activeTasks}</strong>
                  </Link>
                </Col>
                <Col xs={6} lg={3} xl={2}>
                  <Link href="/tasks?task_filter=overdue" className="task-dashboard-metric is-danger">
                    <span>Overdue</span>
                    <strong>{overdueTasks}</strong>
                  </Link>
                </Col>
                <Col xs={6} lg={3} xl={2}>
                  <Link href="/tasks?task_filter=on-hold" className="task-dashboard-metric is-warning">
                    <span>On Hold</span>
                    <strong>{onHoldTasks}</strong>
                  </Link>
                </Col>
                <Col xs={6} lg={3} xl={2}>
                  <Link href="/tasks?task_filter=high-priority" className="task-dashboard-metric is-danger">
                    <span>High Priority</span>
                    <strong>{urgentTasks}</strong>
                  </Link>
                </Col>
              </Row>

              {recentTasks.length === 0 ? (
                <div className="task-empty-state">
                  <IconFlag size={28} className="text-primary" />
                  <div>
                    <div className="fw-bold text-dark">No task workload yet</div>
                    <div className="text-secondary small">Assign tasks to employees to start tracking ownership, due dates, and execution health.</div>
                  </div>
                </div>
              ) : (
                <><div className="task-dashboard-list">
                  {recentTasks.map((task) => (
                    <div key={task.id} className="task-dashboard-row">
                      <div className="min-w-0">
                        <div className="d-flex align-items-center gap-2 min-w-0 task-dashboard-title-line">
                          <div className="fw-semibold text-dark text-truncate">{task.title}</div>
                          {task.project_key && <span className="dashboard-project-chip" style={{ color: task.project_color || "#4f46e5", borderColor: task.project_color || "#4f46e5" }}>{task.project_key}</span>}
                          {task.due_date && (
                            <span className="task-due-chip">{formatDate(task.due_date)}</span>
                          )}
                        </div>
                        <div className="small text-secondary text-truncate mt-1">
                          {task.assignee_name || "Unassigned"} {task.assignee_department ? `- ${task.assignee_department}` : ""}{task.subtask_count ? ` · ${task.subtask_count} subtask${task.subtask_count === 1 ? "" : "s"}` : ""}
                        </div>
                      </div>
                      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end task-dashboard-badges">
                        {task.is_overdue && <Badge bg="danger-subtle" className="text-danger border border-danger-subtle">Overdue</Badge>}
                        <Badge bg={task.priority === "URGENT" || task.priority === "HIGH" ? "warning-subtle" : "info-subtle"} className={task.priority === "URGENT" || task.priority === "HIGH" ? "text-warning" : "text-info"}>
                          {task.priority_label || task.priority}
                        </Badge>
                        <Badge className={taskStatusClass(task.status)}>
                          {task.status_label || task.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div><div className="text-center mt-3"><Link href="/tasks" className="btn btn-outline-primary btn-sm px-4">Show all tasks</Link></div></>
              )}
            </Card.Body>
          </Card>

          {/* Employee Salary Increments Strategy Line Chart */}
          <UpcomingIncrementsChartWidget />

          <Row className="g-4 mb-4">
            <Col xs={12} xl={8}>
              <EmployeesByOrgChart data={attendanceChartData} />
            </Col>
            <Col xs={12} xl={4}>
              <ActivityLog logs={activityLogs} />
            </Col>
          </Row>
        </>
      )}

      <style jsx global>{`
        .admin-dashboard-page .card {
          border-radius: 12px;
        }

        .admin-health-card {
          min-width: 250px;
        }

        .admin-dashboard-page .card-lg {
          border: 1px solid #eef2f6;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
          min-height: 160px;
        }

        .admin-dashboard-page .card-lg:hover {
          transform: translateY(-2px);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
        }

        .task-dashboard-metric {
          background: #ffffff;
          border: 1px solid #eef2f6;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 92px;
          padding: 14px 16px;
          position: relative;
          overflow: hidden;
          text-decoration: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .task-dashboard-metric:hover,
        .task-dashboard-metric:focus-visible {
          border-color: #cbd5e1;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          transform: translateY(-2px);
        }

        .task-dashboard-metric:focus-visible {
          outline: 3px solid rgba(37, 99, 235, 0.18);
          outline-offset: 2px;
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

        .task-dashboard-metric::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
        }

        .task-dashboard-metric.is-neutral::before {
          background: #64748b;
        }

        .task-dashboard-metric.is-primary::before {
          background: #2563eb;
        }

        .task-dashboard-metric.is-warning::before {
          background: #f59e0b;
        }

        .task-dashboard-metric.is-danger::before {
          background: #dc2626;
        }

        .task-dashboard-metric span {
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .task-dashboard-metric strong {
          color: #0f172a;
          font-size: 28px;
          line-height: 1;
        }

        .task-completion-pill {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          min-width: 180px;
          padding: 9px 12px;
        }

        .task-completion-pill span {
          color: #64748b;
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          line-height: 1;
          margin-bottom: 6px;
          text-transform: uppercase;
        }

        .task-completion-pill strong {
          color: #0f172a;
          display: block;
          font-size: 18px;
          line-height: 1;
          margin-bottom: 8px;
        }

        .task-completion-track {
          background: #e2e8f0;
          border-radius: 999px;
          height: 6px;
          overflow: hidden;
        }

        .task-completion-track > div {
          background: #2563eb;
          border-radius: inherit;
          height: 100%;
          transition: width 0.25s ease;
        }

        .task-dashboard-list {
          display: grid;
          gap: 10px;
        }

        .task-dashboard-row {
          align-items: center;
          border: 1px solid #eef2f6;
          border-radius: 10px;
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1fr) auto;
          padding: 14px;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .task-dashboard-row > div,
        .task-dashboard-title-line {
          min-width: 0;
        }

        .task-dashboard-row:hover {
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

        .task-due-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          color: #475569;
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
        }

        .task-empty-state {
          align-items: center;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          display: flex;
          gap: 14px;
          padding: 24px;
        }

        @media (max-width: 575.98px) {
          .admin-task-panel .card-header,
          .admin-task-panel .card-body {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }

          .admin-task-heading {
            align-items: flex-start !important;
          }

          .admin-task-heading > :first-child {
            flex: 0 0 44px;
          }

          .admin-task-actions,
          .task-completion-pill {
            width: 100%;
          }

          .task-dashboard-row {
            gap: 10px;
            grid-template-columns: 1fr;
            padding: 12px;
          }

          .task-dashboard-title-line {
            align-items: flex-start !important;
            flex-wrap: wrap;
          }

          .task-dashboard-title-line > .fw-semibold {
            flex: 1 0 100%;
            white-space: normal !important;
            overflow-wrap: anywhere;
          }

          .task-dashboard-badges {
            justify-content: flex-start !important;
          }

          .task-empty-state {
            align-items: flex-start;
          }
        }

        @media (max-width: 380px) {
          .admin-task-heading {
            gap: 10px !important;
          }

          .admin-task-heading > :first-child {
            display: none !important;
          }

          .task-dashboard-metric {
            min-height: 82px;
            padding: 12px;
          }

          .task-dashboard-metric strong {
            font-size: 24px;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;