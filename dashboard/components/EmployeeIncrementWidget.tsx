"use client";

import React, { useEffect, useState } from "react";
import { Card, Row, Col, Badge, Table, Spinner, ProgressBar } from "react-bootstrap";
import {
  IconTrendingUp,
  IconCalendarTime,
  IconCurrencyRupee,
  IconAward,
  IconCircleCheck,
  IconClock,
  IconArrowUpRight,
  IconHistory,
  IconShieldCheck,
} from "@tabler/icons-react";

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

export interface MyIncrementResponse {
  employee_id: string;
  full_name: string;
  joining_date: string;
  annual_salary: string | number;
  last_increment_date: string | null;
  next_increment_date: string | null;
  increment_enabled: boolean;
  increment_cycle_months: number;
  increment_type: "PERCENTAGE" | "FLAT_AMOUNT";
  increment_value: string | number;
  pending_increment: {
    id: number;
    due_date: string;
    current_salary: string;
    increment_type: string;
    increment_value: string;
    calculated_increment_amount: string;
    new_salary: string;
    status: string;
    status_display: string;
    rescheduled_date?: string | null;
    notes?: string;
  } | null;
  history: Array<{
    id: number;
    due_date: string;
    current_salary: string;
    increment_type: string;
    increment_value: string;
    calculated_increment_amount: string;
    new_salary: string;
    status: string;
    status_display: string;
    action_date?: string;
    notes?: string;
  }>;
}

