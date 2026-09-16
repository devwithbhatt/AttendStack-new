"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  IconShieldLock,
  IconArrowLeft,
  IconCheck,
  IconAlertTriangle,
  IconKey,
  IconUsers,
  IconCalendarEvent,
  IconCoin,
  IconCalendarTime,
  IconBeach,
  IconListDetails,
  IconMessage,
  IconSettings,
  IconLayoutDashboard,
  IconEdit,
  IconInfoCircle,
  IconTrendingUp,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import apiClient from "app/services/api";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

type ModulePermission = {
  view: boolean;
  edit: boolean;
  delete: boolean;
};

type PermissionsMap = {
  [module: string]: ModulePermission;
};

const MODULE_DEFINITIONS = [
  { key: "dashboard", label: "Dashboard Analytics", icon: <IconLayoutDashboard size={20} className="text-primary" />, desc: "View key company attendance and personnel metrics" },
  { key: "employees", label: "Employees Directory", icon: <IconUsers size={20} className="text-info" />, desc: "Manage staff directory, profiles, and employee documents" },
  { key: "attendance", label: "Attendance & Shifts", icon: <IconCalendarEvent size={20} className="text-success" />, desc: "Track daily check-ins, logs, and override attendance" },
  { key: "leaves", label: "Leave Requests", icon: <IconCalendarTime size={20} className="text-warning" />, desc: "Review, approve, or reject employee leave applications" },
  { key: "holidays", label: "Holidays Calendar", icon: <IconBeach size={20} className="text-secondary" />, desc: "Configure company public and regional holidays" },
  { key: "payroll", label: "Monthly Salary & Payroll", icon: <IconCoin size={20} className="text-danger" />, desc: "View monthly payroll payouts, calculations, and generate PDF payslips" },
  { key: "increments", label: "Employee Salary Increments", icon: <IconTrendingUp size={20} className="text-success" />, desc: "Track upcoming salary raises, edit hike % / flat amounts, and approve appraisals" },
  { key: "tasks", label: "Projects & Tasks", icon: <IconListDetails size={20} className="text-purple" />, desc: "Assign and oversee department tasks and milestones" },
  { key: "chat", label: "Chat & Announcements", icon: <IconMessage size={20} className="text-teal" />, desc: "Broadcast company announcements and manager group chats" },
  { key: "settings", label: "Company Settings", icon: <IconSettings size={20} className="text-dark" />, desc: "Adjust work shifts, geofence, and organization policy" },
];

const STANDARD_ROLE_OPTIONS = [
  { value: "HR Manager", label: "HR Manager" },
  { value: "HR Executive / Specialist", label: "HR Executive / Specialist" },
  { value: "Attendance Supervisor", label: "Attendance Supervisor" },
  { value: "Payroll & Compensation Officer", label: "Payroll & Compensation Officer" },
  { value: "Talent & Recruitment Lead", label: "Talent & Recruitment Lead" },
  { value: "Operations & Admin Lead", label: "Operations & Admin Lead" },
  { value: "Auditor / Compliance Officer", label: "Auditor / Compliance Officer" },
  { value: "OTHER", label: "Other (Specify Custom Role Title...)" },
];

