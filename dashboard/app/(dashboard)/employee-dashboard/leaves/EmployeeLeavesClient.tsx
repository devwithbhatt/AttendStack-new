"use client";

import React, { useEffect, useState } from "react";
import { Card, Button, Table, Badge, Modal, Form, Row, Col, Alert, Spinner } from "react-bootstrap";
import { IconCalendarPlus, IconCalendarEvent, IconMessage, IconInfoCircle, IconClock, IconCircleCheck, IconCircleX, IconEdit, IconTrash, IconHeart, IconUser, IconEye, IconPaperclip } from "@tabler/icons-react";
import Swal from "sweetalert2";
import { useCurrentEmployee } from "../useCurrentEmployee";
import { resolveMediaUrl } from "../../../../helper/mediaUrl";

interface LeaveRequest {
  id: number;
  start_date: string;
  end_date: string;
  leave_type: string;
  is_half_day: boolean;
  leave_type_label: string;
  attachment: string | null;
  reason: string;
  status: string;
  status_label: string;
  admin_notes: string | null;
  created_at: string;
}

interface LeaveSettings {
  sick_leave_days: number;
  casual_leave_days: number;
  sick_leave_monthly_limit: number;
  casual_leave_monthly_limit: number;
  maternity_leave_days: number;
  paternity_leave_days: number;
  bereavement_leave_days: number;
  marriage_leave_days: number;
}

interface LeavePreview {
  total_days: number;
  paid_leave_available: number;
  paid_leave_used: number;
  unpaid_leave_days: number;
  estimated_salary_deduction: string;
  currency: string;
  monthly_limit: number | null;
  monthly_periods: Array<{
    year: number;
    month: number;
    month_name: string;
    limit: number;
    used: number;
    requested: number;
    remaining: number;
    remaining_after_request: number;
    projected: number;
    exceeded: boolean;
  }>;
  monthly_limit_exceeded: boolean;
  monthly_limit_message: string | null;
  note: string;
}

interface LeaveBalanceSummary {
  year: number;
  is_prorated: boolean;
  eligible_months: number;
  balances: Array<{ leave_type: string; label: string; entitlement: number; used: number; remaining: number }>;
}

const DEFAULT_LEAVE_TYPES = [
  { value: "CASUAL", label: "Casual Leave" },
  { value: "SICK", label: "Sick Leave" },
  { value: "MATERNITY", label: "Maternity Leave" },
  { value: "PATERNITY", label: "Paternity Leave" },
  { value: "BEREAVEMENT", label: "Bereavement Leave" },
  { value: "MARRIAGE", label: "Marriage Leave" },
];

const apiError = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.detail === "string") return data.detail;
  const first = Object.values(data)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value) => typeof value === "string");
  return typeof first === "string" ? first : fallback;
};

