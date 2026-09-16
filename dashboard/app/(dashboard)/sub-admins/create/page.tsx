"use client";

import React, { useState } from "react";
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
  IconCopy,
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
  IconUserPlus,
  IconAdjustmentsHorizontal,
  IconInfoCircle,
  IconTrendingUp,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

const PRESET_TEMPLATES: { [presetKey: string]: { label: string; roleOption: string; desc: string; permissions: PermissionsMap } } = {
  hr_manager: {
    label: "HR Manager",
    roleOption: "HR Manager",
    desc: "Full operational access to staff, daily attendance, leaves, holidays, and communication.",
    permissions: {
      dashboard: { view: true, edit: false, delete: false },
      employees: { view: true, edit: true, delete: false },
      attendance: { view: true, edit: true, delete: false },
      leaves: { view: true, edit: true, delete: false },
      holidays: { view: true, edit: true, delete: false },
      payroll: { view: false, edit: false, delete: false },
      increments: { view: true, edit: true, delete: false },
      tasks: { view: true, edit: true, delete: false },
      chat: { view: true, edit: true, delete: false },
      settings: { view: false, edit: false, delete: false },
    },
  },
  attendance_supervisor: {
    label: "Attendance Supervisor",
    roleOption: "Attendance Supervisor",
    desc: "Strictly manage daily employee check-ins, punctuality logs, and leave approvals.",
    permissions: {
      dashboard: { view: true, edit: false, delete: false },
      employees: { view: true, edit: false, delete: false },
      attendance: { view: true, edit: true, delete: false },
      leaves: { view: true, edit: true, delete: false },
      holidays: { view: true, edit: false, delete: false },
      payroll: { view: false, edit: false, delete: false },
      increments: { view: false, edit: false, delete: false },
      tasks: { view: false, edit: false, delete: false },
      chat: { view: true, edit: false, delete: false },
      settings: { view: false, edit: false, delete: false },
    },
  },
  payroll_specialist: {
    label: "Payroll & Compensation Officer",
    roleOption: "Payroll & Compensation Officer",
    desc: "Process salaries, verify payout records, and manage salary increments.",
    permissions: {
      dashboard: { view: true, edit: false, delete: false },
      employees: { view: true, edit: false, delete: false },
      attendance: { view: true, edit: false, delete: false },
      leaves: { view: true, edit: false, delete: false },
      holidays: { view: true, edit: false, delete: false },
      payroll: { view: true, edit: true, delete: false },
      increments: { view: true, edit: true, delete: false },
      tasks: { view: false, edit: false, delete: false },
      chat: { view: false, edit: false, delete: false },
      settings: { view: false, edit: false, delete: false },
    },
  },
  full_subadmin: {
    label: "Operations & Admin Lead",
    roleOption: "Operations & Admin Lead",
    desc: "Unrestricted permissions across all workspace modules and configuration.",
    permissions: {
      dashboard: { view: true, edit: true, delete: true },
      employees: { view: true, edit: true, delete: true },
      attendance: { view: true, edit: true, delete: true },
      leaves: { view: true, edit: true, delete: true },
      holidays: { view: true, edit: true, delete: true },
      payroll: { view: true, edit: true, delete: true },
      increments: { view: true, edit: true, delete: true },
      tasks: { view: true, edit: true, delete: true },
      chat: { view: true, edit: true, delete: true },
      settings: { view: true, edit: true, delete: true },
    },
  },
  read_only: {
    label: "Auditor / Compliance Officer",
    roleOption: "Auditor / Compliance Officer",
    desc: "Read-only visibility for reporting and auditing without ability to edit or delete records.",
    permissions: {
      dashboard: { view: true, edit: false, delete: false },
      employees: { view: true, edit: false, delete: false },
      attendance: { view: true, edit: false, delete: false },
      leaves: { view: true, edit: false, delete: false },
      holidays: { view: true, edit: false, delete: false },
      payroll: { view: true, edit: false, delete: false },
      increments: { view: true, edit: false, delete: false },
      tasks: { view: true, edit: false, delete: false },
      chat: { view: true, edit: false, delete: false },
      settings: { view: false, edit: false, delete: false },
    },
  },
};

