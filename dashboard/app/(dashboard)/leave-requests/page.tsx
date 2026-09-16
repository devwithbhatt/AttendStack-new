"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Spinner, Button, Row, Col, Form, Alert, InputGroup } from "react-bootstrap";
import { IconCheck, IconX, IconSearch, IconUserCheck, IconClock, IconCircleX, IconCircleCheck } from "@tabler/icons-react";
import Swal from 'sweetalert2';
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

interface LeaveApplication {
  id: number;
  employee_name: string;
  leave_type: string;
  is_half_day: boolean;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  admin_notes?: string;
}

interface LeaveApplication {
  id: number;
  employee_name: string;
  leave_type: string;
  is_half_day: boolean;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  admin_notes?: string;
}

// API utility to get auth headers
const authHeaders = () => {
  const token = localStorage.getItem("authToken");
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

const LeaveRequestsPage = () => {
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchLeaveApplications = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const results = Array.isArray(data) ? data : data.results || [];
        setLeaveApplications(results);
      }
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      setError("Failed to load leave applications.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveApplications();
  }, []);

  const handleApprove = async (leaveId: number) => {
    const result = await Swal.fire({
      title: "Approve Leave Request?",
      text: "Are you sure you want to approve this leave request?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Approve",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#198754",
      cancelButtonColor: "#6c757d",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${leaveId}/`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: "APPROVED" })
      });

      if (!response.ok) throw new Error("Failed to approve");
      
      Swal.fire({
        title: "Leave Approved!",
        text: "The leave request has been approved successfully.",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
      fetchLeaveApplications();
    } catch (err) {
      Swal.fire("Error", "Could not approve the leave request.", "error");
    }
  };

  const handleReject = async (leaveId: number) => {
    const { value: reason } = await Swal.fire({
      title: "Reject Leave",
      input: "textarea",
      inputLabel: "Reason for rejection",
      inputPlaceholder: "Enter reason for rejection (optional)...",
      showCancelButton: true,
      confirmButtonText: "Yes, Reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
    });

    if (reason !== undefined) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${leaveId}/`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: "REJECTED", admin_notes: reason || "Rejected by administrator" })
        });

        if (!response.ok) throw new Error("Failed to reject");
        
        Swal.fire({
          title: "Leave Rejected",
          text: "The leave request has been rejected.",
          icon: "info",
          timer: 2000,
          showConfirmButton: false,
        });
        fetchLeaveApplications();
      } catch (err) {
        Swal.fire("Error", "Could not reject the leave request.", "error");
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVED":
        return <Badge bg="success-subtle" className="text-success border border-success-subtle px-2.5 py-1 rounded-pill fw-semibold">Approved</Badge>;
      case "REJECTED":
        return <Badge bg="danger-subtle" className="text-danger border border-danger-subtle px-2.5 py-1 rounded-pill fw-semibold">Rejected</Badge>;
      default:
        return <Badge bg="warning-subtle" className="text-warning border border-warning-subtle px-2.5 py-1 rounded-pill fw-semibold">Pending</Badge>;
    }
  };

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 1;
    const sDate = new Date(start);
    const eDate = new Date(end);
    const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Filter applications
  const filteredApps = leaveApplications.filter(app => {
    const matchesSearch = app.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) || app.reason?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status?.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalPending = leaveApplications.filter(a => !a.status || a.status.toUpperCase() === "PENDING").length;
  const totalApproved = leaveApplications.filter(a => a.status?.toUpperCase() === "APPROVED").length;
  const totalRejected = leaveApplications.filter(a => a.status?.toUpperCase() === "REJECTED").length;

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <div className="leave-requests-page">
      <DasherBreadcrumb />
      <div className="mb-6">
        <h2 className="mb-0 fw-bold">Leave Requests</h2>
        <p className="text-secondary mb-0">View and manage all employee leave applications</p>
      </div>

      {/* Stats Cards */}
      <Row className="mb-4 g-4">
        <Col md={3}>
          <Card className="border-0 shadow-sm p-4 rounded-4">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-warning-subtle text-warning rounded-3">
                <IconClock size={24} />
              </div>
              <div>
                <h3 className="fw-bold mb-0">{totalPending}</h3>
                <p className="text-muted small mb-0">Pending</p>
              </div>
            </div>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-0 shadow-sm p-4 rounded-4">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-success-subtle text-success rounded-3">
                <IconCircleCheck size={24} />
              </div>
              <div>
                <h3 className="fw-bold mb-0">{totalApproved}</h3>
                <p className="text-muted small mb-0">Approved</p>
              </div>
            </div>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-0 shadow-sm p-4 rounded-4">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-danger-subtle text-danger rounded-3">
                <IconCircleX size={24} />
              </div>
              <div>
                <h3 className="fw-bold mb-0">{totalRejected}</h3>
                <p className="text-muted small mb-0">Rejected</p>
              </div>
            </div>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-0 shadow-sm p-4 rounded-4">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-primary-subtle text-primary rounded-3">
                <IconUserCheck size={24} />
              </div>
              <div>
                <h3 className="fw-bold mb-0">{leaveApplications.length}</h3>
                <p className="text-muted small mb-0">Total Requests</p>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {successMsg && <Alert variant="success" className="border-0 shadow-sm rounded-3 mb-4" onClose={() => setSuccessMsg("")} dismissible>{successMsg}</Alert>}
      {error && <Alert variant="danger" className="border-0 shadow-sm rounded-3 mb-4" onClose={() => setError("")} dismissible>{error}</Alert>}

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white border-0 py-3 px-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <h5 className="fw-bold text-dark mb-0">All Leave Applications</h5>
          <div className="d-flex gap-2">
            <InputGroup style={{ maxWidth: "200px" }}>
              <InputGroup.Text className="rounded-start-3 border-0 bg-light">
                <IconSearch size={16} />
              </InputGroup.Text>
              <Form.Control
                type="text"
                placeholder="Search..."
                className="rounded-end-3 ps-0 border-0"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </InputGroup>
            <Form.Select
              className="rounded-3"
              style={{ maxWidth: "150px" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Form.Select>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          {filteredApps.length === 0 ? (
            <div className="text-center py-5">
              <p className="text-muted">No leave applications found.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "850px" }}>
                <thead className="table-light">
                  <tr>
                    <th className="fw-semibold px-4">Employee</th>
                    <th className="fw-semibold">Leave Type</th>
                    <th className="fw-semibold">Dates</th>
                    <th className="fw-semibold">Days</th>
                    <th className="fw-semibold">Reason</th>
                    <th className="fw-semibold">Status</th>
                    <th className="fw-semibold px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.map((app) => (
                    <tr key={app.id}>
                      <td className="px-4 fw-medium">{app.employee_name}</td>
                      <td><Badge bg="secondary-subtle" className="text-secondary-emphasis">{app.leave_type}</Badge></td>
                      <td>{`${app.start_date} to ${app.end_date}`}</td>
                      <td>{app.is_half_day ? 0.5 : calculateDays(app.start_date, app.end_date)} days</td>
                      <td className="text-muted small" style={{maxWidth: '200px'}}>{app.reason?.substring(0, 50)}...</td>
                      <td>{getStatusBadge(app.status)}</td>
                      <td className="px-4 text-end">
                        {(!app.status || app.status.toUpperCase() === "PENDING") && (
                          <div className="d-flex justify-content-end gap-2">
                            <Button variant="outline-success" size="sm" onClick={() => handleApprove(app.id)}>
                              <IconCheck size={16} />
                            </Button>
                            <Button variant="outline-danger" size="sm" onClick={() => handleReject(app.id)}>
                              <IconX size={16} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default LeaveRequestsPage;