const EmployeeLeavesClient = () => {
  const { employee } = useCurrentEmployee();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<{ value: string; label: string }[]>(DEFAULT_LEAVE_TYPES);
  const [leavePreview, setLeavePreview] = useState<LeavePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [viewingLeave, setViewingLeave] = useState<LeaveRequest | null>(null);
  const [balanceSummary, setBalanceSummary] = useState<LeaveBalanceSummary | null>(null);

  const fetchLeaves = async () => {
    setIsLoading(true);
    setError("");
    const token = localStorage.getItem("authToken");
    if (!token) {
      setError("Authorization credentials not found. Please sign in again.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/?page_size=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to load leave requests.");
      const data = await res.json();
      const results = Array.isArray(data) ? data : data.results || [];
      setLeaves(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeaveTypes = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/types/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveTypes(Array.isArray(data) && data.length > 0 ? data : DEFAULT_LEAVE_TYPES);
      }
    } catch {
      setLeaveTypes(DEFAULT_LEAVE_TYPES);
    }
  };

  useEffect(() => {
    fetchLeaves();
    fetchLeaveTypes();
    fetchLeaveBalance();
  }, []);

  useEffect(() => {
    if (!showModal || !startDate || !endDate || startDate > endDate) {
      setLeavePreview(null);
      return;
    }
    const token = localStorage.getItem("authToken");
    if (!token) return;
    const controller = new AbortController();
    const loadPreview = async () => {
      setIsPreviewLoading(true);
      try {
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate, leave_type: leaveType, is_half_day: String(isHalfDay) });
        if (editingLeave) params.set("exclude_id", String(editingLeave.id));
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/preview/?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!res.ok) throw new Error("Unable to calculate leave impact.");
        setLeavePreview(await res.json());
      } catch (err) {
        if ((err as Error).name !== "AbortError") setLeavePreview(null);
      } finally {
        if (!controller.signal.aborted) setIsPreviewLoading(false);
      }
    };
    void loadPreview();
    return () => controller.abort();
  }, [showModal, startDate, endDate, leaveType, isHalfDay, editingLeave]);

  const resetFormAndCloseModal = () => {
    setShowModal(false);
    setEditingLeave(null);
    setStartDate("");
    setEndDate("");
    setLeaveType("CASUAL");
    setIsHalfDay(false);
    setReason("");
    setAttachment(null);
    setLeavePreview(null);
  };

  const handleEdit = (leave: LeaveRequest) => {
    setEditingLeave(leave);
    setStartDate(leave.start_date);
    setEndDate(leave.end_date);
    setLeaveType(leave.leave_type);
    setIsHalfDay(leave.is_half_day);
    setReason(leave.reason);
    setAttachment(null);
    setShowModal(true);
  };

  const handleDelete = async (leaveId: number) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!"
    });

    if (result.isConfirmed) {
      const token = localStorage.getItem("authToken");
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${leaveId}/`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to delete leave request.");

        Swal.fire("Deleted!", "Your leave request has been deleted.", "success");
        fetchLeaves();
        fetchLeaveBalance();
      } catch (err) {
        Swal.fire("Error!", err instanceof Error ? err.message : "An unknown error occurred.", "error");
      }
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!startDate || !endDate || !reason) {
      setError("Please fill out all required fields.");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date cannot be after end date.");
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      setError("Authentication token expired. Please sign in.");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingLeave
        ? `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${editingLeave.id}/`
        : `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/`;
      
      const method = editingLeave ? "PUT" : "POST";

      const formData = new FormData();
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);
      formData.append("leave_type", leaveType);
      formData.append("is_half_day", String(isHalfDay));
      formData.append("reason", reason);
      if (attachment) formData.append("attachment", attachment);

      const res = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(apiError(errData, "Unable to submit leave request."));
      }

      const isEdit = Boolean(editingLeave);
      setSuccessMsg(isEdit ? "Your leave request has been updated successfully!" : "Your leave request has been submitted successfully for HR review!");
      resetFormAndCloseModal();
      
      Swal.fire({
        title: isEdit ? "Application Updated!" : "Application Submitted!",
        text: isEdit ? "Your leave application changes have been saved." : "Your leave application has been submitted and sent for manager review.",
        icon: "success",
        timer: 2500,
        showConfirmButton: false,
      });

      await fetchLeaves();
      await fetchLeaveBalance();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error submitting request.";
      setError(msg);
      Swal.fire({
        title: "Submission Failed",
        text: msg,
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge bg="success-subtle" className="text-success border border-success-subtle px-2.5 py-1 rounded-pill fw-semibold">Approved</Badge>;
      case "REJECTED":
        return <Badge bg="danger-subtle" className="text-danger border border-danger-subtle px-2.5 py-1 rounded-pill fw-semibold">Rejected</Badge>;
      default:
        return <Badge bg="warning-subtle" className="text-warning border border-warning-subtle px-2.5 py-1 rounded-pill fw-semibold">Pending Review</Badge>;
    }
  };

  const getLeaveTypeBadge = (type: string) => {
    switch (type) {
      case "SICK":
        return <Badge bg="danger-subtle" className="text-danger-emphasis px-2 py-1 rounded">Sick Leave</Badge>;
      case "CASUAL":
        return <Badge bg="info-subtle" className="text-info-emphasis px-2 py-1 rounded">Casual Leave</Badge>;
      case "MATERNITY":
        return <Badge bg="pink-subtle" className="text-pink-emphasis px-2 py-1 rounded">Maternity Leave</Badge>;
      case "PATERNITY":
        return <Badge bg="blue-subtle" className="text-blue-emphasis px-2 py-1 rounded">Paternity Leave</Badge>;
      case "BEREAVEMENT":
        return <Badge bg="secondary-subtle" className="text-secondary-emphasis px-2 py-1 rounded">Bereavement Leave</Badge>;
      case "MARRIAGE":
        return <Badge bg="success-subtle" className="text-success-emphasis px-2 py-1 rounded">Marriage Leave</Badge>;
      default:
        return <Badge bg="secondary-subtle" className="text-secondary-emphasis px-2 py-1 rounded">{type}</Badge>;
    }
  };

  const calculateDays = (start: string, end: string) => {
    const sDate = new Date(start);
    const eDate = new Date(end);
    const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Load company leave settings
  const [leaveSettings, setLeaveSettings] = useState<LeaveSettings | null>(null);
  
  useEffect(() => {
    const fetchSettings = async () => {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/settings/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLeaveSettings(data);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    fetchSettings();
  }, []);

  // Calculate used leave days
  const leaveBalance = (leaveType: string, allowance: number) => {
    const currentYear = new Date().getFullYear();
    const used = leaves
      .filter((leave) => leave.leave_type === leaveType && leave.status === "APPROVED")
      .reduce((total, leave) => {
        if (leave.is_half_day) {
          return total + (new Date(`${leave.start_date}T00:00:00`).getFullYear() === currentYear ? 0.5 : 0);
        }
        let leaveDate = new Date(`${leave.start_date}T00:00:00`);
        const finalDate = new Date(`${leave.end_date}T00:00:00`);
        let usedThisYear = 0;
        while (leaveDate <= finalDate) {
          if (leaveDate.getFullYear() === currentYear) usedThisYear += 1;
          leaveDate = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate() + 1);
        }
        return total + usedThisYear;
      }, 0);
    return Math.max(allowance - used, 0);
  };

  const fetchLeaveBalance = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/balance/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBalanceSummary(await res.json());
    } catch {
      setBalanceSummary(null);
    }
  };

  const currentMonthUsage = (type: string) => {
    const today = new Date();
    return leaves
      .filter((leave) => leave.leave_type === type && ["PENDING", "APPROVED"].includes(leave.status))
      .reduce((total, leave) => {
        if (leave.is_half_day) {
          const leaveDate = new Date(`${leave.start_date}T00:00:00`);
          return total + (leaveDate.getFullYear() === today.getFullYear() && leaveDate.getMonth() === today.getMonth() ? 0.5 : 0);
        }
        let leaveDate = new Date(`${leave.start_date}T00:00:00`);
        const finalDate = new Date(`${leave.end_date}T00:00:00`);
        let usedThisMonth = 0;
        while (leaveDate <= finalDate) {
          if (leaveDate.getFullYear() === today.getFullYear() && leaveDate.getMonth() === today.getMonth()) usedThisMonth += 1;
          leaveDate = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate() + 1);
        }
        return total + usedThisMonth;
      }, 0);
  };

  // Metrics
  const totalRequested = leaves.length;
  const approvedLeaves = leaves.filter(l => l.status === "APPROVED").length;
  const pendingLeaves = leaves.filter(l => l.status === "PENDING").length;
  const rejectedLeaves = leaves.filter(l => l.status === "REJECTED").length;
  const leaveRequestsDisabled = employee?.status === "INACTIVE" || employee?.status === "TERMINATED";
  const authoritativeBalance = (type: string) => balanceSummary?.balances.find((item) => item.leave_type === type);

  return (
    <div className="container-fluid px-0 py-4" style={{ minHeight: "85vh" }}>
      {/* Upper header action area */}
      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: "16px", background: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)" }}>
        <Card.Body className="p-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div>
            <h3 className="fw-bold text-dark mb-1">Leave Requests</h3>
            <p className="text-secondary small mb-0">
              Apply for your configured leave categories and track approval status directly.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowModal(true)}
            disabled={leaveRequestsDisabled}
            title={leaveRequestsDisabled ? "Leave requests are disabled for inactive or terminated employees." : undefined}
            className="d-flex align-items-center gap-2 px-4 py-2.5 rounded-3 fw-semibold shadow-sm"
          >
            <IconCalendarPlus size={20} strokeWidth={2} />
            Apply For Leave
          </Button>
        </Card.Body>
      </Card>

      {leaveRequestsDisabled && (
        <Alert variant="secondary" className="border-0 shadow-sm mb-4">
          <strong>Leave requests disabled:</strong> Your employment status is {employee?.status_label || employee?.status}.
          You can review previous requests, but you cannot submit, edit, or delete requests. Contact HR if this status needs correction.
        </Alert>
      )}

      {/* Leave Balance Overview */}
      {leaveSettings && (
        <Card className="border-0 shadow-sm mb-4 rounded-4">
          <Card.Header className="bg-white border-0 pt-4 px-4 pb-0">
            <h5 className="fw-bold text-dark mb-1">Your Leave Balance</h5>
            <p className="text-muted small mb-0">Track your accrued leave balance, monthly limits, and active company leave entitlements.</p>
          </Card.Header>
          <Card.Body className="px-4 py-4">
            <Row className="g-3">
              <Col xs={12}>
                <h6 className="text-uppercase text-secondary small fw-bold mb-0">Regular Leave</h6>
              </Col>

              {/* Sick Leave */}
              <Col xs={12} md={4}>
                {(() => {
                  const auth = authoritativeBalance("SICK");
                  const remaining = auth?.remaining ?? leaveBalance("SICK", leaveSettings.sick_leave_days);
                  const entitlement = auth?.entitlement ?? leaveSettings.sick_leave_days;
                  const used = auth?.used ?? Math.max(0, Number((entitlement - remaining).toFixed(1)));
                  const monthlyLimit = leaveSettings.sick_leave_monthly_limit ?? 7;

                  return (
                    <div className="p-3 bg-danger-subtle rounded-3 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <p className="text-danger small fw-bold mb-0">Sick Leave</p>
                          <IconHeart size={20} className="text-danger" />
                        </div>
                        <div className="mb-2">
                          <span className="fs-3 fw-bold text-danger me-1">{remaining}</span>
                          <span className="fw-bold text-danger" style={{ fontSize: "14px" }}>Days Available</span>
                        </div>
                        <div className="small text-secondary" style={{ fontSize: "12px" }}>
                          <div>• Earned so far: <strong>{entitlement} days</strong> <span className="text-muted">(of {leaveSettings.sick_leave_days} annual)</span></div>
                          <div>• Already taken/used: <strong>{used} days</strong></div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top border-danger-subtle d-flex align-items-center justify-content-between">
                        <span className="badge bg-white text-danger border border-danger-subtle fw-medium" style={{ fontSize: "11px" }}>
                          Max {monthlyLimit} days/month
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Col>

              {/* Casual Leave */}
              <Col xs={12} md={4}>
                {(() => {
                  const auth = authoritativeBalance("CASUAL");
                  const remaining = auth?.remaining ?? leaveBalance("CASUAL", leaveSettings.casual_leave_days);
                  const entitlement = auth?.entitlement ?? leaveSettings.casual_leave_days;
                  const used = auth?.used ?? Math.max(0, Number((entitlement - remaining).toFixed(1)));
                  const monthlyLimit = leaveSettings.casual_leave_monthly_limit ?? 3;

                  return (
                    <div className="p-3 bg-info-subtle rounded-3 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <p className="text-info-emphasis small fw-bold mb-0">Casual Leave</p>
                          <IconUser size={20} className="text-info" />
                        </div>
                        <div className="mb-2">
                          <span className="fs-3 fw-bold text-info-emphasis me-1">{remaining}</span>
                          <span className="fw-bold text-info-emphasis" style={{ fontSize: "14px" }}>Days Available</span>
                        </div>
                        <div className="small text-secondary" style={{ fontSize: "12px" }}>
                          <div>• Earned so far: <strong>{entitlement} days</strong> <span className="text-muted">(of {leaveSettings.casual_leave_days} annual)</span></div>
                          <div>• Already taken/used: <strong>{used} days</strong></div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top border-info-subtle d-flex align-items-center justify-content-between">
                        <span className="badge bg-white text-info-emphasis border border-info-subtle fw-medium" style={{ fontSize: "11px" }}>
                          Max {monthlyLimit} days/month
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Col>

              {/* Bereavement Leave */}
              <Col xs={12} md={4}>
                {(() => {
                  const auth = authoritativeBalance("BEREAVEMENT");
                  const allowance = auth?.entitlement ?? Number(leaveSettings.bereavement_leave_days);
                  const remaining = auth?.remaining ?? leaveBalance("BEREAVEMENT", allowance);
                  const used = auth?.used ?? Math.max(0, Number((allowance - remaining).toFixed(1)));

                  return (
                    <div className="p-3 bg-secondary-subtle rounded-3 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <p className="text-secondary-emphasis small fw-bold mb-0">Bereavement Leave</p>
                          <IconCalendarEvent size={20} className="text-secondary" />
                        </div>
                        <div className="mb-2">
                          <span className="fs-3 fw-bold text-secondary-emphasis me-1">{remaining}</span>
                          <span className="fw-bold text-secondary-emphasis" style={{ fontSize: "14px" }}>Days Available</span>
                        </div>
                        <div className="small text-secondary" style={{ fontSize: "12px" }}>
                          <div>• Total policy: <strong>{allowance} days</strong></div>
                          <div>• Already taken/used: <strong>{used} days</strong></div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top border-secondary-subtle">
                        <span className="badge bg-white text-secondary border border-secondary-subtle fw-medium" style={{ fontSize: "11px" }}>
                          Immediate family
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Col>

              {/* Marriage Leave */}
              <Col xs={12} md={4}>
                {(() => {
                  const auth = authoritativeBalance("MARRIAGE");
                  const allowance = auth?.entitlement ?? Number(leaveSettings.marriage_leave_days);
                  const remaining = auth?.remaining ?? leaveBalance("MARRIAGE", allowance);
                  const used = auth?.used ?? Math.max(0, Number((allowance - remaining).toFixed(1)));

                  return (
                    <div className="p-3 bg-warning-subtle rounded-3 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <p className="text-warning-emphasis small fw-bold mb-0">Marriage Leave</p>
                          <IconCalendarEvent size={20} className="text-warning-emphasis" />
                        </div>
                        <div className="mb-2">
                          <span className="fs-3 fw-bold text-warning-emphasis me-1">{remaining}</span>
                          <span className="fw-bold text-warning-emphasis" style={{ fontSize: "14px" }}>Days Available</span>
                        </div>
                        <div className="small text-secondary" style={{ fontSize: "12px" }}>
                          <div>• Total policy: <strong>{allowance} days</strong></div>
                          <div>• Already taken/used: <strong>{used} days</strong></div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top border-warning-subtle">
                        <span className="badge bg-white text-warning-emphasis border border-warning-subtle fw-medium" style={{ fontSize: "11px" }}>
                          Own / Sibling marriage
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Col>

              {/* Maternity Leave */}
              <Col xs={12} md={4}>
                {(() => {
                  const auth = authoritativeBalance("MATERNITY");
                  const allowance = auth?.entitlement ?? Number(leaveSettings.maternity_leave_days);
                  const remaining = auth?.remaining ?? leaveBalance("MATERNITY", allowance);
                  const used = auth?.used ?? Math.max(0, Number((allowance - remaining).toFixed(1)));

                  return (
                    <div className="p-3 bg-success-subtle rounded-3 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <p className="text-success-emphasis small fw-bold mb-0">Maternity Leave</p>
                          <IconCalendarEvent size={20} className="text-success" />
                        </div>
                        <div className="mb-2">
                          <span className="fs-3 fw-bold text-success-emphasis me-1">{remaining}</span>
                          <span className="fw-bold text-success-emphasis" style={{ fontSize: "14px" }}>Days Available</span>
                        </div>
                        <div className="small text-secondary" style={{ fontSize: "12px" }}>
                          <div>• Total policy: <strong>{allowance} days</strong></div>
                          <div>• Already taken/used: <strong>{used} days</strong></div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top border-success-subtle">
                        <span className="badge bg-white text-success-emphasis border border-success-subtle fw-medium" style={{ fontSize: "11px" }}>
                          Eligible new mothers
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Col>

              {/* Paternity Leave */}
              <Col xs={12} md={4}>
                {(() => {
                  const auth = authoritativeBalance("PATERNITY");
                  const allowance = auth?.entitlement ?? Number(leaveSettings.paternity_leave_days);
                  const remaining = auth?.remaining ?? leaveBalance("PATERNITY", allowance);
                  const used = auth?.used ?? Math.max(0, Number((allowance - remaining).toFixed(1)));

                  return (
                    <div className="p-3 bg-primary-subtle rounded-3 h-100 d-flex flex-column justify-content-between">
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <p className="text-primary-emphasis small fw-bold mb-0">Paternity Leave</p>
                          <IconCalendarEvent size={20} className="text-primary" />
                        </div>
                        <div className="mb-2">
                          <span className="fs-3 fw-bold text-primary-emphasis me-1">{remaining}</span>
                          <span className="fw-bold text-primary-emphasis" style={{ fontSize: "14px" }}>Days Available</span>
                        </div>
                        <div className="small text-secondary" style={{ fontSize: "12px" }}>
                          <div>• Total policy: <strong>{allowance} days</strong></div>
                          <div>• Already taken/used: <strong>{used} days</strong></div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top border-primary-subtle">
                        <span className="badge bg-white text-primary-emphasis border border-primary-subtle fw-medium" style={{ fontSize: "11px" }}>
                          Eligible new fathers
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Col>
            </Row>

            <Alert variant="light" className="border mt-4 mb-0 small">
              <strong>Accrual & Monthly Request Policy:</strong> Casual and Sick Leave accrue monthly from your joining date. An employee can apply up to the monthly limit ({leaveSettings.casual_leave_monthly_limit ?? 3} Casual / {leaveSettings.sick_leave_monthly_limit ?? 7} Sick days per month) <em>only if</em> sufficient collected/accrued balance is available in their account. Unearned future credits cannot be drawn in advance.
            </Alert>
          </Card.Body>
        </Card>
      )}

      {/* Metrics Row */}
      <Row className="mb-4 g-3">
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white h-100">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-primary-subtle text-primary rounded-3 flex-shrink-0">
                <IconCalendarEvent size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Total Requested</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{totalRequested}</h3>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white h-100">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-success-subtle text-success rounded-3 flex-shrink-0">
                <IconCircleCheck size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Approved Leaves</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{approvedLeaves}</h3>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white h-100">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-warning-subtle text-warning-emphasis rounded-3 flex-shrink-0">
                <IconClock size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Pending Reviews</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{pendingLeaves}</h3>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white h-100">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-danger-subtle text-danger rounded-3 flex-shrink-0">
                <IconCircleX size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Rejected / Disapproved</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{rejectedLeaves}</h3>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Alert Feedbacks */}
      {successMsg && <Alert variant="success" className="border-0 shadow-sm rounded-3 mb-4" onClose={() => setSuccessMsg("")} dismissible>{successMsg}</Alert>}
      {error && <Alert variant="danger" className="border-0 shadow-sm rounded-3 mb-4" onClose={() => setError("")} dismissible>{error}</Alert>}

      {/* Requests table card */}
      <Card className="border-0 shadow-sm" style={{ borderRadius: "16px", overflow: "hidden" }}>
        <Card.Header className="bg-white border-0 py-3 px-4 d-flex align-items-center justify-content-between">
          <h5 className="fw-bold text-dark mb-0">My Leave Applications</h5>
        </Card.Header>
        <Card.Body className="p-0">
          {isLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" className="mb-2" />
              <p className="text-secondary small mb-0">Loading leave requests...</p>
            </div>
          ) : leaves.length === 0 ? (
            <div className="text-center py-5 px-3">
              <IconInfoCircle size={40} className="text-muted mb-2" />
              <h5 className="fw-semibold text-dark-emphasis">No Leaves Found</h5>
              <p className="text-secondary small mb-0">You haven't requested any leaves yet. Click "Apply For Leave" to submit your first request.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle text-nowrap mb-0 custom-leaves-table" style={{ minWidth: "850px" }}>
                <thead className="table-light">
                  <tr className="small text-secondary-emphasis" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>
                    <th className="px-4 py-3">Leave Type</th>
                    <th className="py-3">Leave Period</th>
                    <th className="py-3 text-center">Total Days</th>
                    <th className="py-3">Reason</th>
                    <th className="py-3">Status</th>
                    <th className="px-4 py-3">HR Remarks</th>
                    <th className="px-4 py-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => {
                    const durationDays = leave.is_half_day ? 0.5 : calculateDays(leave.start_date, leave.end_date);
                    const startStr = new Date(leave.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                    const endStr = new Date(leave.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                    
                    return (
                      <tr key={leave.id} style={{ transition: "background-color 0.15s ease" }}>
                        <td className="px-4 py-3.5">
                          {getLeaveTypeBadge(leave.leave_type)}
                        </td>
                        <td className="py-3.5 fw-medium text-dark small">
                          {startStr} — {endStr}
                        </td>
                        <td className="py-3.5 text-center fw-bold text-dark-emphasis small">
                          {durationDays} {durationDays === 1 ? "day" : "days"}
                        </td>
                        <td className="py-3.5 text-secondary small text-truncate" style={{ maxWidth: "220px" }} title={leave.reason}>
                          <div>{leave.reason}</div>
                          {leave.attachment && <a href={resolveMediaUrl(leave.attachment)} target="_blank" rel="noreferrer" className="small">View attachment</a>}
                        </td>
                        <td className="py-3.5">
                          {getStatusBadge(leave.status)}
                        </td>
                        <td className="px-4 py-3.5">
                          {leave.admin_notes ? (
                            <span className="text-dark-emphasis small d-flex align-items-center gap-1.5">
                              <IconMessage size={14} className="text-secondary" />
                              {leave.admin_notes}
                            </span>
                          ) : (
                            <span className="text-muted small italic" style={{ fontSize: "0.78rem" }}>No remarks yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-end">
                          <div className="d-flex justify-content-end gap-2">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => setViewingLeave(leave)}
                              title="View leave application"
                              aria-label="View leave application"
                            >
                              <IconEye size={16} />
                            </Button>
                            {leave.status === 'PENDING' && !leaveRequestsDisabled && (
                              <>
                                <Button variant="outline-secondary" size="sm" onClick={() => handleEdit(leave)}>
                                  <IconEdit size={16} />
                                </Button>
                                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(leave.id)}>
                                  <IconTrash size={16} />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal show={Boolean(viewingLeave)} onHide={() => setViewingLeave(null)} centered size="lg">
        <Modal.Header closeButton className="px-4 py-3">
          <Modal.Title className="fw-bold text-dark">Leave Application Details</Modal.Title>
        </Modal.Header>
        {viewingLeave && (
          <Modal.Body className="px-4 py-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
              <div className="d-flex align-items-center gap-2">
                {getLeaveTypeBadge(viewingLeave.leave_type)}
                {viewingLeave.is_half_day && <Badge bg="secondary-subtle" className="text-secondary-emphasis">Half Day</Badge>}
              </div>
              {getStatusBadge(viewingLeave.status)}
            </div>

            <Row className="g-4">
              <Col xs={12} md={6}>
                <p className="small text-secondary fw-semibold mb-1">Start Date</p>
                <p className="text-dark mb-0">{new Date(`${viewingLeave.start_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
              </Col>
              <Col xs={12} md={6}>
                <p className="small text-secondary fw-semibold mb-1">End Date</p>
                <p className="text-dark mb-0">{new Date(`${viewingLeave.end_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
              </Col>
              <Col xs={12} md={6}>
                <p className="small text-secondary fw-semibold mb-1">Duration</p>
                <p className="text-dark mb-0">{viewingLeave.is_half_day ? 0.5 : calculateDays(viewingLeave.start_date, viewingLeave.end_date)} day{(viewingLeave.is_half_day ? 0.5 : calculateDays(viewingLeave.start_date, viewingLeave.end_date)) === 1 ? "" : "s"}</p>
              </Col>
              <Col xs={12} md={6}>
                <p className="small text-secondary fw-semibold mb-1">Applied On</p>
                <p className="text-dark mb-0">{new Date(viewingLeave.created_at).toLocaleString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </Col>
              <Col xs={12}>
                <p className="small text-secondary fw-semibold mb-1">Reason</p>
                <p className="text-dark mb-0 text-break" style={{ whiteSpace: "pre-wrap" }}>{viewingLeave.reason}</p>
              </Col>
              <Col xs={12}>
                <p className="small text-secondary fw-semibold mb-1">HR Remarks</p>
                <p className={viewingLeave.admin_notes ? "text-dark mb-0 text-break" : "text-muted mb-0"} style={{ whiteSpace: "pre-wrap" }}>
                  {viewingLeave.admin_notes || "No remarks yet"}
                </p>
              </Col>
              <Col xs={12}>
                <p className="small text-secondary fw-semibold mb-2">Attachment</p>
                {viewingLeave.attachment ? (
                  <Button as="a" href={resolveMediaUrl(viewingLeave.attachment)} target="_blank" rel="noreferrer" variant="outline-primary" size="sm" className="d-inline-flex align-items-center gap-2">
                    <IconPaperclip size={16} />
                    View Attachment
                  </Button>
                ) : (
                  <p className="text-muted mb-0">No attachment submitted</p>
                )}
              </Col>
            </Row>
          </Modal.Body>
        )}
        <Modal.Footer className="px-4 py-3">
          <Button variant="secondary" onClick={() => setViewingLeave(null)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Floating Apply Modal */}
      <Modal show={showModal} onHide={resetFormAndCloseModal} centered className="border-0 shadow-lg" size="lg">
        <Modal.Header closeButton className="border-0 px-4 pt-4 pb-2">
          <Modal.Title className="fw-bold text-dark">{editingLeave ? "Edit Leave Application" : "Submit Leave Application"}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body className="px-4 py-3">
            <Alert variant="info" className="border-0 shadow-sm d-flex align-items-center gap-2 rounded-3 small">
              <IconInfoCircle size={18} className="flex-shrink-0" />
              Approved leave automatically updates your attendance and payroll. Monthly limits include both pending and approved requests.
            </Alert>

            <Row className="g-3 mb-3">
              <Col xs={12} md={6}>
                <Form.Group controlId="leaveType">
                  <Form.Label className="small fw-semibold text-secondary mb-1">Leave Type *</Form.Label>
                  <Form.Select
                    value={leaveType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setLeaveType(nextType);
                      if (isHalfDay && !["CASUAL", "SICK"].includes(nextType)) setIsHalfDay(false);
                    }}
                    className="form-control rounded-3 p-2.5"
                  >
                    {leaveTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                    </Form.Select>
                  {["CASUAL", "SICK"].includes(leaveType) && (
                    <Form.Check
                      className="mt-3"
                      type="switch"
                      id="half-day-leave"
                      label="Apply as half-day leave (0.5 day)"
                      checked={isHalfDay}
                      onChange={(e) => {
                        setIsHalfDay(e.target.checked);
                        if (e.target.checked && startDate) setEndDate(startDate);
                      }}
                    />
                  )}
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                {startDate && endDate && (
                  <div className="p-3 bg-light rounded-3 text-center border h-100 d-flex flex-column justify-content-center">
                    <span className="small text-secondary fw-semibold">Calculated Leave Duration:</span>
                    <h4 className="fw-bold text-primary mb-0 mt-1">
                      {isHalfDay ? "0.5 Day" : `${calculateDays(startDate, endDate)} ${calculateDays(startDate, endDate) === 1 ? "Day" : "Days"}`}
                    </h4>
                    {isPreviewLoading ? (
                      <small className="text-secondary mt-2">Calculating paid leave & salary impact…</small>
                    ) : leavePreview && (
                      <div className="leave-impact-preview mt-3 pt-2 border-top text-start">
                        {leavePreview.monthly_limit_message && (
                          <div className="alert alert-warning border-0 p-3 rounded-3 mb-3 small d-flex align-items-start gap-2">
                            <IconInfoCircle size={18} className="text-warning flex-shrink-0 mt-0.5" />
                            <div>
                              <strong className="d-block text-dark">Monthly Paid Limit Exceeded</strong>
                              <span className="text-secondary">{leavePreview.monthly_limit_message}</span>
                            </div>
                          </div>
                        )}

                        <div className="bg-white border rounded-3 p-3 mb-3 shadow-sm">
                          <div className="d-flex justify-content-between align-items-center small mb-2">
                            <span className="text-secondary">Earned Paid Balance:</span>
                            <strong className="text-success">{leavePreview.paid_leave_available} Days</strong>
                          </div>
                          <div className="d-flex justify-content-between align-items-center small mb-2">
                            <span className="text-secondary">Paid Leave Approved:</span>
                            <strong className="text-primary">{leavePreview.paid_leave_used} Days</strong>
                          </div>
                          <div className="d-flex justify-content-between align-items-center small">
                            <span className="text-secondary">Unpaid Leave (Loss of Pay):</span>
                            <strong className={leavePreview.unpaid_leave_days > 0 ? "text-danger fw-bold" : "text-success"}>
                              {leavePreview.unpaid_leave_days} Days
                            </strong>
                          </div>
                        </div>

                        {leavePreview.unpaid_leave_days > 0 && (
                          <div className="alert alert-danger border-0 p-3 rounded-3 mb-3 small">
                            <strong>Note:</strong> {leavePreview.unpaid_leave_days} day(s) exceed your available paid balance or monthly limit and will be processed as <strong>Unpaid Leave (Loss of Pay)</strong>.
                          </div>
                        )}

                        <small className="d-block text-muted" style={{ fontSize: "11px" }}>
                          {leavePreview.note}
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </Col>
            </Row>

            <Row className="g-3 mb-3">
              <Col xs={12} md={6}>
                <Form.Group controlId="startDate">
                  <Form.Label className="small fw-semibold text-secondary mb-1">Start Date *</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (isHalfDay) setEndDate(e.target.value);
                    }}
                    className="form-control rounded-3 p-2.5"
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="endDate">
                  <Form.Label className="small fw-semibold text-secondary mb-1">End Date *</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    value={isHalfDay && startDate ? startDate : endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={isHalfDay}
                    className="form-control rounded-3 p-2.5"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group controlId="reason" className="mb-2">
              <Form.Label className="small fw-semibold text-secondary mb-1">Reason for Leave *</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                required
                placeholder="Explain the reason for your leave request in detail..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="form-control rounded-3 p-3"
              />
            </Form.Group>
            <Form.Group controlId="attachment" className="mt-3">
              <Form.Label className="small fw-semibold text-secondary mb-1">Supporting Attachment</Form.Label>
              <Form.Control
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={(e) => setAttachment((e.target as HTMLInputElement).files?.[0] || null)}
                className="form-control rounded-3 p-2.5"
              />
              <Form.Text>Optional: PDF, image, or Word document up to 5 MB.</Form.Text>
              {editingLeave?.attachment && !attachment && <div className="small mt-2"><a href={resolveMediaUrl(editingLeave.attachment)} target="_blank" rel="noreferrer">View current attachment</a></div>}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="border-0 px-4 pb-4 pt-2">
            <Button variant="outline-secondary" onClick={resetFormAndCloseModal} className="px-4 py-2.5 rounded-3 fw-semibold">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting || Boolean(leavePreview?.monthly_limit_exceeded)} className="px-4 py-2.5 rounded-3 fw-semibold">
              {isSubmitting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-2" />
                  {editingLeave ? "Updating..." : "Submitting..."}
                </>
              ) : (
                editingLeave ? "Update Application" : "Submit Application"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <style>{`
        .custom-leaves-table tbody tr:hover {
          background-color: #f9fafb !important;
        }
      `}</style>
    </div>
  );
};

export default EmployeeLeavesClient;
