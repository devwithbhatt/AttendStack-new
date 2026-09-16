"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Table, Badge, Button, Modal, Form, Spinner, Row, Col, Alert, ButtonGroup, InputGroup } from "react-bootstrap";
import { IconTrendingUp, IconCheck, IconX, IconCalendarTime, IconCurrencyRupee, IconRefresh, IconEdit } from "@tabler/icons-react";
import Swal from "sweetalert2";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1`;

const authHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : { "Content-Type": "application/json" };
};

export interface EmployeeIncrementItem {
  id: number;
  employee: string;
  employee_details: {
    id: string;
    employee_id: string;
    full_name: string;
    email: string;
    department: string;
    designation: string;
    status?: string;
    status_display?: string;
    annual_salary: string;
    profile_photo_url: string | null;
  };
  due_date: string;
  current_salary: string;
  increment_type: "PERCENTAGE" | "FLAT_AMOUNT";
  increment_type_display: string;
  increment_value: string;
  calculated_increment_amount: string;
  new_salary: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RESCHEDULED";
  status_display: string;
  rescheduled_date?: string | null;
  action_date?: string | null;
  notes?: string;
  cycle_months?: number;
  cycle_display?: string;
  is_custom?: boolean;
}

export interface IncrementSummary {
  pending_count: number;
  due_this_month: number;
  due_next_month?: number;
  this_month_name?: string;
  next_month_name?: string;
  approved_this_year: number;
}

interface UpcomingIncrementsWidgetProps {
  canEdit?: boolean;
}

const UpcomingIncrementsWidget: React.FC<UpcomingIncrementsWidgetProps> = ({ canEdit = true }) => {
  const [increments, setIncrements] = useState<EmployeeIncrementItem[]>([]);
  const [summary, setSummary] = useState<IncrementSummary>({
    pending_count: 0,
    due_this_month: 0,
    due_next_month: 0,
    this_month_name: "",
    next_month_name: "",
    approved_this_year: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Reschedule Modal State
  const [showRescheduleModal, setShowRescheduleModal] = useState<boolean>(false);
  const [selectedIncrement, setSelectedIncrement] = useState<EmployeeIncrementItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Reject Modal State
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);

  // Edit Hike Modal State
  const [showEditHikeModal, setShowEditHikeModal] = useState<boolean>(false);
  const [editHikeType, setEditHikeType] = useState<"PERCENTAGE" | "FLAT_AMOUNT">("PERCENTAGE");
  const [editFlatMode, setEditFlatMode] = useState<"MONTHLY" | "ANNUAL">("ANNUAL");
  const [editHikeValue, setEditHikeValue] = useState<string>("");
  const [editUpdatePolicy, setEditUpdatePolicy] = useState<boolean>(false);
  const [editNotes, setEditNotes] = useState<string>("");


  const fetchIncrements = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Fetch Summary
      const summaryRes = await fetch(`${BASE_URL}/payroll/increments/summary/`, { headers: authHeaders() });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      // 2. Fetch Increments List
      let listUrl = `${BASE_URL}/payroll/increments/`;
      if (filterStatus === "NEXT_MONTH") {
        listUrl = `${BASE_URL}/payroll/increments/?due=next_month`;
      } else if (filterStatus === "THIS_MONTH") {
        listUrl = `${BASE_URL}/payroll/increments/?due=this_month`;
      } else if (filterStatus) {
        listUrl = `${BASE_URL}/payroll/increments/?status=${filterStatus}`;
      }

      const res = await fetch(listUrl, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load employee increments.");
      const data = await res.json();
      setIncrements(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load increments.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchIncrements();
  }, [fetchIncrements]);

  // Handle Accept / Approve
  const handleApprove = (inc: EmployeeIncrementItem) => {
    const isAnnual = Number(inc.current_salary) > 50000;
    const monthlyCurrent = isAnnual ? Math.round(Number(inc.current_salary) / 12) : Number(inc.current_salary);
    const monthlyNew = isAnnual ? Math.round(Number(inc.new_salary) / 12) : Number(inc.new_salary);
    const monthlyRaise = isAnnual ? Math.round(Number(inc.calculated_increment_amount) / 12) : Number(inc.calculated_increment_amount);

    const formattedAmount = monthlyRaise.toLocaleString("en-IN");
    const formattedNewSal = monthlyNew.toLocaleString("en-IN");

    Swal.fire({
      title: "Approve Salary Increment?",
      html: `
        <div style="text-align: left; font-size: 14px;">
          <p><strong>Employee:</strong> ${inc.employee_details?.full_name} (${inc.employee_details?.employee_id})</p>
          <p><strong>Current Monthly Salary:</strong> ₹${monthlyCurrent.toLocaleString("en-IN")} / month</p>
          <p><strong>Raise:</strong> ${inc.increment_type === "PERCENTAGE" ? `${inc.increment_value}% (+₹${formattedAmount}/mo)` : `+₹${formattedAmount}/mo`}</p>
          <p style="color: #198754; font-weight: bold; font-size: 16px;">New Salary: ₹${formattedNewSal} / month</p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#198754",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Approve & Update Salary",
      cancelButtonText: "Cancel",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await fetch(`${BASE_URL}/payroll/increments/${inc.id}/approve/`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ notes: "Approved by Admin" }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Failed to approve increment.");
          }

          Swal.fire({
            icon: "success",
            title: "Increment Approved!",
            text: `${inc.employee_details?.full_name}'s annual salary has been updated to ₹${formattedNewSal}.`,
            timer: 3000,
            showConfirmButton: false,
          });

          fetchIncrements();
        } catch (err) {
          Swal.fire("Error", err instanceof Error ? err.message : "Failed to approve increment.", "error");
        }
      }
    });
  };

  // Open Reject Modal
  const openRejectModal = (inc: EmployeeIncrementItem) => {
    setSelectedIncrement(inc);
    setActionNotes("");
    setShowRejectModal(true);
  };

  // Submit Reject
  const handleConfirmReject = async () => {
    if (!selectedIncrement) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${BASE_URL}/payroll/increments/${selectedIncrement.id}/reject/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ notes: actionNotes }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to reject increment.");
      }

      setShowRejectModal(false);
      Swal.fire("Rejected", "The increment record has been rejected.", "info");
      fetchIncrements();
    } catch (err) {
      Swal.fire("Error", err instanceof Error ? err.message : "Failed to reject increment.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Reschedule Modal
  const openRescheduleModal = (inc: EmployeeIncrementItem) => {
    setSelectedIncrement(inc);
    setRescheduleDate(inc.due_date || "");
    setActionNotes(inc.notes || "");
    setShowRescheduleModal(true);
  };

  // Submit Reschedule
  const handleConfirmReschedule = async () => {
    if (!selectedIncrement || !rescheduleDate) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${BASE_URL}/payroll/increments/${selectedIncrement.id}/reschedule/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          rescheduled_date: rescheduleDate,
          notes: actionNotes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to reschedule increment.");
      }

      setShowRescheduleModal(false);
      Swal.fire("Rescheduled", `Increment due date moved to ${rescheduleDate}.`, "success");
      fetchIncrements();
    } catch (err) {
      Swal.fire("Error", err instanceof Error ? err.message : "Failed to reschedule increment.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Edit Hike Modal
  const openEditHikeModal = (inc: EmployeeIncrementItem) => {
    setSelectedIncrement(inc);
    const curr = Number(inc.current_salary) || 0;
    const isFlat = inc.increment_type === "FLAT_AMOUNT";
    setEditHikeType(isFlat ? "FLAT_AMOUNT" : "PERCENTAGE");
    setEditFlatMode("ANNUAL");

    if (isFlat) {
      const val = Number(inc.increment_value) || 0;
      setEditHikeValue(String(val > 0 ? val : Math.round(curr * 0.10)));
    } else {
      const val = inc.increment_value ? parseFloat(String(inc.increment_value)) : 10;
      setEditHikeValue(String(val));
    }
    setEditNotes(inc.notes || "");
    setEditUpdatePolicy(false);
    setShowEditHikeModal(true);
  };

  // Seamlessly convert value when switching Hike Type (% vs Flat)
  const handleSwitchHikeType = (targetType: "PERCENTAGE" | "FLAT_AMOUNT") => {
    if (targetType === editHikeType) return;
    const curr = Number(selectedIncrement?.current_salary) || 0;
    const val = parseFloat(editHikeValue) || 0;

    if (targetType === "PERCENTAGE") {
      // Convert Flat Amount back to Percentage (%)
      const annualFlat = editFlatMode === "MONTHLY" ? val * 12 : val;
      const pct = curr > 0 ? parseFloat(((annualFlat / curr) * 100).toFixed(2)) : 10;
      setEditHikeType("PERCENTAGE");
      setEditHikeValue(String(pct > 0 ? pct : 10));
    } else {
      // Convert Percentage (%) to Flat Amount (₹)
      const annualRaise = curr * (val / 100);
      setEditHikeType("FLAT_AMOUNT");
      if (editFlatMode === "MONTHLY") {
        setEditHikeValue(String(Math.round(annualRaise / 12)));
      } else {
        setEditHikeValue(String(Math.round(annualRaise)));
      }
    }
  };

  // Seamlessly convert value when switching Flat Basis (Monthly vs Annual)
  const handleSwitchFlatMode = (targetMode: "MONTHLY" | "ANNUAL") => {
    if (targetMode === editFlatMode) return;
    const val = parseFloat(editHikeValue) || 0;
    if (targetMode === "MONTHLY") {
      setEditFlatMode("MONTHLY");
      setEditHikeValue(String(Math.round(val / 12)));
    } else {
      setEditFlatMode("ANNUAL");
      setEditHikeValue(String(Math.round(val * 12)));
    }
  };

  // Dynamic preview calculation for Edit Hike modal
  const editPreview = useMemo(() => {
    if (!selectedIncrement) return null;
    const curr = Number(selectedIncrement.current_salary) || 0;
    const val = parseFloat(editHikeValue) || 0;
    let raiseAmt = 0;
    if (editHikeType === "PERCENTAGE") {
      raiseAmt = curr * (val / 100);
    } else {
      raiseAmt = editFlatMode === "MONTHLY" ? val * 12 : val;
    }
    const newSal = curr + raiseAmt;
    const monthlyCurrent = Math.round(curr / 12);
    const monthlyRaise = Math.round(raiseAmt / 12);
    const monthlyNew = Math.round(newSal / 12);
    const pctEffective = curr > 0 ? ((raiseAmt / curr) * 100).toFixed(1) : "0";

    return {
      currentAnnual: curr,
      newAnnual: newSal,
      raiseAnnual: raiseAmt,
      monthlyCurrent,
      monthlyRaise,
      monthlyNew,
      pctEffective,
    };
  }, [selectedIncrement, editHikeType, editFlatMode, editHikeValue]);

  // Submit Edit Hike
  const handleConfirmEditHike = async () => {
    if (!selectedIncrement || !editHikeValue || parseFloat(editHikeValue) <= 0) {
      Swal.fire("Invalid Hike Value", "Please enter a valid positive hike percentage or flat amount.", "warning");
      return;
    }
    setSubmittingAction(true);
    try {
      const val = parseFloat(editHikeValue);
      // For FLAT_AMOUNT, convert to Annual CTC amount if currently entered as Monthly
      const submitValue = editHikeType === "FLAT_AMOUNT" && editFlatMode === "MONTHLY" ? val * 12 : val;

      const res = await fetch(`${BASE_URL}/payroll/increments/${selectedIncrement.id}/edit-hike/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          increment_type: editHikeType,
          increment_value: submitValue,
          notes: editNotes,
          update_employee_policy: editUpdatePolicy,
        }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to update salary hike.";
        try {
          const errData = await res.json();
          errorMsg = errData.detail || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status}): Please check backend logs.`;
        }
        throw new Error(errorMsg);
      }

      setShowEditHikeModal(false);
      Swal.fire({
        icon: "success",
        title: "Salary Hike Updated",
        text: `Salary increment proposal for ${selectedIncrement.employee_details?.full_name} has been updated successfully.`,
        timer: 2500,
        showConfirmButton: false,
      });
      fetchIncrements();
    } catch (err) {
      Swal.fire("Error", err instanceof Error ? err.message : "Failed to update salary hike.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResetToCompanyPolicy = async () => {
    if (!selectedIncrement) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${BASE_URL}/payroll/increments/${selectedIncrement.id}/edit-hike/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          reset_to_company_policy: true,
          notes: "Reset back to company default policy",
        }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to reset increment.";
        try {
          const errData = await res.json();
          errorMsg = errData.detail || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status}): Please check backend logs.`;
        }
        throw new Error(errorMsg);
      }

      setShowEditHikeModal(false);
      Swal.fire({
        icon: "success",
        title: "Reverted to Company Policy",
        text: `Salary increment for ${selectedIncrement.employee_details?.full_name} has been reset to the company default policy.`,
        timer: 2500,
        showConfirmButton: false,
      });
      fetchIncrements();
    } catch (err) {
      Swal.fire("Error", err instanceof Error ? err.message : "Failed to reset increment.", "error");
    } finally {
      setSubmittingAction(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="badge px-2 py-1 rounded-pill fw-semibold bg-success-subtle text-success border border-success-subtle" style={{ fontSize: "11px" }}>
            Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="badge px-2 py-1 rounded-pill fw-semibold bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: "11px" }}>
            Rejected
          </span>
        );
      case "RESCHEDULED":
        return (
          <span className="badge px-2 py-1 rounded-pill fw-semibold bg-warning-subtle text-warning-emphasis border border-warning-subtle" style={{ fontSize: "11px" }}>
            Rescheduled
          </span>
        );
      default:
        return (
          <span className="badge px-2 py-1 rounded-pill fw-semibold bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: "11px" }}>
            Pending
          </span>
        );
    }
  };

  return (
    <div className="upcoming-increments-section my-4">
      {/* Metric Cards Grid - 2 per row on mobile */}
      <Row className="g-2 g-md-3 mb-4">
        <Col xs={6} sm={6} xl={3}>
          <Card
            className="border-0 shadow-sm text-white h-100"
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", cursor: "pointer" }}
            onClick={() => setFilterStatus("PENDING")}
          >
            <Card.Body className="d-flex align-items-center justify-content-between p-2.5 p-md-3">
              <div>
                <span className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: "11px" }}>Pending Review</span>
                <h3 className="mb-0 fw-bold mt-1 text-white fs-4 fs-md-3">{summary.pending_count}</h3>
              </div>
              <div className="rounded-circle bg-white bg-opacity-20 p-2 p-md-2.5 d-flex align-items-center justify-content-center">
                <IconTrendingUp size={20} className="text-white" />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} sm={6} xl={3}>
          <Card
            className="border-0 shadow-sm text-white h-100 position-relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0d9488 0%, #059669 100%)", cursor: "pointer" }}
            onClick={() => setFilterStatus("NEXT_MONTH")}
          >
            <Card.Body className="d-flex align-items-center justify-content-between p-2.5 p-md-3">
              <div>
                <span className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: "11px" }}>
                  Due Next Month
                </span>
                <h3 className="mb-0 fw-bold mt-1 text-white fs-4 fs-md-3">{summary.due_next_month ?? 0}</h3>
              </div>
              <div className="rounded-circle bg-white bg-opacity-25 p-2 p-md-2.5 d-flex align-items-center justify-content-center">
                <IconCalendarTime size={20} className="text-white" />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} sm={6} xl={3}>
          <Card
            className="border-0 shadow-sm text-dark h-100"
            style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", cursor: "pointer" }}
            onClick={() => setFilterStatus("THIS_MONTH")}
          >
            <Card.Body className="d-flex align-items-center justify-content-between p-2.5 p-md-3">
              <div>
                <span className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: "11px" }}>Due This Month</span>
                <h3 className="mb-0 fw-bold mt-1 text-white fs-4 fs-md-3">{summary.due_this_month}</h3>
              </div>
              <div className="rounded-circle bg-white bg-opacity-25 p-2 p-md-2.5 d-flex align-items-center justify-content-center">
                <IconCalendarTime size={20} className="text-white" />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} sm={6} xl={3}>
          <Card
            className="border-0 shadow-sm text-white h-100"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #047857 100%)", cursor: "pointer" }}
            onClick={() => setFilterStatus("APPROVED")}
          >
            <Card.Body className="d-flex align-items-center justify-content-between p-2.5 p-md-3">
              <div>
                <span className="text-white-50 small fw-semibold text-uppercase" style={{ fontSize: "11px" }}>Approved (Year)</span>
                <h3 className="mb-0 fw-bold mt-1 text-white fs-4 fs-md-3">{summary.approved_this_year}</h3>
              </div>
              <div className="rounded-circle bg-white bg-opacity-20 p-2 p-md-2.5 d-flex align-items-center justify-content-center">
                <IconCurrencyRupee size={20} className="text-white" />
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white py-3 border-0 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <IconTrendingUp size={22} className="text-primary" />
            <div>
              <h5 className="mb-0 fw-bold">Employee Salary Increment Management</h5>
              <small className="text-muted">
                {filterStatus === "NEXT_MONTH"
                  ? `Showing active employees with increments scheduled for next month (${summary.next_month_name || "Next Month"})`
                  : filterStatus === "THIS_MONTH"
                  ? `Showing active employees with increments scheduled for this month (${summary.this_month_name || "This Month"})`
                  : "Track, approve, reject or reschedule upcoming salary raises for active employees"}
              </small>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            {/* Filter Dropdown */}
            <Form.Select
              size="sm"
              style={{ width: "210px" }}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Active Increments</option>
              <option value="NEXT_MONTH">Due Next Month {summary.next_month_name ? `(${summary.next_month_name})` : ""}</option>
              <option value="THIS_MONTH">Due This Month</option>
              <option value="PENDING">Pending Review (All)</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Form.Select>

            <Button variant="outline-secondary" size="sm" onClick={fetchIncrements} disabled={loading}>
              <IconRefresh size={16} className={loading ? "spin" : ""} />
            </Button>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {error && <Alert variant="danger" className="m-3">{error}</Alert>}

          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="text-muted mt-2 mb-0 small">Checking active employee increment schedules...</p>
            </div>
          ) : increments.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <IconTrendingUp size={40} className="mb-2 text-secondary opacity-50" />
              <p className="mb-0 fw-semibold">No {filterStatus.toLowerCase()} increments found.</p>
              <small>Salary increments will appear automatically when due for active employees based on joining date or company policy.</small>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover size="sm" className="align-middle text-nowrap mb-0" style={{ minWidth: "760px" }}>
                <thead className="table-light text-secondary small text-uppercase" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                  <tr>
                    <th className="ps-3 py-2.5 text-nowrap">Employee</th>
                    <th className="py-2.5 text-nowrap">Current Salary</th>
                    <th className="py-2.5 text-nowrap">Proposed Raise</th>
                    <th className="py-2.5 text-nowrap">New Salary</th>
                    <th className="py-2.5 text-nowrap">Due Date</th>
                    <th className="py-2.5 text-nowrap">Status</th>
                    <th className="text-end pe-3 py-2.5 text-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {increments.map((inc) => {
                    const emp = inc.employee_details;
                    const isPending = inc.status === "PENDING" || inc.status === "RESCHEDULED";
                    const isAnnual = Number(inc.current_salary) > 50000;
                    const monthlyCurrent = isAnnual ? Math.round(Number(inc.current_salary) / 12) : Number(inc.current_salary);
                    const monthlyNew = isAnnual ? Math.round(Number(inc.new_salary) / 12) : Number(inc.new_salary);
                    const monthlyRaiseAmount = isAnnual ? Math.round(Number(inc.calculated_increment_amount) / 12) : Number(inc.calculated_increment_amount);
                    const formattedPct = inc.increment_value ? parseFloat(String(inc.increment_value)) : 10;
                    const effectivePct = Number(inc.current_salary) > 0
                      ? ((Number(inc.calculated_increment_amount) / Number(inc.current_salary)) * 100).toFixed(1)
                      : "0";

                    return (
                      <tr key={inc.id} style={{ height: "48px" }}>
                        <td className="ps-3 py-2 text-nowrap">
                          <div className="d-flex align-items-center gap-2">
                            {emp?.profile_photo_url ? (
                              <img
                                src={emp.profile_photo_url}
                                alt={emp.full_name}
                                className="rounded-circle flex-shrink-0"
                                style={{ width: "30px", height: "30px", objectFit: "cover" }}
                              />
                            ) : (
                              <div
                                className="rounded-circle bg-primary bg-opacity-10 text-primary fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{ width: "30px", height: "30px", fontSize: "12px" }}
                              >
                                {emp?.full_name?.charAt(0) || "E"}
                              </div>
                            )}
                            <div className="text-truncate" style={{ maxWidth: "220px" }}>
                              <div className="fw-bold text-dark d-flex align-items-center gap-1" style={{ fontSize: "12.5px" }}>
                                <span className="text-truncate">{emp?.full_name || "Employee"}</span>
                                <Badge
                                  bg={emp?.status === "ACTIVE" ? "success-subtle" : "secondary-subtle"}
                                  className={`border ${emp?.status === "ACTIVE" ? "text-success border-success-subtle" : "text-secondary border-secondary-subtle"} rounded-pill`}
                                  style={{ fontSize: "9.5px", padding: "1px 5px", fontWeight: 600 }}
                                >
                                  {emp?.status_display || emp?.status || "Active"}
                                </Badge>
                              </div>
                              <small className="text-muted d-block text-truncate" style={{ fontSize: "11px" }}>
                                {emp?.employee_id} &bull; {emp?.department || "N/A"}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td className="py-2 text-nowrap">
                          <div className="fw-semibold text-dark" style={{ fontSize: "12.5px" }}>
                            ₹{monthlyCurrent.toLocaleString("en-IN")}
                            <span className="text-muted fw-normal ms-0.5" style={{ fontSize: "10.5px" }}>/mo</span>
                          </div>
                        </td>

                        <td className="py-2 text-nowrap">
                          <div className="d-inline-flex align-items-center gap-1.5">
                            <span
                              className="badge px-1.5 py-0.5 rounded-pill fw-bold text-success bg-success-subtle border border-success-subtle"
                              style={{ fontSize: "11px", letterSpacing: "-0.2px" }}
                            >
                              {inc.increment_type === "PERCENTAGE"
                                ? `+${formattedPct}%`
                                : `+₹${monthlyRaiseAmount.toLocaleString("en-IN")}/mo`}
                            </span>
                            <span className="text-muted fw-medium" style={{ fontSize: "11px" }}>
                              {inc.increment_type === "PERCENTAGE"
                                ? `+₹${monthlyRaiseAmount.toLocaleString("en-IN")}/mo`
                                : `+${parseFloat(effectivePct)}% raise`}
                            </span>
                            {inc.is_custom && (
                              <Badge
                                bg="warning-subtle"
                                className="text-warning border border-warning-subtle rounded-pill fw-semibold"
                                style={{ fontSize: "9.5px", padding: "1px 5px" }}
                                title="Custom increment override active for this employee"
                              >
                                Custom
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td className="py-2 text-nowrap">
                          <div className="fw-bold text-success" style={{ fontSize: "12.5px" }}>
                            ₹{monthlyNew.toLocaleString("en-IN")}
                            <span className="text-muted fw-normal ms-0.5" style={{ fontSize: "10.5px" }}>/mo</span>
                          </div>
                        </td>

                        <td className="py-2 text-nowrap">
                          <div className="fw-medium text-dark text-nowrap" style={{ fontSize: "12px" }}>{inc.due_date}</div>
                          {inc.rescheduled_date && (
                            <small className="text-warning d-block text-nowrap" style={{ fontSize: "10px" }}>
                              Rescheduled ({inc.rescheduled_date})
                            </small>
                          )}
                        </td>

                        <td className="py-2 text-nowrap">{getStatusBadge(inc.status)}</td>

                        <td className="text-end pe-3 py-2 text-nowrap">
                          {isPending ? (
                            canEdit ? (
                              <div className="d-flex justify-content-end align-items-center gap-1">
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  className="p-0 d-inline-flex align-items-center justify-content-center rounded-2"
                                  style={{ width: "26px", height: "26px" }}
                                  onClick={() => openEditHikeModal(inc)}
                                  title="Edit Salary Hike Amount / %"
                                >
                                  <IconEdit size={14} />
                                </Button>

                                <Button
                                  variant="success"
                                  size="sm"
                                  className="p-0 d-inline-flex align-items-center justify-content-center rounded-2"
                                  style={{ width: "26px", height: "26px" }}
                                  onClick={() => handleApprove(inc)}
                                  title="Accept & Apply Increment"
                                >
                                  <IconCheck size={14} />
                                </Button>

                                <Button
                                  variant="outline-warning"
                                  size="sm"
                                  className="p-0 d-inline-flex align-items-center justify-content-center rounded-2"
                                  style={{ width: "26px", height: "26px" }}
                                  onClick={() => openRescheduleModal(inc)}
                                  title="Reschedule Due Date"
                                >
                                  <IconCalendarTime size={14} />
                                </Button>

                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  className="p-0 d-inline-flex align-items-center justify-content-center rounded-2"
                                  style={{ width: "26px", height: "26px" }}
                                  onClick={() => openRejectModal(inc)}
                                  title="Reject Increment"
                                >
                                  <IconX size={14} />
                                </Button>
                              </div>
                            ) : (
                              <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill py-1 px-2" style={{ fontSize: "10.5px" }}>
                                Read Only
                              </span>
                            )
                          ) : (
                            <small className="text-muted text-nowrap" style={{ fontSize: "11px" }}>
                              {inc.notes ? `Note: ${inc.notes}` : "Completed"}
                            </small>
                          )}
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

      {/* Edit Salary Hike Modal */}
      <Modal show={showEditHikeModal} onHide={() => setShowEditHikeModal(false)} centered size="lg">
        <Modal.Header closeButton className="border-bottom-0 pb-0">
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconEdit size={22} className="text-primary" />
            <span>Edit Salary Hike Proposal</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <div className="bg-light rounded p-3 mb-3 border">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div>
                <h6 className="fw-bold text-dark mb-0">{selectedIncrement?.employee_details?.full_name}</h6>
                <small className="text-muted">
                  ID: {selectedIncrement?.employee_details?.employee_id} &bull; Dept: {selectedIncrement?.employee_details?.department || "N/A"}
                </small>
              </div>
              <div className="text-end">
                <span className="text-muted small d-block">Current Salary</span>
                <span className="fw-bold text-dark">
                  ₹{Number(editPreview?.monthlyCurrent || 0).toLocaleString("en-IN")}/mo
                  <small className="text-muted fw-normal ms-1">
                    (₹{Number(editPreview?.currentAnnual || 0).toLocaleString("en-IN")}/yr)
                  </small>
                </span>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2 mt-2 pt-2 border-top flex-wrap">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill py-1 px-2 fw-semibold" style={{ fontSize: "11px" }}>
                <IconCalendarTime size={13} className="me-1" />
                Increment Cycle: {selectedIncrement?.cycle_display || "Annually (Every 12 Months)"}
              </span>
              <span className="badge bg-white text-secondary border rounded-pill py-1 px-2" style={{ fontSize: "11px" }}>
                Due Date: {selectedIncrement?.due_date}
              </span>
            </div>
          </div>

          <Row className="g-3 mb-3">
            <Col sm={6}>
              <Form.Group>
                <Form.Label className="fw-semibold small text-uppercase text-secondary" style={{ fontSize: "11.5px" }}>
                  Hike Calculation Mode
                </Form.Label>
                <div>
                  <ButtonGroup className="w-100">
                    <Button
                      variant={editHikeType === "PERCENTAGE" ? "primary" : "outline-secondary"}
                      onClick={() => handleSwitchHikeType("PERCENTAGE")}
                      size="sm"
                      className="fw-semibold"
                    >
                      Percentage (%)
                    </Button>
                    <Button
                      variant={editHikeType === "FLAT_AMOUNT" ? "primary" : "outline-secondary"}
                      onClick={() => handleSwitchHikeType("FLAT_AMOUNT")}
                      size="sm"
                      className="fw-semibold"
                    >
                      Flat Amount (₹)
                    </Button>
                  </ButtonGroup>
                </div>
              </Form.Group>
            </Col>

            <Col sm={6}>
              <Form.Group>
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <Form.Label className="fw-semibold small text-uppercase text-secondary mb-0" style={{ fontSize: "11.5px" }}>
                    {editHikeType === "PERCENTAGE"
                      ? "Hike Percentage (%)"
                      : editFlatMode === "MONTHLY"
                      ? "Flat Raise (₹ / Month)"
                      : "Flat Raise (₹ / Year)"}
                  </Form.Label>

                  {editHikeType === "FLAT_AMOUNT" && (
                    <div className="d-flex align-items-center gap-1">
                      <Button
                        variant={editFlatMode === "MONTHLY" ? "success" : "outline-secondary"}
                        size="sm"
                        style={{ fontSize: "10px", padding: "1px 6px" }}
                        onClick={() => handleSwitchFlatMode("MONTHLY")}
                      >
                        ₹ / Month
                      </Button>
                      <Button
                        variant={editFlatMode === "ANNUAL" ? "success" : "outline-secondary"}
                        size="sm"
                        style={{ fontSize: "10px", padding: "1px 6px" }}
                        onClick={() => handleSwitchFlatMode("ANNUAL")}
                      >
                        ₹ / Year
                      </Button>
                    </div>
                  )}
                </div>

                <InputGroup size="sm">
                  <InputGroup.Text>
                    {editHikeType === "PERCENTAGE" ? "%" : "₹"}
                  </InputGroup.Text>
                  <Form.Control
                    type="number"
                    step={editHikeType === "PERCENTAGE" ? "0.5" : editFlatMode === "MONTHLY" ? "100" : "1000"}
                    min="0"
                    placeholder={
                      editHikeType === "PERCENTAGE"
                        ? "e.g. 15"
                        : editFlatMode === "MONTHLY"
                        ? "e.g. 2500"
                        : "e.g. 30000"
                    }
                    value={editHikeValue}
                    onChange={(e) => setEditHikeValue(e.target.value)}
                  />
                </InputGroup>
              </Form.Group>
            </Col>
          </Row>

          {/* Real-time Calculation Summary Card */}
          {editPreview && (
            <Card className="border border-success border-opacity-25 bg-success bg-opacity-10 mb-3 shadow-none">
              <Card.Body className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-semibold text-success small text-uppercase">Projected Salary After Hike</span>
                  <Badge bg="success">+{editPreview.pctEffective}% Raise</Badge>
                </div>
                <Row className="g-2 text-dark">
                  <Col xs={6} md={4}>
                    <small className="text-muted d-block">Monthly Raise</small>
                    <strong className="text-success">+₹{Number(editPreview.monthlyRaise || 0).toLocaleString("en-IN")} / mo</strong>
                  </Col>
                  <Col xs={6} md={4}>
                    <small className="text-muted d-block">New Monthly Salary</small>
                    <strong className="text-dark fs-6">₹{Number(editPreview.monthlyNew || 0).toLocaleString("en-IN")} / mo</strong>
                  </Col>
                  <Col xs={12} md={4}>
                    <small className="text-muted d-block">New Annual CTC</small>
                    <strong className="text-dark">₹{Number(editPreview.newAnnual || 0).toLocaleString("en-IN")} / yr</strong>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              id="update-employee-policy-checkbox"
              label="Save this custom hike as the employee's default policy for future cycles"
              checked={editUpdatePolicy}
              onChange={(e) => setEditUpdatePolicy(e.target.checked)}
              className="small fw-semibold text-secondary"
            />
          </Form.Group>

          <Form.Group className="mb-2">
            <Form.Label className="fw-semibold small">Notes / Reason for Revision</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="E.g., Exceptional performance in Q4; approved higher hike percentage."
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between align-items-center">
          <div>
            {selectedIncrement?.is_custom && (
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={handleResetToCompanyPolicy}
                disabled={submittingAction}
              >
                Reset to Company Policy
              </Button>
            )}
          </div>
          <div className="d-flex gap-2">
            <Button variant="secondary" onClick={() => setShowEditHikeModal(false)} disabled={submittingAction}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmEditHike}
              disabled={submittingAction || !editHikeValue || parseFloat(editHikeValue) <= 0}
            >
              {submittingAction ? <Spinner size="sm" /> : "Save & Update Hike"}
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      {/* Reschedule Modal */}
      <Modal show={showRescheduleModal} onHide={() => setShowRescheduleModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">Reschedule Salary Increment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Select a new target date for <strong>{selectedIncrement?.employee_details?.full_name}</strong>'s salary increment.
          </p>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">New Due Date</Form.Label>
            <Form.Control
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Notes / Reason for Rescheduling</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="E.g., Performance review postponed to next month."
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRescheduleModal(false)} disabled={submittingAction}>
            Cancel
          </Button>
          <Button variant="warning" onClick={handleConfirmReschedule} disabled={submittingAction || !rescheduleDate}>
            {submittingAction ? <Spinner size="sm" /> : "Save Rescheduled Date"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reject Modal */}
      <Modal show={showRejectModal} onHide={() => setShowRejectModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold text-danger">Reject Salary Increment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Are you sure you want to reject the upcoming increment for <strong>{selectedIncrement?.employee_details?.full_name}</strong>?
          </p>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Rejection Reason / Remarks</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Enter reason for rejecting this cycle's increment..."
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRejectModal(false)} disabled={submittingAction}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmReject} disabled={submittingAction}>
            {submittingAction ? <Spinner size="sm" /> : "Confirm Rejection"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );

};

export default UpcomingIncrementsWidget;
