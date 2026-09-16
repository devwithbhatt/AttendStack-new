"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, Col, Form, Modal, Row, Table, Alert } from "react-bootstrap";
import { IconCalendar, IconList, IconPencil, IconRefresh, IconTrash, IconSettings } from "@tabler/icons-react";
import CustomPagination from "components/shared/CustomPagination";
import AttendanceCalendar from "./AttendanceCalendar";
import Swal from "sweetalert2";

const DEFAULT_RULES = `1. Core Working Hours: 10:00 AM to 6:00 PM.
2. Late Entry: Arriving after 10:15 AM will be marked as Late.
3. Half Day: Checking out before the final two hours of the scheduled shift is considered a half day. An approved Casual or Sick half-day leave uses 0.5 of that leave balance.
4. Leave Requests: Must be submitted at least 24 hours in advance.
5. Unpaid Leave: Absences without prior approval will be considered Unpaid.`;

type AttendanceRecord = {
  id: number;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  employee_department: string;
  employee_avatar_url: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  status_label: string;
  live_status: string;
  is_paid: boolean;
};

type AttendanceListResponse = {
  results: AttendanceRecord[];
  count: number;
};

type EmployeeOption = {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  status: "ACTIVE" | "PROVISION" | "ON_LEAVE" | "NOTICE_PERIOD" | "INACTIVE" | "TERMINATED";
  annual_salary?: number | string;
};

type EmployeeSummary = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  present: number;
  late: number;
  absent: number;
  halfDay: number;
  leave: number;
  paidLeave: number;
  holiday: number;
  sundayPaid: number;
  sundayUnpaid: number;
  unpaidDays: number;
  monthlySalary: number | string | null;
  deductions: number | string | null;
  payableSalary: number | string | null;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/`;
const PAYROLL_SUMMARY_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/payroll/summary/`;
const recordsPerPage = 31;

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "--";
  const formattedDate = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  if (date.getDay() === 0) { // 0 is Sunday
    return `${formattedDate} (Sunday)`;
  }
  return formattedDate;
};

const formatTime = (value?: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
};

const formatCurrency = (value: number | string | null) => {
  if (value === null || value === "N/A") return "N/A";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "PRESENT": return "success";
    case "LATE": return "warning";
    case "HALF_DAY": return "info";
    case "ABSENT": return "danger";
    case "LEAVE": return "danger";
    case "PAID_LEAVE": return "primary";
    case "HOLIDAY": return "success";
    case "SUNDAY_PAID": return "dark";
    case "SUNDAY_UNPAID": return "secondary";
    default: return "light";
  }
};

const attendanceStatuses = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late Entry" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
  { value: "LEAVE", label: "Leave" },
  { value: "PAID_LEAVE", label: "Paid Leave" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "SUNDAY_PAID", label: "Sunday" },
  { value: "SUNDAY_UNPAID", label: "Sunday Unpaid" },
];

const monthOptions = [
  { value: 1, name: "January" },
  { value: 2, name: "February" },
  { value: 3, name: "March" },
  { value: 4, name: "April" },
  { value: 5, name: "May" },
  { value: 6, name: "June" },
  { value: 7, name: "July" },
  { value: 8, name: "August" },
  { value: 9, name: "September" },
  { value: 10, name: "October" },
  { value: 11, name: "November" },
  { value: 12, name: "December" },
];