const EmployeeIncrementWidget: React.FC = () => {
  const [data, setData] = useState<MyIncrementResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchMyIncrementData = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${BASE_URL}/payroll/increments/my-increment/`, { headers: authHeaders() });
        if (!res.ok) throw new Error("Failed to fetch your salary increment schedule.");
        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load increment status.");
      } finally {
        setLoading(false);
      }
    };

    fetchMyIncrementData();
  }, []);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm my-4 rounded-4 overflow-hidden">
        <Card.Body className="text-center py-5">
          <Spinner animation="border" variant="primary" size="sm" />
          <span className="ms-2 text-muted small fw-medium">Loading career growth & increment details...</span>
        </Card.Body>
      </Card>
    );
  }

  if (error || !data) {
    return null; // Silently skip if employee profile has no access
  }

  const currentSalNum = Number(data.annual_salary || 0);
  const monthlySalary = currentSalNum > 0 ? Math.round(currentSalNum / 12) : 0;
  const pendingInc = data.pending_increment;

  // New salary & net hike calculation
  const newSalaryNum = pendingInc ? Number(pendingInc.new_salary || 0) : 0;
  const netHikeAmount = pendingInc
    ? Number(pendingInc.calculated_increment_amount || (newSalaryNum - currentSalNum))
    : 0;

  // Calculate timeline metrics
  const targetDateStr = pendingInc?.due_date || data.next_increment_date;
  const startDateStr = data.last_increment_date || data.joining_date || null;

  let daysRemaining: number | null = null;
  let progressPercent = 0;

  if (targetDateStr) {
    const target = new Date(targetDateStr);
    const today = new Date();
    const diffTime = target.getTime() - today.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (startDateStr) {
      const start = new Date(startDateStr);
      const totalDuration = target.getTime() - start.getTime();
      const elapsed = today.getTime() - start.getTime();
      if (totalDuration > 0) {
        progressPercent = Math.max(0, Math.min(100, Math.round((elapsed / totalDuration) * 100)));
      }
    } else {
      const totalDays = (data.increment_cycle_months || 12) * 30;
      progressPercent = Math.max(0, Math.min(100, Math.round(100 - (daysRemaining / totalDays) * 100)));
    }
  }

  const formatDate = (dStr?: string | null) => {
    if (!dStr) return "N/A";
    try {
      return new Date(dStr).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dStr;
    }
  };

  return (
    <div className="employee-increment-section my-4">
      <Card className="border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        {/* === Header Bar === */}
        <div className="p-4 bg-white border-bottom d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center rounded-3 text-white shadow-xs flex-shrink-0"
              style={{
                width: "44px",
                height: "44px",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              }}
            >
              <IconTrendingUp size={24} />
            </div>
            <div>
              <h5 className="mb-1 fw-bold text-dark" style={{ fontSize: "17px" }}>
                Salary Increment & Growth Timeline
              </h5>
              <p className="mb-0 text-muted small" style={{ fontSize: "12.5px" }}>
                Career appraisal trajectory and automated performance cycle
              </p>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span
              className="badge px-3 py-2 rounded-pill fw-semibold border d-flex align-items-center gap-1.5"
              style={{
                backgroundColor: "#f0fdf4",
                color: "#059669",
                borderColor: "#bbf7d0",
                fontSize: "12px",
              }}
            >
              <IconAward size={14} />
              {data.increment_cycle_months}-Month Appraisal Cycle
            </span>
          </div>
        </div>

        {/* === Body Content === */}
        <div className="p-4">
          {/* 1. Metric Stat Cards Grid */}
          <Row className="g-3 mb-4">
            {/* Current Salary Card */}
            <Col xs={12} sm={6} lg={4}>
              <div
                className="p-4 rounded-3 border h-100 d-flex flex-column justify-content-between shadow-xs"
                style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
              >
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <span className="text-uppercase text-secondary fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                    Current Annual CTC
                  </span>
                  <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2.5 py-1" style={{ fontSize: "10.5px" }}>
                    Base
                  </span>
                </div>
                <div>
                  <h3 className="mb-1 fw-bold text-dark d-flex align-items-baseline">
                    <span style={{ fontSize: "20px", marginRight: "2px" }}>₹</span>
                    <span style={{ fontSize: "24px" }}>{currentSalNum.toLocaleString("en-IN")}</span>
                  </h3>
                  <span className="text-muted small" style={{ fontSize: "12px" }}>
                    ≈ ₹{monthlySalary.toLocaleString("en-IN")}/month
                  </span>
                </div>
              </div>
            </Col>

            {/* Next Projected Salary Card */}
            {pendingInc ? (
              <Col xs={12} sm={6} lg={4}>
                <div
                  className="p-4 rounded-3 border h-100 d-flex flex-column justify-content-between shadow-xs"
                  style={{
                    backgroundColor: "#f0fdf4",
                    borderColor: "#bbf7d0",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <span className="text-uppercase fw-bold text-success" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                      Projected New CTC
                    </span>
                    <span
                      className="badge text-white rounded-pill px-2.5 py-1 fw-bold d-inline-flex align-items-center gap-1"
                      style={{ backgroundColor: "#10b981", fontSize: "11px" }}
                    >
                      <IconArrowUpRight size={13} />
                      {pendingInc.increment_type === "PERCENTAGE"
                        ? `+${pendingInc.increment_value}%`
                        : `+₹${Number(pendingInc.increment_value).toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <div>
                    <h3 className="mb-1 fw-bold text-success d-flex align-items-baseline">
                      <span style={{ fontSize: "20px", marginRight: "2px" }}>₹</span>
                      <span style={{ fontSize: "24px" }}>{newSalaryNum.toLocaleString("en-IN")}</span>
                    </h3>
                    <span className="text-success-emphasis small fw-medium" style={{ fontSize: "12px" }}>
                      ≈ ₹{Math.round(newSalaryNum / 12).toLocaleString("en-IN")}/month
                    </span>
                  </div>
                </div>
              </Col>
            ) : (
              <Col xs={12} sm={6} lg={4}>
                <div
                  className="p-4 rounded-3 border h-100 d-flex flex-column justify-content-between shadow-xs"
                  style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <span className="text-uppercase text-secondary fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                      Estimated Raise Rate
                    </span>
                    <span className="badge bg-light text-muted border rounded-pill px-2.5 py-1" style={{ fontSize: "10.5px" }}>
                      Standard
                    </span>
                  </div>
                  <div>
                    <h3 className="mb-1 fw-bold text-dark" style={{ fontSize: "24px" }}>
                      {data.increment_type === "PERCENTAGE" ? `${data.increment_value}%` : `₹${Number(data.increment_value).toLocaleString("en-IN")}`}
                    </h3>
                    <span className="text-muted small" style={{ fontSize: "12px" }}>
                      Next review evaluation hike
                    </span>
                  </div>
                </div>
              </Col>
            )}

            {/* Net Hike Value Card */}
            <Col xs={12} sm={12} lg={4}>
              <div
                className="p-4 rounded-3 border h-100 d-flex flex-column justify-content-between shadow-xs"
                style={{ backgroundColor: "#fbfcfe", borderColor: "#e2e8f0" }}
              >
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <span className="text-uppercase text-secondary fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                    Net Growth Amount
                  </span>
                  <span className="badge bg-primary-subtle text-primary rounded-pill px-2.5 py-1" style={{ fontSize: "10.5px" }}>
                    Annual Hike
                  </span>
                </div>
                <div>
                  <h3 className="mb-1 fw-bold text-primary d-flex align-items-baseline">
                    <span style={{ fontSize: "20px", marginRight: "2px" }}>+₹</span>
                    <span style={{ fontSize: "24px" }}>{netHikeAmount.toLocaleString("en-IN")}</span>
                  </h3>
                  <span className="text-muted small" style={{ fontSize: "12px" }}>
                    +₹{Math.round(netHikeAmount / 12).toLocaleString("en-IN")}/month additional
                  </span>
                </div>
              </div>
            </Col>
          </Row>

          {/* 2. Timeline Progress Tracker & Evaluation Status */}
          <Row className="g-3">
            {/* Timeline Progress Bar */}
            <Col lg={7}>
              <div
                className="p-4 rounded-3 border bg-white h-100 d-flex flex-column justify-content-between shadow-xs"
                style={{ borderColor: "#e2e8f0" }}
              >
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <IconCalendarTime size={20} className="text-primary" />
                      <span className="fw-bold text-dark" style={{ fontSize: "13.5px" }}>
                        Evaluation Timeline & Countdown
                      </span>
                    </div>
                    <span className="badge bg-primary text-white fw-semibold rounded-pill px-3 py-1" style={{ fontSize: "11.5px" }}>
                      Target: {formatDate(targetDateStr)}
                    </span>
                  </div>

                  {/* Progress bar with modern gradient */}
                  <div className="my-3">
                    <div
                      className="progress"
                      style={{
                        height: "10px",
                        backgroundColor: "#f1f5f9",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        className="progress-bar progress-bar-striped progress-bar-animated"
                        role="progressbar"
                        style={{
                          width: `${progressPercent}%`,
                          background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                          borderRadius: "8px",
                        }}
                        aria-valuenow={progressPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                </div>

                <div className="d-flex align-items-center justify-content-between pt-3 border-top mt-2 text-muted small" style={{ fontSize: "12px" }}>
                  <span className="d-flex align-items-center gap-1.5">
                    <IconClock size={15} className="text-secondary" />
                    Last Increment: <strong>{formatDate(startDateStr)}</strong>
                  </span>
                  <span className="fw-bold" style={{ color: daysRemaining !== null && daysRemaining <= 30 ? "#ea580c" : "#059669" }}>
                    {daysRemaining !== null ? (
                      daysRemaining <= 0 ? (
                        "Eligible for Review Now"
                      ) : (
                        `${daysRemaining} days remaining`
                      )
                    ) : (
                      "Review in progress"
                    )}
                  </span>
                </div>
              </div>
            </Col>

            {/* Evaluation Status Card */}
            <Col lg={5}>
              {pendingInc ? (
                <div
                  className="p-4 rounded-3 border h-100 d-flex flex-column justify-content-between shadow-xs"
                  style={{
                    backgroundColor: "#f8fafc",
                    borderColor: "#e2e8f0",
                  }}
                >
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <div className="d-flex align-items-center gap-2">
                        <IconAward size={22} className="text-success" />
                        <span className="fw-bold text-dark" style={{ fontSize: "13.5px" }}>
                          Appraisal Status
                        </span>
                      </div>
                      <span
                        className={`badge rounded-pill px-3 py-1 fw-bold ${
                          pendingInc.status === "APPROVED"
                            ? "bg-success text-white"
                            : pendingInc.status === "REJECTED"
                            ? "bg-danger text-white"
                            : "bg-warning text-dark"
                        }`}
                        style={{ fontSize: "11.5px" }}
                      >
                        {pendingInc.status_display || pendingInc.status}
                      </span>
                    </div>

                    <p className="text-secondary small mb-3" style={{ fontSize: "12.5px", lineHeight: "1.6" }}>
                      You are queued for a{" "}
                      <strong className="text-dark">
                        {pendingInc.increment_type === "PERCENTAGE" ? `${pendingInc.increment_value}%` : `₹${pendingInc.increment_value}`}
                      </strong>{" "}
                      raise on <strong className="text-dark">{formatDate(pendingInc.due_date)}</strong>.
                    </p>
                  </div>

                  <div className="pt-3 border-top d-flex align-items-center justify-content-between text-muted small" style={{ fontSize: "11.5px" }}>
                    <span className="d-flex align-items-center gap-1.5">
                      <IconShieldCheck size={16} className="text-success" /> Company Policy Assured
                    </span>
                    {pendingInc.rescheduled_date && (
                      <span className="text-warning fw-semibold">
                        Rescheduled: {formatDate(pendingInc.rescheduled_date)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="p-4 rounded-3 border h-100 d-flex flex-column justify-content-between shadow-xs"
                  style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                >
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <div className="d-flex align-items-center gap-2">
                        <IconCircleCheck size={22} className="text-success" />
                        <span className="fw-bold text-dark" style={{ fontSize: "13.5px" }}>
                          HR Policy Active
                        </span>
                      </div>
                      <span className="badge bg-success-subtle text-success rounded-pill px-3 py-1 fw-semibold" style={{ fontSize: "11.5px" }}>
                        Active Policy
                      </span>
                    </div>

                    <p className="text-secondary small mb-0" style={{ fontSize: "12.5px", lineHeight: "1.6" }}>
                      Your salary review is scheduled automatically every{" "}
                      <strong>{data.increment_cycle_months} months</strong> based on organizational appraisal guidelines.
                    </p>
                  </div>

                  <div className="pt-3 border-top text-muted small d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                    <IconShieldCheck size={16} className="text-success" />
                    Automated timeline tracking enabled
                  </div>
                </div>
              )}
            </Col>
          </Row>

          {/* 3. Past Increment History Table */}
          {data.history && data.history.length > 0 && (
            <div className="mt-4 pt-3 border-top">
              <div className="d-flex align-items-center gap-2 mb-3">
                <IconHistory size={18} className="text-secondary" />
                <h6 className="fw-bold mb-0 text-dark" style={{ fontSize: "14px" }}>
                  Increment & Revision History
                </h6>
              </div>

              <div className="table-responsive rounded-3 border overflow-hidden">
                <Table hover size="sm" className="mb-0 align-middle text-nowrap" style={{ minWidth: "620px" }}>
                  <thead style={{ backgroundColor: "#f8fafc" }}>
                    <tr style={{ fontSize: "11.5px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      <th className="py-3 px-3.5 text-nowrap">Effective Date</th>
                      <th className="py-3 px-3.5 text-nowrap">Previous Salary</th>
                      <th className="py-3 px-3.5 text-nowrap">Raise</th>
                      <th className="py-3 px-3.5 text-nowrap">Revised Salary</th>
                      <th className="py-3 px-3.5 text-end text-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: "12.5px" }}>
                    {data.history.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-3.5 fw-semibold text-dark text-nowrap">{formatDate(item.due_date)}</td>
                        <td className="py-3 px-3.5 text-secondary text-nowrap">₹{Number(item.current_salary).toLocaleString("en-IN")}</td>
                        <td className="py-3 px-3.5 text-nowrap">
                          <span
                            className="badge rounded-pill px-2.5 py-1 fw-bold"
                            style={{
                              backgroundColor: "#f0fdf4",
                              color: "#059669",
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            {item.increment_type === "PERCENTAGE"
                              ? `+${item.increment_value}%`
                              : `+₹${Number(item.increment_value).toLocaleString("en-IN")}`}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 fw-bold text-success text-nowrap">
                          ₹{Number(item.new_salary).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3 px-3.5 text-end text-nowrap">
                          <span
                            className={`badge rounded-pill px-3 py-1 fw-semibold ${
                              item.status === "APPROVED"
                                ? "bg-success text-white"
                                : item.status === "REJECTED"
                                ? "bg-danger text-white"
                                : "bg-secondary text-white"
                            }`}
                            style={{ fontSize: "11px" }}
                          >
                            {item.status_display || item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default EmployeeIncrementWidget;
