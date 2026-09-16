"use client";

import React, { useEffect, useState } from "react";
import { Card, Button, Table, Badge, Modal, Form, Row, Col, Alert, Spinner, InputGroup, Dropdown } from "react-bootstrap";
import { IconSearch, IconCalendarEvent, IconMessage, IconInfoCircle, IconClock, IconCircleCheck, IconCircleX, IconDotsVertical, IconEye, IconSettings, IconTrash, IconPaperclip, IconDownload, IconCheck, IconX } from "@tabler/icons-react";
import Swal from "sweetalert2";
import { Avatar } from "components/common/Avatar";
import { getAssetPath } from "helper/assetPath";
import { resolveMediaUrl, triggerFileDownload, getDownloadProxyUrl } from "../../../helper/mediaUrl";

interface LeaveRequest {
  id: number;
  employee_uuid: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  employee_department: string;
  employee_designation: string;
  employee_avatar_url: string;
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

const AdminLeavesClient = () => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          setCurrentUser(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isHR = currentUser?.role === "HR";
  const isSubAdmin = currentUser?.role === "SUB_ADMIN";
  const leavesPermission = currentUser?.permissions?.leaves;

  const canEdit = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof leavesPermission === "object" && leavesPermission !== null
      ? Boolean(leavesPermission.edit)
      : Boolean(leavesPermission)
  ) : false);

  const canDelete = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof leavesPermission === "object" && leavesPermission !== null
      ? Boolean(leavesPermission.delete)
      : false
  ) : false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Review Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("APPROVED");
  const [adminNotes, setAdminNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async (id: number, employeeName?: string) => {
    if (!canDelete) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to delete leave requests.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }

    const result = await Swal.fire({
      title: "Delete Leave Request?",
      text: `Are you sure you want to permanently delete the leave request for ${employeeName || "this employee"}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      Swal.fire({
        title: "Authentication Required",
        text: "Session expired. Please sign in again.",
        icon: "error",
      });
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to delete leave request');
      }
      Swal.fire({
        title: "Deleted!",
        text: "The leave application record has been removed.",
        icon: "success",
        timer: 1800,
        showConfirmButton: false,
      });
      await fetchLeaves();
    } catch (err) {
      Swal.fire({
        title: "Delete Failed",
        text: err instanceof Error ? err.message : 'Error deleting leave request',
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  const handleQuickStatusUpdate = async (leave: LeaveRequest, newStatus: "APPROVED" | "REJECTED") => {
    if (!canEdit) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to modify leave requests.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }

    const isApprove = newStatus === "APPROVED";
    const result = await Swal.fire({
      title: isApprove ? "Approve Leave Request?" : "Reject Leave Request?",
      text: `${isApprove ? "Confirm approval of" : "Reject"} leave application for ${leave.employee_name}?`,
      icon: isApprove ? "question" : "warning",
      input: isApprove ? undefined : "textarea",
      inputPlaceholder: isApprove ? undefined : "Reason for rejection (optional)...",
      showCancelButton: true,
      confirmButtonColor: isApprove ? "#198754" : "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: isApprove ? "Yes, Approve" : "Yes, Reject",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    const token = localStorage.getItem("authToken");
    if (!token) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${leave.id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          admin_notes: isApprove ? (leave.admin_notes || "") : (result.value || "Rejected by administrator"),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Unable to ${newStatus.toLowerCase()} leave.`);
      }

      Swal.fire({
        title: isApprove ? "Leave Approved!" : "Leave Rejected",
        text: `Leave request for ${leave.employee_name} marked as ${newStatus}.`,
        icon: isApprove ? "success" : "info",
        timer: 2000,
        showConfirmButton: false,
      });

      await fetchLeaves();
    } catch (err) {
      Swal.fire({
        title: "Action Failed",
        text: err instanceof Error ? err.message : "Error processing review.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  const fetchLeaves = async () => {
    setIsLoading(true);
    setError("");
    const token = localStorage.getItem("authToken");
    if (!token) {
      setError("Session expired. Please sign in again.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to load leave requests from the server.");
      const data = await res.json();
      const results = Array.isArray(data) ? data : data.results || [];
      setLeaves(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching leaves.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleOpenLeaveModal = (leave: LeaveRequest, editing: boolean) => {
    setSelectedLeave(leave);
    setReviewStatus(leave.status);
    setAdminNotes(leave.admin_notes || "");
    setIsEditing(editing && canEdit);
    setShowModal(true);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) return;

    if (!canEdit) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to modify leave requests.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }

    setError("");
    setSuccessMsg("");
    const token = localStorage.getItem("authToken");
    if (!token) {
      Swal.fire({
        title: "Session Expired",
        text: "Authorization credentials missing. Please log in again.",
        icon: "warning",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/leaves/${selectedLeave.id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: reviewStatus,
          admin_notes: adminNotes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Unable to update leave request status.");
      }

      setShowModal(false);
      Swal.fire({
        title: "Leave Status Updated!",
        text: `Leave request for ${selectedLeave.employee_name} has been set to ${reviewStatus}.`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      setSelectedLeave(null);
      await fetchLeaves();
    } catch (err) {
      Swal.fire({
        title: "Update Failed",
        text: err instanceof Error ? err.message : "Error processing review.",
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
        return <Badge bg="warning-subtle" className="text-warning border border-warning-subtle px-2.5 py-1 rounded-pill fw-semibold animate-pulse">Pending Review</Badge>;
    }
  };

  const getLeaveTypeBadge = (type: string) => {
    switch (type) {
      case "SICK":
        return <Badge bg="danger-subtle" className="text-danger-emphasis px-2 py-1 rounded">Sick Leave</Badge>;
      case "CASUAL":
        return <Badge bg="info-subtle" className="text-info-emphasis px-2 py-1 rounded">Casual Leave</Badge>;
      case "MATERNITY":
        return <Badge bg="success-subtle" className="text-success-emphasis px-2 py-1 rounded">Maternity Leave</Badge>;
      case "PATERNITY":
        return <Badge bg="primary-subtle" className="text-primary-emphasis px-2 py-1 rounded">Paternity Leave</Badge>;
      case "BEREAVEMENT":
        return <Badge bg="secondary-subtle" className="text-secondary-emphasis px-2 py-1 rounded">Bereavement Leave</Badge>;
      case "MARRIAGE":
        return <Badge bg="warning-subtle" className="text-warning-emphasis px-2 py-1 rounded">Marriage Leave</Badge>;
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

  const attachmentName = (url: string) => {
    const filename = url.split("?")[0].split("/").pop();
    return filename ? decodeURIComponent(filename) : "Supporting attachment";
  };

  const isImageAttachment = (url: string) => /\.(jpe?g|png|webp)$/i.test(url.split("?")[0]);

  // Metrics
  const totalRequested = leaves.length;
  const pendingLeaves = leaves.filter(l => l.status === "PENDING").length;
  const approvedLeaves = leaves.filter(l => l.status === "APPROVED").length;

  // Search & Filter Operations
  const filteredLeaves = leaves.filter((leave) => {
    const matchesSearch =
      leave.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      leave.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      leave.leave_type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || leave.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="container-fluid px-0 py-4" style={{ minHeight: "85vh" }}>
      {/* Header action area */}
      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: "16px", background: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)" }}>
        <Card.Body className="p-4">
          <h3 className="fw-bold text-dark mb-1">Company Leave Requests</h3>
          <p className="text-secondary small mb-0">
            Review, approve, or reject employee leave applications, add custom administrative remarks, and track calendar timelines.
          </p>
        </Card.Body>
      </Card>

      {/* Metrics Row */}
      <Row className="mb-4 g-3">
        <Col xs={12} md={4}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-primary-subtle text-primary rounded-3">
                <IconCalendarEvent size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Total Leaves Requested</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{totalRequested}</h3>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-warning-subtle text-warning rounded-3">
                <IconClock size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Pending Approvals</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{pendingLeaves}</h3>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="border-0 shadow-sm p-3 rounded-4 bg-white">
            <div className="d-flex align-items-center gap-3">
              <div className="p-3 bg-success-subtle text-success rounded-3">
                <IconCircleCheck size={24} />
              </div>
              <div>
                <h5 className="text-secondary small fw-semibold mb-0">Approved Requests</h5>
                <h3 className="fw-bold text-dark mb-0 mt-1">{approvedLeaves}</h3>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Feedback Alerts */}
      {successMsg && <Alert variant="success" className="border-0 shadow-sm rounded-3 mb-4" onClose={() => setSuccessMsg("")} dismissible>{successMsg}</Alert>}
      {error && <Alert variant="danger" className="border-0 shadow-sm rounded-3 mb-4" onClose={() => setError("")} dismissible>{error}</Alert>}

      {/* Filter and Search Card */}
      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: "14px" }}>
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={6}>
              <InputGroup className="border rounded-3" style={{ overflow: "hidden" }}>
                <InputGroup.Text className="bg-white border-0 pe-1">
                  <IconSearch size={18} className="text-secondary" />
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search by Employee name, type, or reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-0 shadow-none py-2.5 text-dark small"
                />
              </InputGroup>
            </Col>
            <Col xs={12} md={6} className="d-flex gap-2 justify-content-md-end flex-wrap">
              <Button
                variant={statusFilter === "ALL" ? "primary" : "outline-secondary"}
                onClick={() => setStatusFilter("ALL")}
                className="px-3.5 py-2 rounded-3 small fw-semibold"
              >
                All
              </Button>
              <Button
                variant={statusFilter === "PENDING" ? "warning text-dark" : "outline-secondary"}
                onClick={() => setStatusFilter("PENDING")}
                className="px-3.5 py-2 rounded-3 small fw-semibold"
              >
                Pending ({pendingLeaves})
              </Button>
              <Button
                variant={statusFilter === "APPROVED" ? "success" : "outline-secondary"}
                onClick={() => setStatusFilter("APPROVED")}
                className="px-3.5 py-2 rounded-3 small fw-semibold"
              >
                Approved
              </Button>
              <Button
                variant={statusFilter === "REJECTED" ? "danger" : "outline-secondary"}
                onClick={() => setStatusFilter("REJECTED")}
                className="px-3.5 py-2 rounded-3 small fw-semibold"
              >
                Rejected
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Requests table card */}
      <Card className="leave-requests-card border-0 shadow-sm" style={{ borderRadius: "16px" }}>
        <Card.Body className="p-0">
          {isLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" className="mb-2" />
              <p className="text-secondary small mb-0">Loading company leaves...</p>
            </div>
          ) : filteredLeaves.length === 0 ? (
            <div className="text-center py-5 px-3">
              <IconInfoCircle size={40} className="text-muted mb-2" />
              <h5 className="fw-semibold text-dark-emphasis">No applications found</h5>
              <p className="text-secondary small mb-0">No leave requests match your search query or selected status filter.</p>
            </div>
          ) : (
            <div className="table-responsive leave-table-responsive">
              <Table hover className="align-middle text-nowrap mb-0 custom-leaves-table" style={{ minWidth: "900px" }}>
                <thead className="table-light">
                  <tr className="small text-secondary-emphasis" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>
                    <th className="px-4 py-3">Employee Details</th>
                    <th className="py-3">Leave Type</th>
                    <th className="py-3">Period</th>
                    <th className="py-3 text-center">Days</th>
                    <th className="py-3">Reason</th>
                    <th className="py-3">Status</th>
                    <th className="px-4 py-3 text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaves.map((leave) => {
                    const durationDays = leave.is_half_day ? 0.5 : calculateDays(leave.start_date, leave.end_date);
                    const startStr = new Date(leave.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                    const endStr = new Date(leave.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                    
                    return (
                      <tr key={leave.id} style={{ transition: "background-color 0.15s ease" }}>
                        <td className="px-4 py-3">
                          <div className="d-flex align-items-center gap-2.5">
                            <Avatar
                              type="image"
                              src={leave.employee_avatar_url || getAssetPath("/images/avatar/avatar-fallback.jpg")}
                              size="md"
                              className="rounded-circle border"
                            />
                            <div>
                              <div className="fw-bold text-dark small">{leave.employee_name}</div>
                              <div className="text-secondary small" style={{ fontSize: "0.74rem" }}>
                                {leave.employee_designation} • {leave.employee_department}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          {getLeaveTypeBadge(leave.leave_type)}
                        </td>
                        <td className="py-3 fw-medium text-dark small">
                          {startStr} — {endStr}
                        </td>
                        <td className="py-3 text-center fw-bold text-dark-emphasis small">
                          {durationDays} {durationDays === 1 ? "day" : "days"}
                        </td>
                        <td className="py-3 text-secondary small text-truncate" style={{ maxWidth: "220px" }} title={leave.reason}>
                          {leave.reason}
                        </td>
                        <td className="py-3">
                          {getStatusBadge(leave.status)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <Dropdown align="end">
                            <Dropdown.Toggle
                              variant="link"
                              className="leave-action-toggle border-0 text-secondary shadow-none"
                              id={`leave-actions-${leave.id}`}
                              aria-label={`Actions for ${leave.employee_name}'s leave request`}
                            >
                              <IconDotsVertical size={20} />
                            </Dropdown.Toggle>
                            <Dropdown.Menu
                              className="leave-action-menu shadow border-0"
                              popperConfig={{ strategy: "fixed" }}
                              style={{ zIndex: 1080 }}
                            >
                              {leave.status === "PENDING" && canEdit && (
                                <>
                                  <Dropdown.Item onClick={() => handleQuickStatusUpdate(leave, "APPROVED")} className="d-flex align-items-center gap-2 text-success fw-semibold">
                                    <IconCheck size={16} />
                                    Quick Approve
                                  </Dropdown.Item>
                                  <Dropdown.Item onClick={() => handleQuickStatusUpdate(leave, "REJECTED")} className="d-flex align-items-center gap-2 text-danger">
                                    <IconX size={16} />
                                    Quick Reject
                                  </Dropdown.Item>
                                  <Dropdown.Divider />
                                </>
                              )}
                              <Dropdown.Item onClick={() => handleOpenLeaveModal(leave, false)} className="d-flex align-items-center gap-2">
                                <IconEye size={16} />
                                View Details
                              </Dropdown.Item>
                              {canEdit && (
                                <Dropdown.Item onClick={() => handleOpenLeaveModal(leave, true)} className="d-flex align-items-center gap-2">
                                  <IconSettings size={16} />
                                  Change Status / Notes
                                </Dropdown.Item>
                              )}
                              {canDelete && (
                                <>
                                  <Dropdown.Divider />
                                  <Dropdown.Item onClick={() => handleDelete(leave.id, leave.employee_name)} className="d-flex align-items-center gap-2 text-danger">
                                    <IconTrash size={16} />
                                    Delete
                                  </Dropdown.Item>
                                </>
                              )}
                            </Dropdown.Menu>
                          </Dropdown>
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

      {/* Review & Details Modal */}
      {selectedLeave && (
        <Modal show={showModal} onHide={() => setShowModal(false)} centered className="border-0 shadow-lg" size="lg">
          <Modal.Header closeButton className="border-0 px-4 pt-4 pb-2">
            <Modal.Title className="fw-bold text-dark">
              {isEditing ? "Edit Leave Status" : "Leave Application Details"}
            </Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleReviewSubmit}>
            <Modal.Body className="px-4 py-3">
              {/* Employee Summary block */}
              <div className="d-flex align-items-center gap-3 bg-light p-3 rounded-4 mb-4 border">
                <Avatar
                  type="image"
                  src={selectedLeave.employee_avatar_url || getAssetPath("/images/avatar/avatar-fallback.jpg")}
                  size="lg"
                  className="rounded-circle border border-2 border-white shadow-sm"
                />
                <div>
                  <h5 className="fw-bold text-dark mb-0.5">{selectedLeave.employee_name}</h5>
                  <p className="text-secondary small mb-0.5" style={{ fontSize: "0.78rem" }}>
                    ID: {selectedLeave.employee_id} • Designation: {selectedLeave.employee_designation}
                  </p>
                  <p className="text-secondary-emphasis mb-0 small" style={{ fontSize: "0.78rem" }}>
                    Department: {selectedLeave.employee_department} • Email: {selectedLeave.employee_email}
                  </p>
                </div>
              </div>

              <Row className="g-3 mb-4">
                <Col xs={12} md={4}>
                  <div className="p-3 bg-light rounded-3 text-center border h-100 d-flex flex-column justify-content-center">
                    <span className="small text-secondary fw-semibold">Leave Type</span>
                    <div className="mt-1.5">{getLeaveTypeBadge(selectedLeave.leave_type)}</div>
                  </div>
                </Col>
                <Col xs={12} md={4}>
                  <div className="p-3 bg-light rounded-3 text-center border h-100 d-flex flex-column justify-content-center">
                    <span className="small text-secondary fw-semibold">Leave Period</span>
                    <span className="fw-bold text-dark mt-1" style={{ fontSize: "0.85rem" }}>
                      {new Date(selectedLeave.start_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} — {new Date(selectedLeave.end_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                </Col>
                <Col xs={12} md={4}>
                  <div className="p-3 bg-light rounded-3 text-center border h-100 d-flex flex-column justify-content-center">
                    <span className="small text-secondary fw-semibold">Calculated Days</span>
                    <h4 className="fw-bold text-primary mb-0 mt-1">
                      {selectedLeave.is_half_day ? "0.5 Day" : `${calculateDays(selectedLeave.start_date, selectedLeave.end_date)} Days`}
                    </h4>
                  </div>
                </Col>
              </Row>

              {isEditing && (
                <Alert variant="info" className="border-0 small">
                  Approval immediately marks the covered attendance dates as paid or unpaid leave and recalculates any existing payroll for those months. Monthly Casual and Sick Leave limits are enforced automatically.
                </Alert>
              )}

              <div className="mb-4">
                <span className="small fw-semibold text-secondary d-block mb-1.5">Employee Explanation / Reason:</span>
                <div className="p-3 bg-light rounded-3 border text-dark-emphasis small" style={{ whiteSpace: "pre-line" }}>
                  {selectedLeave.reason}
                </div>
                {selectedLeave.attachment && (
                  <div className="mt-3 border rounded-3 overflow-hidden bg-white">
                    <div className="p-3 d-flex flex-column flex-sm-row align-items-sm-center gap-3">
                      <div className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 40, height: 40 }}>
                        <IconPaperclip size={20} />
                      </div>
                      <div className="flex-grow-1 min-w-0">
                        <div className="small fw-semibold text-dark">Supporting attachment</div>
                        <div className="small text-secondary text-truncate" title={attachmentName(selectedLeave.attachment)}>{attachmentName(selectedLeave.attachment)}</div>
                      </div>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <Button as="a" href={resolveMediaUrl(selectedLeave.attachment)} target="_blank" rel="noreferrer" variant="outline-primary" size="sm" className="d-inline-flex align-items-center gap-1">
                          <IconEye size={15} /> Open
                        </Button>
                        <Button
                          onClick={() => triggerFileDownload(selectedLeave.attachment!, attachmentName(selectedLeave.attachment!))}
                          variant="primary"
                          size="sm"
                          className="d-inline-flex align-items-center gap-1"
                        >
                          <IconDownload size={15} /> Download
                        </Button>
                      </div>
                    </div>
                    {isImageAttachment(selectedLeave.attachment) && (
                      <div className="border-top bg-light p-3 text-center">
                        <img src={resolveMediaUrl(selectedLeave.attachment)} alt={`Attachment from ${selectedLeave.employee_name}`} className="img-fluid rounded-2 border" style={{ maxHeight: 300, objectFit: "contain" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isEditing ? (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold text-secondary mb-1">Status *</Form.Label>
                    <Form.Select
                      value={reviewStatus}
                      onChange={(e) => setReviewStatus(e.target.value)}
                      className="form-control rounded-3 p-2.5"
                    >
                      <option value="PENDING">Pending Review</option>
                      <option value="APPROVED">Approve Leave Application</option>
                      <option value="REJECTED">Reject Leave Application</option>
                    </Form.Select>
                  </Form.Group>

                  <Form.Group>
                    <Form.Label className="small fw-semibold text-secondary mb-1">HR Remarks / Admin Notes</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      placeholder="Add or update administrative remarks..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="form-control rounded-3 p-3"
                    />
                  </Form.Group>
                </>
              ) : (
                <div>
                  <span className="small fw-semibold text-secondary d-block mb-1.5">Review Status Details:</span>
                  <div className="p-3 bg-light rounded-3 border d-flex flex-column gap-2 small">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-medium text-secondary">Current Status:</span>
                      <span>{getStatusBadge(selectedLeave.status)}</span>
                    </div>
                    {selectedLeave.admin_notes ? (
                      <div className="border-top pt-2 mt-1">
                        <span className="fw-medium text-secondary d-block mb-1">Administrative Remarks:</span>
                        <span className="text-dark-emphasis">{selectedLeave.admin_notes}</span>
                      </div>
                    ) : (
                      <span className="border-top pt-2 mt-1 text-secondary">No administrative remarks added.</span>
                    )}
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="border-0 px-4 pb-4 pt-2">
              <Button variant="outline-secondary" onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-3 fw-semibold">
                Close
              </Button>
              {isEditing && (
                <Button
                  variant={reviewStatus === "APPROVED" ? "success" : reviewStatus === "REJECTED" ? "danger" : "warning"}
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-3 fw-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Updating Status...
                    </>
                  ) : "Save Status"}
                </Button>
              )}
            </Modal.Footer>
          </Form>
        </Modal>
      )}

      <style>{`
        .leave-requests-card {
          border-radius: 16px;
        }
        .leave-table-responsive {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          width: 100%;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f8fafc;
        }
        .leave-table-responsive::-webkit-scrollbar {
          height: 7px;
        }
        .leave-table-responsive::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 4px;
        }
        .leave-table-responsive::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .leave-table-responsive::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .leave-action-toggle {
          width: 34px;
          height: 34px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #fff;
        }
        .leave-action-toggle::after {
          display: none;
        }
        .leave-action-toggle:hover,
        .leave-action-toggle:focus,
        .leave-action-toggle.show {
          background: #f5f8fb;
          color: #0f172a;
        }
        .leave-action-menu {
          min-width: 190px;
          padding: 8px;
          z-index: 1080;
        }
        .leave-action-menu .dropdown-item {
          border-radius: 6px;
          padding: 8px 10px;
        }
        .custom-leaves-table tbody tr:hover {
          background-color: #f9fafb !important;
        }
        .animate-pulse {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
        @media (max-width: 767.98px) {
          .leave-requests-card {
            background: transparent !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminLeavesClient;