const parseResponseBody = async (response: Response) => {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const getErrorMessage = (body: unknown, fallback: string) => {
  if (!body) return fallback;
  if (typeof body === "string") return body || fallback;
  if (typeof body !== "object") return fallback;

  const errorBody = body as Record<string, unknown>;
  if (typeof errorBody.detail === "string") return errorBody.detail;

  const messages = Object.values(errorBody)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return messages.join(" ") || fallback;
};

const AttendanceRecordsClient = () => {
  const today = new Date();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [filterMode, setFilterMode] = useState<"month" | "range">("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState("All");

  // Permissions
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          setCurrentUser(JSON.parse(stored));
        }
      } catch {}
    }
  }, []);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isHR = currentUser?.role === "HR";
  const isSubAdmin = currentUser?.role === "SUB_ADMIN";
  const attendancePerm = currentUser?.permissions?.attendance;

  const canEdit = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof attendancePerm === "object" && attendancePerm !== null
      ? Boolean(attendancePerm.edit)
      : Boolean(attendancePerm)
  ) : false);

  const canDelete = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof attendancePerm === "object" && attendancePerm !== null
      ? Boolean(attendancePerm.delete)
      : false
  ) : false);

  const [totalRecords, setTotalRecords] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(nameQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [nameQuery]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<AttendanceRecord | null>(null);
  const [view, setView] = useState("table");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [attendanceRules, setAttendanceRules] = useState("");
  const [employeesList, setEmployeesList] = useState<EmployeeOption[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<EmployeeSummary[]>([]);

  useEffect(() => {
    const savedRules = localStorage.getItem("attendance_rules");
    setAttendanceRules(savedRules || DEFAULT_RULES);
  }, []);

  const handleSaveRules = () => {
    localStorage.setItem("attendance_rules", attendanceRules);
    setIsRulesModalOpen(false);
    Swal.fire("Saved", "Attendance rules updated successfully.", "success");
  };

  const loadEmployees = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Failed to load employees list.");
      const data = await response.json();
      const employees = (Array.isArray(data) ? data : data.results || []) as EmployeeOption[];
      setEmployeesList(
        employees.filter((employee) =>
          ["ACTIVE", "PROVISION", "ON_LEAVE", "NOTICE_PERIOD"].includes(employee.status)
        )
      );
    } catch (err) {
      // console.error("Failed to load employees list:", err);
    }
  };

  const handleApiCall = async (url: string, options: RequestInit, successMessage: string, errorMessage: string) => {
    try {
      const response = await fetch(url, options);
      const data = await parseResponseBody(response);

      if (!response.ok) {
        const errMsg = getErrorMessage(data, errorMessage);
        throw new Error(errMsg);
      }

      return { success: true, data: data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred." };
    }
  };

  const handleCreateRecord = async (newRecord: {
    employee: string;
    date: string;
    check_in: string | null;
    check_out: string | null;
    status: string;
    notes: string;
  }) => {
    const result = await handleApiCall(
      API_URL,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(newRecord),
      },
      "Record created successfully.",
      "Failed to create the record."
    );

    if (result.success) {
      setIsCreateOpen(false);
      loadRecords();
    } else {
      setError(result.error || "");
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleUpdateRecord = async (updatedRecord: AttendanceRecord) => {
    if (!canEdit) {
      setError("Permission denied. You do not have permission to edit attendance records.");
      return;
    }

    const result = await handleApiCall(
      `${API_URL}${updatedRecord.id}/`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(updatedRecord),
      },
      "Record updated successfully.",
      "Failed to update the record."
    );

    if (result.success) {
      setEditingRecord(null);
      loadRecords();
    } else {
      setError(result.error || "");
    }
  };

  const handleSaveChanges = (updatedRecord: AttendanceRecord) => {
    if (!editingRecord) return;
    handleUpdateRecord(updatedRecord);
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;

    if (!canDelete) {
      setError("Permission denied. You do not have permission to delete attendance records.");
      return;
    }

    const result = await handleApiCall(
      `${API_URL}${deletingRecord.id}/`,
      {
        method: "DELETE",
        headers: authHeaders(),
      },
      "Record deleted successfully.",
      "Failed to delete the record."
    );

    if (result.success) {
      setDeletingRecord(null);
      loadRecords();
    } else {
      setError(result.error || "");
    }
  };

  const loadRecords = async () => {
    setIsLoading(true);
    setError("");

    const params = new URLSearchParams();
    const today = new Date();
    
    if (filterMode === "month") {
      params.set("year", String(selectedYear));
      params.set("month", String(selectedMonth));
      if (selectedDay !== "All") {
        params.set("day", selectedDay);
      }
      
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      if (Number(selectedYear) > currentYear || (Number(selectedYear) === currentYear && Number(selectedMonth) > currentMonth)) {
        setRecords([]);
        setTotalRecords(0);
        setIsLoading(false);
        return;
      }

      if (Number(selectedYear) === currentYear && Number(selectedMonth) === currentMonth) {
        params.set("date_to", today.toISOString().split('T')[0]);
      }

    } else {
      if (startDate) params.set("date_from", startDate);
      if (endDate) params.set("date_to", endDate);
    }
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

    if (filterMode !== "month") {
      params.set("page", String(currentPage));
      params.set("page_size", String(recordsPerPage));
    }

    const result = await handleApiCall(
      `${API_URL}?${params.toString()}`,
      { headers: authHeaders() },
      "Records loaded successfully.",
      "Unable to load attendance records."
    );

    if (result.success) {
      if (Array.isArray(result.data)) {
        setRecords(result.data);
        setTotalRecords(result.data.length);
        setCurrentPage(1);
      } else {
        setRecords(result.data.results);
        setTotalRecords(result.data.count);
      }
    } else {
      setError(result.error || "");
    }
    setIsLoading(false);
  };

  const loadMonthlySummary = async () => {
    if (filterMode !== "month") {
      setMonthlySummary([]);
      return;
    }

    const params = new URLSearchParams();
    params.set("year", String(selectedYear));
    params.set("month", String(selectedMonth));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

    const result = await handleApiCall(
      `${PAYROLL_SUMMARY_URL}?${params.toString()}`,
      { headers: authHeaders() },
      "Monthly summary loaded successfully.",
      "Unable to load monthly payroll summary."
    );

    if (result.success) {
      setMonthlySummary(Array.isArray(result.data) ? result.data : result.data.results || []);
    } else {
      setError(result.error || "");
    }
  };

  useEffect(() => {
    loadRecords();
  }, [selectedYear, selectedMonth, selectedDay, statusFilter, debouncedSearch, filterMode, startDate, endDate, currentPage]);

  useEffect(() => {
    loadMonthlySummary();
  }, [selectedYear, selectedMonth, debouncedSearch, filterMode]);

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  const employeeSummary = useMemo(() => {
    const summary: Record<string, EmployeeSummary> = {};
    const salaryByEmployeeId = new Map<string, number>(
      employeesList.map((employee) => [employee.employee_id, Number(employee.annual_salary || 0)] as [string, number])
    );

    records.forEach((record) => {
      if (!summary[record.employee_id]) {
        summary[record.employee_id] = {
          id: record.employee_id,
          name: record.employee_name,
          email: record.employee_email,
          avatar: record.employee_avatar_url,
          present: 0,
          late: 0,
          absent: 0,
          halfDay: 0,
          leave: 0,
          paidLeave: 0,
          holiday: 0,
          sundayPaid: 0,
          sundayUnpaid: 0,
          unpaidDays: 0,
          monthlySalary: null,
          deductions: null,
          payableSalary: null,
        };
      }
      if (record.status === "PRESENT") summary[record.employee_id].present += 1;
      if (record.status === "LATE") summary[record.employee_id].late += 1;
      if (record.status === "ABSENT") summary[record.employee_id].absent += 1;
      if (record.status === "HALF_DAY") summary[record.employee_id].halfDay += 1;
      if (record.status === "LEAVE") summary[record.employee_id].leave += 1;
      if (record.status === "PAID_LEAVE") summary[record.employee_id].paidLeave += 1;
      if (record.status === "HOLIDAY") summary[record.employee_id].holiday += 1;
      if (record.status === "SUNDAY_PAID") summary[record.employee_id].sundayPaid += 1;
      if (record.status === "SUNDAY_UNPAID") summary[record.employee_id].sundayUnpaid += 1;
      
      if (["ABSENT", "LEAVE", "SUNDAY_UNPAID"].includes(record.status)) summary[record.employee_id].unpaidDays += 1;
      if (record.status === "HALF_DAY" && !record.is_paid) summary[record.employee_id].unpaidDays += 0.5;
    });

    if (filterMode === "month") {
      return monthlySummary;
    }

    return Object.values(summary).map((item) => {
      const annualSalary = salaryByEmployeeId.get(item.id) || 0;
      if (!annualSalary) {
        return {
          ...item,
          monthlySalary: "N/A",
          deductions: "N/A",
          payableSalary: "N/A",
        };
      }

      const monthlySalary = annualSalary / 12;
      const deductions = item.unpaidDays * (monthlySalary / daysInMonth);
      return {
        ...item,
        monthlySalary,
        deductions,
        payableSalary: monthlySalary - deductions,
      };
    });
  }, [records, employeesList, filterMode, daysInMonth, monthlySummary]);

  const calendarEvents = useMemo(() => {
    const filteredRecords = selectedEmployee ? records.filter((record) => record.employee_id === selectedEmployee) : records;
    return filteredRecords.map((record) => ({
      title: `${record.employee_name} - ${record.status_label}`,
      start: new Date(record.date),
      end: new Date(record.date),
      allDay: true,
      resource: record,
    }));
  }, [records, selectedEmployee]);

  const years = Array.from({ length: 5 }, (_, index) => today.getFullYear() - index);
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const totalPages = filterMode === 'month' ? 1 : Math.ceil(totalRecords / recordsPerPage);

  return (
    <Fragment>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          {/* Optional: Add page-level actions here if needed */}
        </div>
        <Button variant="outline-dark" onClick={() => setIsRulesModalOpen(true)} className="d-flex align-items-center gap-2">
          <IconSettings size={18} /> Set Attendance Rules
        </Button>
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <CardBody>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0 text-muted small text-uppercase fw-bold">Filter Options</h5>
            <div className="btn-group btn-group-sm shadow-sm" role="group">
              <button 
                type="button" 
                className={`btn btn-outline-primary px-3 ${filterMode === "month" ? "active" : ""}`}
                onClick={() => setFilterMode("month")}
              >
                Month View
              </button>
              <button 
                type="button" 
                className={`btn btn-outline-primary px-3 ${filterMode === "range" ? "active" : ""}`}
                onClick={() => setFilterMode("range")}
              >
                Custom Range
              </button>
            </div>
          </div>
          <Row className="align-items-end g-3">
            {filterMode === "month" ? (
              <Fragment>
                <Col md={2}>
                  <Form.Group controlId="yearFilter">
                    <Form.Label>Year</Form.Label>
                    <Form.Select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                      {years.map((year) => <option key={year} value={year}>{year}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <Form.Group controlId="monthFilter">
                    <Form.Label>Month</Form.Label>
                    <Form.Select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                      {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.name}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={2}>
                  <Form.Group controlId="dayFilter">
                    <Form.Label>Day</Form.Label>
                    <Form.Select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)}>
                      <option value="All">All</option>
                      {days.map((day) => <option key={day} value={day}>{day}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Fragment>
            ) : (
              <Fragment>
                <Col md={3}>
                  <Form.Group controlId="startDateFilter">
                    <Form.Label>Start Date</Form.Label>
                    <Form.Control type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group controlId="endDateFilter">
                    <Form.Label>End Date</Form.Label>
                    <Form.Control type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </Form.Group>
                </Col>
              </Fragment>
            )}
            <Col md={3}>
              <Form.Group controlId="employeeSearch">
                <Form.Label>Employee</Form.Label>
                <Form.Control value={nameQuery} onChange={(event) => setNameQuery(event.target.value)} placeholder="Name, ID, or email" />
              </Form.Group>
            </Col>
            <Col md={2}>
              <Form.Group controlId="statusFilter">
                <Form.Label>Status</Form.Label>
                <Form.Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="All">All</option>
                  {attendanceStatuses.map((attendanceStatus) => (
                    <option key={attendanceStatus.value} value={attendanceStatus.value}>{attendanceStatus.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={1} className="d-grid">
              <Button variant="primary" onClick={loadRecords}><IconRefresh size={20} /></Button>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="bg-white d-flex justify-content-between align-items-center">
          <h4 className="mb-0">Monthly Employee Summary</h4>
          <div>
            {view === "calendar" && selectedEmployee && (
              <Button variant="outline-secondary" size="sm" onClick={() => setSelectedEmployee(null)} className="me-2">
                Back to All
              </Button>
            )}
            <Button variant="outline-secondary" size="sm" onClick={() => setView(view === "table" ? "calendar" : "table")}>
              {view === "table" ? <IconCalendar size={16} /> : <IconList size={16} />} {view === "table" ? "Calendar View" : "Table View"}
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {view === "table" ? (
            <Table hover responsive className="text-nowrap align-middle" style={{ minWidth: "1150px" }}>
              <thead className="table-light">
                <tr>
                  <th>Employee</th>
                  <th className="text-center">Present</th>
                  <th className="text-center">Late Entry</th>
                  <th className="text-center">Absent</th>
                  <th className="text-center">Half Day</th>
                  <th className="text-center">Leave</th>
                  <th className="text-center">Paid Leave</th>
                  <th className="text-center">Holiday</th>
                  <th className="text-center">Sunday Paid</th>
                  <th className="text-center">Sunday Unpaid</th>
                  <th className="text-center">Unpaid Days</th>
                  <th className="text-end">Monthly Salary</th>
                  <th className="text-end">Deductions</th>
                  <th className="text-end">Payable Salary</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
            <tbody>
                {employeeSummary.length === 0 && (
                  <tr>
                    <td colSpan={16} className="text-center py-4 text-secondary">
                      No summary available for selected filters.
                    </td>
                  </tr>
                )}
                {employeeSummary.map((summary) => (
                  <tr key={summary.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <img
                          src={summary.avatar || "/images/avatar/avatar-fallback.jpg"}
                          alt={summary.name}
                          className="avatar avatar-sm rounded-circle me-3"
                        />
                        <div>
                          <div className="fw-semibold">{summary.name}</div>
                          <small className="text-muted">
                            {summary.id} - {summary.email}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="text-center fw-bold text-success">{summary.present}</td>
                    <td className="text-center fw-bold text-warning">{summary.late}</td>
                    <td className="text-center fw-bold text-danger">{summary.absent}</td>
                    <td className="text-center fw-bold text-info">{summary.halfDay}</td>
                    <td className="text-center fw-bold text-danger">{summary.leave}</td>
                    <td className="text-center fw-bold text-primary">{summary.paidLeave}</td>
                    <td className="text-center fw-bold text-success">{summary.holiday}</td>
                    <td className="text-center fw-bold text-primary">{summary.sundayPaid}</td>
                    <td className="text-center fw-bold text-secondary">{summary.sundayUnpaid}</td>
                    <td className="text-center fw-bold text-danger">{summary.unpaidDays}</td>
                    <td className="text-end">{summary.monthlySalary !== null ? formatCurrency(summary.monthlySalary) : "N/A"}</td>
                    <td className="text-end">{summary.deductions !== null ? formatCurrency(summary.deductions) : "N/A"}</td>
                    <td className="text-end fw-bold">{summary.payableSalary !== null ? formatCurrency(summary.payableSalary) : "N/A"}</td>
                    <td className="text-end">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => {
                          setView("calendar");
                          setSelectedEmployee(summary.id);
                        }}
                      >
                        View Calendar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <AttendanceCalendar
              events={calendarEvents}
              date={new Date(selectedYear, selectedMonth - 1)}
              onSelectEvent={(event) => setEditingRecord(event.resource)}
            />
          )}
        </CardBody>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="bg-white d-flex justify-content-between align-items-center">
          <h4 className="mb-0">Attendance Log</h4>
          {canEdit && (
            <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
              + Add Record
            </Button>
          )}
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : error ? (
            <Alert variant="danger">{error}</Alert>
          ) : (
            <Table hover responsive className="text-nowrap align-middle" style={{ minWidth: "750px" }}>
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                  {(canEdit || canDelete) && <th className="text-end">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={(canEdit || canDelete) ? 7 : 6} className="text-center py-4 text-secondary">
                      No attendance records found.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>
                        <div className="d-flex align-items-center">
                          <img
                            src={record.employee_avatar_url || "/images/avatar/avatar-fallback.jpg"}
                            alt={record.employee_name}
                            className="avatar avatar-sm rounded-circle me-3"
                          />
                          <div>
                            <div className="fw-semibold">{record.employee_name}</div>
                            <small className="text-muted">{record.employee_id}</small>
                          </div>
                        </div>
                      </td>
                      <td>{record.employee_department}</td>
                      <td>
                        {["PRESENT", "LATE", "HALF_DAY"].includes(record.status)
                          ? formatTime(record.check_in)
                          : "--"}
                      </td>
                      <td>
                        {["PRESENT", "LATE", "HALF_DAY"].includes(record.status)
                          ? formatTime(record.check_out)
                          : "--"}
                      </td>
                      <td>
                        <Badge bg={getStatusBadge(record.status)}>{record.status_label}</Badge>
                      </td>
                      {(canEdit || canDelete) && (
                        <td className="text-end">
                          {canEdit && (
                            <Button variant="white" size="sm" className="btn-icon" onClick={() => setEditingRecord(record)}>
                              <IconPencil size={16} />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="white" size="sm" className="btn-icon" onClick={() => setDeletingRecord(record)}>
                              <IconTrash size={16} />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </CardBody>
        {filterMode !== 'month' && totalPages > 1 && (
          <Card.Footer className="bg-white d-flex justify-content-end">
            <CustomPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </Card.Footer>
        )}
      </Card>

      {isCreateOpen && (
        <Modal show={isCreateOpen} onHide={() => setIsCreateOpen(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Create Attendance Record</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form id="create-attendance-form">
              <Form.Group className="mb-3" controlId="formEmployeeSelect">
                <Form.Label>Employee</Form.Label>
                <Form.Select name="employee" required>
                  <option value="">Select Employee...</option>
                  {employeesList.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_id || emp.email})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3" controlId="formDate">
                <Form.Label>Date</Form.Label>
                <Form.Control name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formCheckIn">
                <Form.Label>Check In</Form.Label>
                <Form.Control name="checkin" type="time" defaultValue="10:00" />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formCheckOut">
                <Form.Label>Check Out</Form.Label>
                <Form.Control name="checkout" type="time" defaultValue="18:00" />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formStatus">
                <Form.Label>Status</Form.Label>
                <Form.Select name="status" defaultValue="PRESENT">
                  {attendanceStatuses.map((attendanceStatus) => (
                    <option key={attendanceStatus.value} value={attendanceStatus.value}>{attendanceStatus.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3" controlId="formNotes">
                <Form.Label>Notes</Form.Label>
                <Form.Control name="notes" as="textarea" rows={3} placeholder="Add optional details..." />
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => {
              const form = document.querySelector("#create-attendance-form") as HTMLFormElement;
              const employeeSelect = form.elements.namedItem("employee") as HTMLSelectElement;
              const dateInput = form.elements.namedItem("date") as HTMLInputElement;
              const checkInInput = form.elements.namedItem("checkin") as HTMLInputElement;
              const checkOutInput = form.elements.namedItem("checkout") as HTMLInputElement;
              const statusSelect = form.elements.namedItem("status") as HTMLSelectElement;
              const notesInput = form.elements.namedItem("notes") as HTMLTextAreaElement;

              if (!employeeSelect.value) {
                Swal.fire({
                  title: "Required Field",
                  text: "Please select an employee.",
                  icon: "warning",
                  confirmButtonColor: "#ffc107",
                });
                return;
              }
              if (!dateInput.value) {
                Swal.fire({
                  title: "Required Field",
                  text: "Please select a date.",
                  icon: "warning",
                  confirmButtonColor: "#ffc107",
                });
                return;
              }

              const newRecord = {
                employee: employeeSelect.value,
                date: dateInput.value,
                check_in: checkInInput.value || null,
                check_out: checkOutInput.value || null,
                status: statusSelect.value,
                notes: notesInput.value,
              };
              handleCreateRecord(newRecord);
            }}>
              Mark Attendance
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {editingRecord && (
        <Modal show={!!editingRecord} onHide={() => setEditingRecord(null)}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Attendance</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form id="edit-attendance-form">
              <Form.Group className="mb-3" controlId="formCheckIn">
                <Form.Label>Check In</Form.Label>
                <Form.Control name="checkin" type="time" defaultValue={editingRecord.check_in ? new Date(editingRecord.check_in).toTimeString().slice(0, 5) : ""} />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formCheckOut">
                <Form.Label>Check Out</Form.Label>
                <Form.Control name="checkout" type="time" defaultValue={editingRecord.check_out ? new Date(editingRecord.check_out).toTimeString().slice(0, 5) : ""} />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formStatus">
                <Form.Label>Status</Form.Label>
                <Form.Select name="status" defaultValue={editingRecord.status}>
                  {attendanceStatuses.map((attendanceStatus) => (
                    <option key={attendanceStatus.value} value={attendanceStatus.value}>{attendanceStatus.label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setEditingRecord(null)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => {
              const form = document.querySelector("#edit-attendance-form") as HTMLFormElement;
              const checkInInput = form.elements.namedItem("checkin") as HTMLInputElement;
              const checkOutInput = form.elements.namedItem("checkout") as HTMLInputElement;
              const statusSelect = form.elements.namedItem("status") as HTMLSelectElement;
              const updatedRecord: AttendanceRecord = {
                ...editingRecord,
                check_in: checkInInput?.value || null,
                check_out: checkOutInput?.value || null,
                status: statusSelect?.value || "PRESENT",
              };
              handleSaveChanges(updatedRecord);
            }}>
              Save Changes
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {deletingRecord && (
        <Modal show={!!deletingRecord} onHide={() => setDeletingRecord(null)}>
          <Modal.Header closeButton>
            <Modal.Title>Delete Attendance</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>Are you sure you want to delete this attendance record?</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setDeletingRecord(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteRecord}>
              Delete
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      <Modal show={isRulesModalOpen} onHide={() => setIsRulesModalOpen(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Set Attendance Rules</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info">
            These rules will be visible to all employees on their dashboard. Use this space to define core working hours, late entry policies, and leave guidelines.
          </Alert>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Company Attendance Rules</Form.Label>
            <Form.Control
              as="textarea"
              rows={10}
              value={attendanceRules}
              onChange={(e) => setAttendanceRules(e.target.value)}
              placeholder="Define the attendance rules here..."
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setIsRulesModalOpen(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={handleSaveRules}>
            Save Rules
          </Button>
        </Modal.Footer>
      </Modal>
    </Fragment>
  );
};

export default AttendanceRecordsClient;