export default function OnboardSubAdminPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    role_selection: "HR Manager",
    custom_role_title: "",
    preset: "hr_manager",
    permissions: { ...PRESET_TEMPLATES.hr_manager.permissions },
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    tempPassword: string;
    roleTitle: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const handlePresetSelect = (presetKey: string) => {
    if (PRESET_TEMPLATES[presetKey]) {
      const tpl = PRESET_TEMPLATES[presetKey];
      setForm((prev) => ({
        ...prev,
        preset: presetKey,
        role_selection: tpl.roleOption,
        custom_role_title: "",
        permissions: JSON.parse(JSON.stringify(tpl.permissions)),
      }));
    } else {
      setForm((prev) => ({ ...prev, preset: "custom" }));
    }
  };

  const togglePermission = (moduleKey: string, action: "view" | "edit" | "delete") => {
    setForm((prev) => {
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
        preset: "custom",
        permissions: {
          ...prev.permissions,
          [moduleKey]: updatedMod,
        },
      };
    });
  };

  const setAllModulePermissions = (allView: boolean, allEdit: boolean, allDelete: boolean) => {
    const updated: PermissionsMap = {};
    MODULE_DEFINITIONS.forEach((m) => {
      updated[m.key] = { view: allView, edit: allEdit, delete: allDelete };
    });

    setForm((prev) => ({ ...prev, preset: "custom", permissions: updated }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) return;

    const resolvedRoleTitle =
      form.role_selection === "OTHER"
        ? (form.custom_role_title.trim() || "Sub-Admin")
        : form.role_selection;

    setSubmitting(true);
    setError("");

    try {
      const response = await apiClient.post("/api/v1/accounts/sub-admins/", {
        email: form.email.trim(),
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        custom_role_title: resolvedRoleTitle,
        permissions: form.permissions,
      });

      const tempPass = response.data.temp_password;
      setCreatedCredentials({
        email: form.email.trim(),
        tempPassword: tempPass,
        roleTitle: resolvedRoleTitle,
      });

      Swal.fire({
        title: "Sub-Admin Onboarded!",
        text: `Account for ${form.email.trim()} has been created successfully.`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.email?.[0] ||
        "Failed to onboard sub-admin. Please verify the input.";
      setError(errorMsg);
      Swal.fire({
        title: "Onboarding Failed",
        text: errorMsg,
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2500);
  };

  const handleResetForm = () => {
    setCreatedCredentials(null);
    setForm({
      email: "",
      first_name: "",
      last_name: "",
      phone: "",
      role_selection: "HR Manager",
      custom_role_title: "",
      preset: "hr_manager",
      permissions: { ...PRESET_TEMPLATES.hr_manager.permissions },
    });
  };

  return (
    <Container fluid className="py-3 px-lg-4 onboard-subadmin-page">
      {/* Breadcrumb */}
      <DasherBreadcrumb
        items={[
          { label: "Roles & Sub-Admins", href: "/sub-admins" },
          { label: "Onboard Sub-Admin" },
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
              <h2 className="h4 mb-0 fw-bold text-dark">Onboard Sub-Administrator</h2>
              <Badge bg="primary-subtle" text="primary" className="px-2.5 py-1 rounded-pill fw-semibold" style={{ fontSize: "11px", letterSpacing: "0.02em" }}>
                Authority Delegation
              </Badge>
            </div>
            <p className="text-secondary mb-0 small">
              Assign delegated operational authority, assign a role title, and configure granular module-level permissions.
            </p>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-shrink-0">
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
            form="onboard-subadmin-form"
            disabled={submitting}
            className="px-3.5 py-2 fw-semibold shadow-sm text-nowrap d-inline-flex align-items-center gap-1.5"
          >
            {submitting ? <Spinner size="sm" /> : <IconShieldLock size={16} />}
            <span>{submitting ? "Creating..." : "Save & Onboard"}</span>
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError("")} className="border-0 shadow-sm d-flex align-items-center gap-2 mb-4">
          <IconAlertTriangle size={20} />
          <span>{error}</span>
        </Alert>
      )}

      {/* Success Credentials Banner */}
      {createdCredentials ? (
        <Card className="border-0 shadow-sm mb-4 bg-success-subtle border border-success-subtle">
          <Card.Body className="p-4">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-3">
              <div>
                <span className="badge bg-success text-white px-3 py-1.5 rounded-pill mb-2 d-inline-flex align-items-center gap-1.5">
                  <IconCheck size={16} /> SUB-ADMIN ACCOUNT ACTIVE
                </span>
                <h4 className="fw-bold text-success-emphasis mb-1">
                  Credentials Generated Successfully!
                </h4>
                <p className="text-success-emphasis small mb-0">
                  The sub-admin profile has been created and can now sign in to manage assigned company modules.
                </p>
              </div>
              <div className="d-flex gap-2">
                <Button variant="outline-success" className="d-flex align-items-center gap-1.5" onClick={handleResetForm}>
                  <IconUserPlus size={16} /> Onboard Another
                </Button>
                <Button variant="success" className="d-flex align-items-center gap-1.5 fw-bold" onClick={() => router.push("/sub-admins")}>
                  Return to Directory
                </Button>
              </div>
            </div>

            <Card className="border shadow-xs bg-white">
              <Card.Body className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                  <div className="d-flex align-items-center gap-2">
                    <IconKey size={20} className="text-primary" />
                    <strong className="text-dark">Sub-Admin Access Credentials</strong>
                  </div>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="py-1 px-3 d-flex align-items-center gap-1.5"
                    onClick={() => copyToClipboard(`Email: ${createdCredentials.email}\nTemporary Password: ${createdCredentials.tempPassword}\nRole: ${createdCredentials.roleTitle}`)}
                  >
                    {copiedPassword ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    {copiedPassword ? "Copied to Clipboard!" : "Copy Full Details"}
                  </Button>
                </div>
                <Row className="g-3">
                  <Col xs={12} sm={4}>
                    <div className="p-2.5 bg-light rounded border">
                      <small className="text-secondary d-block">Work Email Address</small>
                      <strong className="text-dark font-monospace">{createdCredentials.email}</strong>
                    </div>
                  </Col>
                  <Col xs={12} sm={4}>
                    <div className="p-2.5 bg-light rounded border">
                      <small className="text-secondary d-block">Temporary Password</small>
                      <strong className="text-danger font-monospace fs-6">{createdCredentials.tempPassword}</strong>
                    </div>
                  </Col>
                  <Col xs={12} sm={4}>
                    <div className="p-2.5 bg-light rounded border">
                      <small className="text-secondary d-block">Assigned Role Title</small>
                      <strong className="text-primary font-monospace">{createdCredentials.roleTitle}</strong>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Card.Body>
        </Card>
      ) : null}

      {/* Main Form */}
      <Form onSubmit={handleSubmit} id="onboard-subadmin-form">
        <Row className="g-4">
          {/* Left Column: Profile & Role Info */}
          <Col xs={12} lg={4}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Header className="bg-white border-bottom py-3">
                <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                  <IconShieldLock size={20} className="text-primary" />
                  1. Administrator Details
                </h5>
              </Card.Header>
              <Card.Body className="p-3 p-md-4">
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small text-dark">
                    Work Email Address <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="email"
                    required
                    placeholder="e.g. hr.manager@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <Form.Text className="text-muted small">
                    Login credentials will be bound to this email.
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold small text-dark">
                    Role Title <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={form.role_selection}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        role_selection: val,
                        custom_role_title: val === "OTHER" ? (prev.custom_role_title || "") : "",
                      }));
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
                    <Form.Text className="text-primary-emphasis small">
                      Specify the custom designation for this sub-admin.
                    </Form.Text>
                  </Form.Group>
                )}

                <Row className="g-2 mb-3">
                  <Col xs={12} sm={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold small text-dark">First Name</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g. Priya"
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
                        placeholder="e.g. Sharma"
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
                    placeholder="+91 9876543210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Form.Group>

                <div className="p-3 rounded bg-light border mt-3">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <IconInfoCircle size={17} className="text-primary" />
                    <strong className="small text-dark">RBAC Policy</strong>
                  </div>
                  <p className="text-secondary small mb-0" style={{ fontSize: "12px" }}>
                    Sub-admins can log in, view only their assigned tabs, and execute authorized write/delete actions.
                  </p>
                </div>
              </Card.Body>
            </Card>
          </Col>

          {/* Right Column: Templates & Permission Matrix */}
          <Col xs={12} lg={8}>
            <Card className="border-0 shadow-sm mb-4">
              <Card.Header className="bg-white border-bottom py-3 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                  <IconAdjustmentsHorizontal size={20} className="text-primary" />
                  2. Apply Role Template / Preset
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
              <Card.Body className="p-3 p-md-4">
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {Object.entries(PRESET_TEMPLATES).map(([key, template]) => (
                    <Button
                      key={key}
                      variant={form.preset === key ? "primary" : "outline-secondary"}
                      size="sm"
                      className="rounded-pill px-3 shadow-xs d-flex align-items-center gap-1.5"
                      onClick={() => handlePresetSelect(key)}
                    >
                      {template.label}
                    </Button>
                  ))}
                </div>

                {PRESET_TEMPLATES[form.preset] && (
                  <Alert variant="info" className="py-2 px-3 mb-0 border-0 bg-info-subtle text-info-emphasis small d-flex align-items-center gap-2">
                    <IconInfoCircle size={18} />
                    <span><strong>{PRESET_TEMPLATES[form.preset].label}:</strong> {PRESET_TEMPLATES[form.preset].desc}</span>
                  </Alert>
                )}
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm">
              <Card.Header className="bg-white border-bottom py-3">
                <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                  <IconSettings size={20} className="text-primary" />
                  3. Granular Module Permissions Matrix
                </h5>
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
                  {submitting ? <Spinner size="sm" /> : <IconShieldLock size={18} />}
                  {submitting ? "Creating Sub-Admin..." : "Save & Onboard Sub-Admin"}
                </Button>
              </Card.Footer>
            </Card>
          </Col>
        </Row>
      </Form>
    </Container>
  );
}