export default function EditSubAdminPage() {
  const router = useRouter();
  const params = useParams();
  const subAdminId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    role_selection: string;
    custom_role_title: string;
    is_active: boolean;
    permissions: PermissionsMap;
  } | null>(null);

  const fetchSubAdmin = useCallback(async () => {
    if (!subAdminId) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.get(`/api/v1/accounts/sub-admins/${subAdminId}/`);
      const data = response.data;
      const currentTitle = data.custom_role_title || "HR Manager";
      const matched = STANDARD_ROLE_OPTIONS.find(
        (opt) => opt.value !== "OTHER" && opt.value.toLowerCase() === currentTitle.toLowerCase()
      );

      setForm({
        id: data.id,
        email: data.email,
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        phone: data.phone || "",
        role_selection: matched ? matched.value : "OTHER",
        custom_role_title: matched ? "" : currentTitle,
        is_active: data.is_active,
        permissions: data.permissions || {},
      });
    } catch {
      setError("Failed to load sub-admin profile details.");
    } finally {
      setLoading(false);
    }
  }, [subAdminId]);

  useEffect(() => {
    fetchSubAdmin();
  }, [fetchSubAdmin]);

  const togglePermission = (moduleKey: string, action: "view" | "edit" | "delete") => {
    if (!form) return;
    setForm((prev) => {
      if (!prev) return null;
      const currentMod = prev.permissions[moduleKey] || { view: false, edit: false, delete: false };
      const nextVal = !currentMod[action];
      const updatedMod = { ...currentMod, [action]: nextVal };

      if ((action === "edit" || action === "delete") && nextVal) {
        updatedMod.view = true;
      }
      if (action === "view" && !nextVal) {
        updatedMod.edit = false;
        updatedMod.delete = false;
      }

      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [moduleKey]: updatedMod,
        },
      };
    });
  };

  const setAllModulePermissions = (allView: boolean, allEdit: boolean, allDelete: boolean) => {
    if (!form) return;
    const updated: PermissionsMap = {};
    MODULE_DEFINITIONS.forEach((m) => {
      updated[m.key] = { view: allView, edit: allEdit, delete: allDelete };
    });

    setForm((prev) => (prev ? { ...prev, permissions: updated } : null));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    const resolvedRoleTitle =
      form.role_selection === "OTHER"
        ? (form.custom_role_title.trim() || "Sub-Admin")
        : form.role_selection;

    setSubmitting(true);
    setError("");

    try {
      await apiClient.put(`/api/v1/accounts/sub-admins/${form.id}/`, {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        custom_role_title: resolvedRoleTitle,
        is_active: form.is_active,
        permissions: form.permissions,
      });

      setNotice("Access permissions updated successfully!");
      Swal.fire({
        title: "Access Permissions Updated!",
        text: `Permissions for ${form.email} have been saved successfully.`,
        icon: "success",
        timer: 1800,
        showConfirmButton: false,
      });

      setTimeout(() => {
        router.push("/sub-admins");
      }, 1500);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || "Failed to update sub-admin access rights.";
      setError(errorMsg);
      Swal.fire({
        title: "Update Failed",
        text: errorMsg,
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!form) return;

    const confirmResult = await Swal.fire({
      title: "Reset Password?",
      text: `Generate a new secure temporary password for ${form.email}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#0d6efd",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Reset Password",
      cancelButtonText: "Cancel",
    });

    if (!confirmResult.isConfirmed) return;

    try {
      const res = await apiClient.post(`/api/v1/accounts/sub-admins/${form.id}/reset-password/`);
      const newPass = res.data.temp_password;

      Swal.fire({
        title: "Password Reset Successfully!",
        html: `
          <div class="text-start">
            <p class="text-secondary small mb-2">Share this temporary password with <strong>${form.email}</strong>:</p>
            <div class="p-3 bg-light rounded border font-monospace text-center fs-5 text-danger fw-bold user-select-all mb-2">
              ${newPass}
            </div>
            <p class="text-muted small mb-0">The sub-admin will be prompted to set a new password upon login.</p>
          </div>
        `,
        icon: "success",
        confirmButtonText: "Done",
        confirmButtonColor: "#198754",
      });
    } catch {
      Swal.fire({
        title: "Reset Failed",
        text: "Failed to reset password. Please try again.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  if (loading) {
    return (
      <Container fluid className="py-5 text-center">
        <Spinner animation="border" variant="primary" />
        <p className="text-secondary mt-2">Loading sub-admin profile...</p>
      </Container>
    );
  }

  if (!form) {
    return (
      <Container fluid className="py-4">
        <Alert variant="danger">
          Sub-admin not found or failed to load.
          <div className="mt-2">
            <Link href="/sub-admins" className="btn btn-sm btn-outline-danger">
              Back to Sub-Admins Directory
            </Link>
          </div>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid className="py-3 px-lg-4 edit-subadmin-page">
      {/* Breadcrumb */}
      <DasherBreadcrumb
        items={[
          { label: "Roles & Sub-Admins", href: "/sub-admins" },
          { label: `Edit Permissions (${form.email})` },
        ]}
      />

      {/* Modern Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom">
        <div className="d-flex align-items-start gap-3">
          <Link
            href="/sub-admins"
            className="btn btn-light btn-sm border shadow-xs rounded-3 text-secondary d-inline-flex align-items-center justify-content-center flex-shrink-0 mt-0.5"
            style={{ width: 40, height: 40 }}
            title="Back to Directory"
          >
            <IconArrowLeft size={18} />
          </Link>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <h2 className="h4 mb-0 fw-bold text-dark">Edit Sub-Admin Permissions</h2>
              <Badge
                bg={form.is_active ? "success-subtle" : "secondary-subtle"}
                text={form.is_active ? "success" : "secondary"}
                className="px-2.5 py-1 rounded-pill fw-semibold"
                style={{ fontSize: "11px", letterSpacing: "0.02em" }}
              >
                {form.is_active ? "Active Account" : "Suspended"}
              </Badge>
            </div>
            <p className="text-secondary mb-0 small">
              Managing permissions for <span className="text-dark fw-semibold">{form.email}</span>.
            </p>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <Button
            variant="outline-warning"
            size="sm"
            onClick={handleResetPassword}
            className="d-inline-flex align-items-center gap-1.5 px-3 py-2 fw-medium shadow-xs"
          >
            <IconKey size={15} />
            <span>Reset Password</span>
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => router.push("/sub-admins")}
            className="px-3 py-2 fw-medium shadow-xs"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="edit-subadmin-form"
            disabled={submitting}
            className="px-3.5 py-2 fw-semibold shadow-sm text-nowrap d-inline-flex align-items-center gap-1.5"
          >
            {submitting ? <Spinner size="sm" /> : <IconCheck size={16} />}
            <span>{submitting ? "Saving..." : "Save Changes"}</span>
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError("")} className="border-0 shadow-sm d-flex align-items-center gap-2 mb-4">
          <IconAlertTriangle size={20} />
          <span>{error}</span>
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice("")} className="border-0 shadow-sm d-flex align-items-center gap-2 mb-4">
          <IconCheck size={20} />
          <span>{notice}</span>
        </Alert>
      )}

      {/* Main Form */}
      <Form onSubmit={handleSubmit} id="edit-subadmin-form">
        <Row className="g-4">
          {/* Left Column: Profile & Role Info */}
          <Col xs={12} lg={4}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Header className="bg-white border-bottom py-3">
                <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                  <IconShieldLock size={20} className="text-primary" />
                  1. Profile & Status
                </h5>
              </Card.Header>
              <Card.Body className="p-3 p-md-4">
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small text-dark">Work Email Address</Form.Label>
                  <Form.Control type="email" disabled value={form.email} className="bg-light font-monospace" />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small text-dark">Account Status</Form.Label>
                  <Form.Select
                    value={form.is_active ? "active" : "inactive"}
                    onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
                  >
                    <option value="active">Active (Full Assigned Access)</option>
                    <option value="inactive">Suspended / Deactivated</option>
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small text-dark">
                    Role Title <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={form.role_selection}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => prev ? ({
                        ...prev,
                        role_selection: val,
                        custom_role_title: val === "OTHER" ? (prev.custom_role_title || "") : "",
                      }) : null);
                    }}
                  >
                    {STANDARD_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                {/* Conditional Custom Role Title Input */}
                {form.role_selection === "OTHER" && (
                  <Form.Group className="mb-3 p-2.5 rounded bg-primary-subtle border border-primary-subtle">
                    <Form.Label className="fw-semibold small text-primary mb-1">
                      Custom Role Title <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. Regional Compliance Supervisor"
                      value={form.custom_role_title}
                      onChange={(e) => setForm({ ...form, custom_role_title: e.target.value })}
                    />
                  </Form.Group>
                )}

                <Row className="g-2 mb-3">
                  <Col xs={12} sm={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold small text-dark">First Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={form.first_name}
                        onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold small text-dark">Last Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={form.last_name}
                        onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small text-dark">Phone Number</Form.Label>
                  <Form.Control
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>

          {/* Right Column: Permissions Matrix */}
          <Col xs={12} lg={8}>
            <Card className="border-0 shadow-sm">
              <Card.Header className="bg-white border-bottom py-3 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                  <IconSettings size={20} className="text-primary" />
                  2. Granular Module Permissions Matrix
                </h5>
                <div className="d-flex gap-1.5 align-items-center">
                  <Button variant="link" size="sm" className="p-0 text-decoration-none small text-primary fw-medium" onClick={() => setAllModulePermissions(true, true, true)}>
                    Select All
                  </Button>
                  <span className="text-secondary opacity-50">|</span>
                  <Button variant="link" size="sm" className="p-0 text-decoration-none small text-secondary" onClick={() => setAllModulePermissions(true, false, false)}>
                    Read Only All
                  </Button>
                  <span className="text-secondary opacity-50">|</span>
                  <Button variant="link" size="sm" className="p-0 text-decoration-none small text-danger" onClick={() => setAllModulePermissions(false, false, false)}>
                    Clear All
                  </Button>
                </div>
              </Card.Header>
              <Card.Body className="p-0">
                <div className="table-responsive">
                  <Table className="mb-0 align-middle">
                    <thead className="bg-light small text-secondary border-bottom">
                      <tr>
                        <th className="ps-3 ps-md-4 py-3">Module & Resource</th>
                        <th className="text-center py-3" style={{ width: 110 }}>View (Read)</th>
                        <th className="text-center py-3" style={{ width: 110 }}>Edit (Write)</th>
                        <th className="text-center py-3" style={{ width: 110 }}>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULE_DEFINITIONS.map((mod) => {
                        const perms = form.permissions[mod.key] || { view: false, edit: false, delete: false };
                        return (
                          <tr key={mod.key} className="border-bottom">
                            <td className="ps-3 ps-md-4 py-3" style={{ minWidth: 280 }}>
                              <div className="d-flex align-items-center gap-3">
                                <div
                                  className="rounded-3 bg-light border shadow-xs d-flex align-items-center justify-content-center flex-shrink-0"
                                  style={{ width: 42, height: 42, minWidth: 42 }}
                                >
                                  {mod.icon}
                                </div>
                                <div className="flex-grow-1">
                                  <strong className="text-dark d-block fs-6 mb-0.5">{mod.label}</strong>
                                  <span className="text-secondary small d-block" style={{ fontSize: "12px", lineHeight: "1.3" }}>{mod.desc}</span>
                                </div>
                              </div>
                            </td>
                            <td className="text-center py-3">
                              <Form.Check
                                type="switch"
                                id={`perm-view-${mod.key}`}
                                className="d-inline-block fs-5"
                                checked={Boolean(perms.view)}
                                onChange={() => togglePermission(mod.key, "view")}
                                aria-label={`View permission for ${mod.label}`}
                              />
                            </td>
                            <td className="text-center py-3">
                              <Form.Check
                                type="switch"
                                id={`perm-edit-${mod.key}`}
                                className="d-inline-block fs-5"
                                checked={Boolean(perms.edit)}
                                onChange={() => togglePermission(mod.key, "edit")}
                                aria-label={`Edit permission for ${mod.label}`}
                              />
                            </td>
                            <td className="text-center py-3">
                              <Form.Check
                                type="switch"
                                id={`perm-delete-${mod.key}`}
                                className="d-inline-block fs-5"
                                checked={Boolean(perms.delete)}
                                onChange={() => togglePermission(mod.key, "delete")}
                                aria-label={`Delete permission for ${mod.label}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
              <Card.Footer className="bg-white border-top py-3 d-flex justify-content-between align-items-center">
                <Button variant="outline-secondary" onClick={() => router.push("/sub-admins")}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting} className="fw-bold px-4 shadow-sm d-flex align-items-center gap-2">
                  {submitting ? <Spinner size="sm" /> : <IconCheck size={18} />}
                  {submitting ? "Saving Changes..." : "Save Access Permissions"}
                </Button>
              </Card.Footer>
            </Card>
          </Col>
        </Row>
      </Form>
    </Container>
  );
}
