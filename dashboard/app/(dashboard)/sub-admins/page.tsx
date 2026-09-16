"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Dropdown,
  Form,
  InputGroup,
  Modal,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  IconShieldLock,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconMail,
  IconUser,
  IconKey,
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconCheck,
  IconAlertTriangle,
  IconUsers,
  IconBuildingSkyscraper,
  IconLock,
  IconLockOpen,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconShieldCheck,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import apiClient from "app/services/api";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

interface ActionToggleProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const ActionToggle = React.forwardRef<HTMLButtonElement, ActionToggleProps>(
  ({ children, onClick }, ref) => (
    <button
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      className="btn btn-light btn-sm p-1 border shadow-xs d-inline-flex align-items-center justify-content-center text-secondary"
      style={{ width: 32, height: 32 }}
      aria-label="Actions"
    >
      {children}
    </button>
  )
);
ActionToggle.displayName = "ActionToggle";

type ModulePermission = {
  view: boolean;
  edit: boolean;
  delete: boolean;
};

type PermissionsMap = {
  [module: string]: ModulePermission;
};

type SubAdminRecord = {
  id: string;
  user_id?: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  organization: number;
  organization_name: string;
  custom_role_title: string;
  permissions: PermissionsMap;
  created_at: string;
  updated_at: string;
};

export default function SubAdminsManagementPage() {
  const router = useRouter();

  const [subAdmins, setSubAdmins] = useState<SubAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Reset Password Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedForReset, setSelectedForReset] = useState<SubAdminRecord | null>(null);
  const [resetType, setResetType] = useState<"auto" | "custom">("auto");
  const [customPassword, setCustomPassword] = useState("");
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResult, setResetResult] = useState<{
    email: string;
    temp_password: string;
    name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSubAdmins = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.get("/api/v1/accounts/sub-admins/");
      setSubAdmins(Array.isArray(response.data) ? response.data : response.data.results || []);
    } catch {
      setError("Failed to load sub-admin records. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubAdmins();
  }, [fetchSubAdmins]);

  const filteredSubAdmins = useMemo(() => {
    return subAdmins.filter((sa) => {
      const q = searchQuery.toLowerCase();
      return (
        sa.full_name?.toLowerCase().includes(q) ||
        sa.email?.toLowerCase().includes(q) ||
        sa.custom_role_title?.toLowerCase().includes(q)
      );
    });
  }, [subAdmins, searchQuery]);

  // Open Reset Password Modal
  const openResetModal = (subAdmin: SubAdminRecord) => {
    setSelectedForReset(subAdmin);
    setResetType("auto");
    setCustomPassword("");
    setShowPasswordText(false);
    setResetError("");
    setResetResult(null);
    setCopied(false);
    setShowResetModal(true);
  };

  // Submit Reset Password
  const handlePerformReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForReset) return;

    if (resetType === "custom" && customPassword.length < 6) {
      setResetError("Custom password must be at least 6 characters long.");
      return;
    }

    setIsResetting(true);
    setResetError("");
    try {
      const payload: { password?: string } = {};
      if (resetType === "custom") {
        payload.password = customPassword.trim();
      }

      const res = await apiClient.post(
        `/api/v1/accounts/sub-admins/${selectedForReset.id}/reset-password/`,
        payload
      );

      setResetResult({
        email: selectedForReset.email,
        temp_password: res.data.temp_password,
        name: selectedForReset.full_name || selectedForReset.email,
      });
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to reset password. Please try again.";
      setResetError(msg);
    } finally {
      setIsResetting(false);
    }
  };

  // Copy Credentials with multi-layer fallback (Clipboard API + execCommand)
  const copyToClipboard = async (text: string, label: string = "Password") => {
    if (!text) return;
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        success = true;
      } else {
        throw new Error("Clipboard API not available in this context");
      }
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textArea);
      } catch (fallbackErr) {
        console.error("Copy fallback error:", fallbackErr);
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: false,
      });
      Toast.fire({
        icon: "success",
        title: `${label} copied to clipboard!`,
      });
    } else {
      // Prompt user with prompt dialog
      prompt("Copy to clipboard: Ctrl+C, Enter", text);
    }
  };

  // Lock / Unlock Sub-Admin Access
  const handleToggleStatus = async (subAdmin: SubAdminRecord) => {
    const isCurrentlyActive = subAdmin.is_active;
    const actionWord = isCurrentlyActive ? "Lock & Suspend" : "Unlock & Activate";
    const result = await Swal.fire({
      title: `${actionWord} Access?`,
      html: isCurrentlyActive
        ? `Are you sure you want to <strong>lock</strong> sub-admin access for <strong>${subAdmin.full_name || subAdmin.email}</strong>? They will be immediately prevented from logging into the dashboard.`
        : `Are you sure you want to <strong>unlock and reactivate</strong> access for <strong>${subAdmin.full_name || subAdmin.email}</strong>?`,
      icon: isCurrentlyActive ? "warning" : "question",
      showCancelButton: true,
      confirmButtonColor: isCurrentlyActive ? "#dc3545" : "#198754",
      cancelButtonColor: "#6c757d",
      confirmButtonText: isCurrentlyActive ? "Yes, Lock Access" : "Yes, Unlock Access",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await apiClient.post(`/api/v1/accounts/sub-admins/${subAdmin.id}/toggle-status/`, {
        is_active: !isCurrentlyActive,
      });

      setSubAdmins((prev) =>
        prev.map((sa) => (sa.id === subAdmin.id ? { ...sa, is_active: res.data.is_active } : sa))
      );

      Swal.fire({
        title: "Status Updated",
        text: res.data.detail || `Account has been ${!isCurrentlyActive ? "activated" : "locked"}.`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire({
        title: "Action Failed",
        text: err.response?.data?.detail || "Failed to update sub-admin status.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  // Delete Sub-Admin
  const handleDeleteSubAdmin = async (subAdmin: SubAdminRecord) => {
    const result = await Swal.fire({
      title: "Delete Sub-Administrator?",
      html: `
        <p class="text-secondary mb-2">Are you sure you want to permanently delete <strong>${subAdmin.full_name || subAdmin.email}</strong>?</p>
        <div class="alert alert-danger p-2 small mb-0 text-start">
          ⚠️ <strong>Irreversible Action</strong>: All associated role permissions, portal credentials, and administrative delegations will be permanently revoked.
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Delete Account",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      await apiClient.delete(`/api/v1/accounts/sub-admins/${subAdmin.id}/`);
      setSubAdmins((prev) => prev.filter((sa) => sa.id !== subAdmin.id));
      Swal.fire({
        title: "Account Deleted",
        text: `Sub-admin account for ${subAdmin.email} has been permanently deleted.`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.fire({
        title: "Deletion Failed",
        text: err.response?.data?.detail || "Failed to delete sub-admin account.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  return (
    <Container fluid className="py-3 px-lg-4 sub-admins-page">
      {/* Breadcrumb */}
      <DasherBreadcrumb items={[{ label: "Roles & Sub-Admins" }]} />

      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom">
        <div className="d-flex align-items-start gap-3">
          <div
            className="p-2.5 rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center shadow-xs flex-shrink-0"
            style={{ width: 44, height: 44 }}
          >
            <IconShieldLock size={24} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <h2 className="h4 mb-0 fw-bold text-dark">Roles & Sub-Administrators</h2>
              <Badge
                bg="primary-subtle"
                text="primary"
                className="px-2.5 py-1 rounded-pill fw-semibold"
                style={{ fontSize: "11px", letterSpacing: "0.02em" }}
              >
                RBAC Access Control
              </Badge>
            </div>
            <p className="text-secondary mb-0 small">
              Create sub-admin managers (HR, Attendance Lead, Payroll Officer) and customize granular module access (View, Edit, Delete).
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={fetchSubAdmins}
            disabled={loading}
            className="d-inline-flex align-items-center gap-1.5 px-3 py-2 fw-medium shadow-xs"
          >
            <IconRefresh size={16} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </Button>
          <Link
            href="/sub-admins/create"
            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1.5 px-3.5 py-2 fw-semibold shadow-sm text-nowrap"
          >
            <IconPlus size={16} />
            <span>Onboard Sub-Admin</span>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError("")}
          className="border-0 shadow-sm d-flex align-items-center gap-2 mb-3"
        >
          <IconAlertTriangle size={20} />
          {error}
        </Alert>
      )}
      {notice && (
        <Alert
          variant="success"
          dismissible
          onClose={() => setNotice("")}
          className="border-0 shadow-sm d-flex align-items-center gap-2 mb-3"
        >
          <IconCheck size={20} />
          {notice}
        </Alert>
      )}

      {/* Overview Cards */}
      <Row className="g-3 mb-4">
        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3 d-flex align-items-center gap-3">
              <div className="p-2.5 rounded-3 bg-primary-subtle text-primary">
                <IconShieldLock size={26} />
              </div>
              <div>
                <span className="text-secondary small d-block">Configured Sub-Admins</span>
                <span className="h4 fw-bold text-dark mb-0">{subAdmins.length}</span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3 d-flex align-items-center gap-3">
              <div className="p-2.5 rounded-3 bg-success-subtle text-success">
                <IconUser size={26} />
              </div>
              <div>
                <span className="text-secondary small d-block">Active Accounts</span>
                <span className="h4 fw-bold text-dark mb-0">
                  {subAdmins.filter((s) => s.is_active).length}
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3 d-flex align-items-center gap-3">
              <div className="p-2.5 rounded-3 bg-info-subtle text-info">
                <IconUsers size={26} />
              </div>
              <div>
                <span className="text-secondary small d-block">Custom Role Titles</span>
                <span className="h4 fw-bold text-dark mb-0">
                  {new Set(subAdmins.map((s) => s.custom_role_title).filter(Boolean)).size}
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3 d-flex align-items-center gap-3">
              <div className="p-2.5 rounded-3 bg-warning-subtle text-warning">
                <IconBuildingSkyscraper size={26} />
              </div>
              <div>
                <span className="text-secondary small d-block">Workspace Scope</span>
                <span className="h5 fw-bold text-dark mb-0 text-truncate" style={{ maxWidth: 160 }}>
                  {subAdmins[0]?.organization_name || "Active Workspace"}
                </span>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Directory Table Card */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white border-bottom py-3 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div className="d-flex align-items-center gap-2">
            <h5 className="mb-0 fw-bold text-dark">Sub-Administrators Directory</h5>
            <Badge bg="secondary" pill className="font-monospace">
              {filteredSubAdmins.length}
            </Badge>
          </div>

          <div className="d-flex align-items-center gap-2 w-100 w-md-auto" style={{ maxWidth: 360 }}>
            <InputGroup size="sm" className="shadow-xs">
              <InputGroup.Text className="bg-light border-end-0">
                <IconSearch size={16} className="text-secondary" />
              </InputGroup.Text>
              <Form.Control
                type="text"
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-light border-start-0 ps-0"
              />
            </InputGroup>
          </div>
        </Card.Header>

        <Card.Body className="p-0" style={{ minHeight: "300px" }}>
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
              <span className="text-secondary">Loading sub-administrators directory...</span>
            </div>
          ) : filteredSubAdmins.length === 0 ? (
            <div className="text-center py-5 px-3">
              <div className="p-3 bg-light rounded-circle d-inline-flex mb-3 text-secondary">
                <IconShieldLock size={36} />
              </div>
              <h5 className="fw-bold text-dark">No Sub-Administrators Configured</h5>
              <p className="text-secondary small mb-3" style={{ maxWidth: 450, margin: "0 auto" }}>
                Delegate operational duties to HR executives, attendance managers, or payroll leads with strictly bounded privileges.
              </p>
              <Link href="/sub-admins/create" className="btn btn-primary btn-sm px-3 shadow-xs">
                <IconPlus size={16} className="me-1" /> Onboard First Sub-Admin
              </Link>
            </div>
          ) : (
            <div className="table-responsive pb-5" style={{ minHeight: "260px" }}>
              <Table hover className="mb-0 align-middle">
                <thead className="bg-light small text-secondary">
                  <tr>
                    <th className="ps-4 py-3">Administrator</th>
                    <th className="py-3">Contact Email</th>
                    <th className="py-3">Assigned Role Title</th>
                    <th className="py-3">Authorized Modules</th>
                    <th className="py-3">Account Status</th>
                    <th className="text-end pe-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubAdmins.map((subAdmin, index) => {
                    const allowedModules = Object.keys(subAdmin.permissions || {}).filter(
                      (key) => subAdmin.permissions[key]?.view
                    );

                    return (
                      <tr key={subAdmin.id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-2.5">
                            <div
                              className={`rounded-circle ${
                                subAdmin.is_active ? "bg-primary-subtle text-primary" : "bg-danger-subtle text-danger"
                              } fw-bold d-flex align-items-center justify-content-center`}
                              style={{ width: 38, height: 38 }}
                            >
                              <IconUser size={20} />
                            </div>
                            <div>
                              <strong className="text-dark d-block fs-6">
                                {subAdmin.full_name || subAdmin.email.split("@")[0]}
                              </strong>
                              <span className="text-secondary small">{subAdmin.organization_name}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="text-dark d-flex align-items-center gap-1.5 small fw-medium">
                            <IconMail size={14} className="text-secondary" /> {subAdmin.email}
                          </span>
                          {subAdmin.phone && (
                            <span className="text-secondary small d-block font-monospace mt-0.5">
                              {subAdmin.phone}
                            </span>
                          )}
                        </td>
                        <td>
                          <Badge bg="primary-subtle" text="primary" className="border border-primary-subtle px-2.5 py-1 font-monospace">
                            {subAdmin.custom_role_title || "HR Manager"}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 320 }}>
                            {allowedModules.length === 0 ? (
                              <span className="text-muted small italic">No active modules</span>
                            ) : (
                              allowedModules.slice(0, 4).map((modKey) => {
                                const p = subAdmin.permissions[modKey];
                                const tag = p?.delete ? "V+E+D" : p?.edit ? "V+E" : "View";
                                return (
                                  <Badge
                                    key={modKey}
                                    bg="light"
                                    text="dark"
                                    className="border shadow-xs px-2 py-1 font-monospace small"
                                  >
                                    {modKey.toUpperCase()}{" "}
                                    <span className="text-primary font-monospace fw-bold">({tag})</span>
                                  </Badge>
                                );
                              })
                            )}
                            {allowedModules.length > 4 && (
                              <Badge bg="secondary-subtle" text="secondary" className="px-2 py-1">
                                +{allowedModules.length - 4} more
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td>
                          {subAdmin.is_active ? (
                            <Badge bg="success-subtle" text="success" className="border border-success-subtle px-2.5 py-1 d-inline-flex align-items-center gap-1">
                              <IconCheck size={13} /> Active
                            </Badge>
                          ) : (
                            <Badge bg="danger-subtle" text="danger" className="border border-danger-subtle px-2.5 py-1 d-inline-flex align-items-center gap-1">
                              <IconLock size={13} /> Locked / Suspended
                            </Badge>
                          )}
                        </td>
                        <td className="text-end pe-4">
                          <Dropdown align="end">
                            <Dropdown.Toggle as={ActionToggle}>
                              <IconDotsVertical size={16} />
                            </Dropdown.Toggle>
                            <Dropdown.Menu
                              popperConfig={{ strategy: "fixed" }}
                              className="shadow border-0 py-2"
                              style={{ zIndex: 1060, minWidth: 200 }}
                            >
                              <Dropdown.Item onClick={() => router.push(`/sub-admins/${subAdmin.id}/edit`)}>
                                <IconEdit size={16} className="me-2 text-primary" /> Edit Permissions
                              </Dropdown.Item>
                              <Dropdown.Item onClick={() => openResetModal(subAdmin)}>
                                <IconKey size={16} className="me-2 text-warning" /> Reset Password
                              </Dropdown.Item>
                              <Dropdown.Item
                                onClick={() => handleToggleStatus(subAdmin)}
                                className={subAdmin.is_active ? "text-danger" : "text-success"}
                              >
                                {subAdmin.is_active ? (
                                  <>
                                    <IconLock size={16} className="me-2 text-danger" /> Lock & Suspend Access
                                  </>
                                ) : (
                                  <>
                                    <IconLockOpen size={16} className="me-2 text-success" /> Unlock & Activate Access
                                  </>
                                )}
                              </Dropdown.Item>
                              <Dropdown.Divider />
                              <Dropdown.Item onClick={() => handleDeleteSubAdmin(subAdmin)} className="text-danger">
                                <IconTrash size={16} className="me-2 text-danger" /> Delete Account
                              </Dropdown.Item>
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

      {/* Reset Password Modal */}
      <Modal show={showResetModal} onHide={() => setShowResetModal(false)} centered size="lg">
        <Modal.Header closeButton className="border-bottom">
          <Modal.Title className="fw-bold fs-6 d-flex align-items-center gap-2">
            <IconKey size={20} className="text-warning" />
            {resetResult ? "Password Reset Successful" : "Reset Sub-Administrator Password"}
          </Modal.Title>
        </Modal.Header>

        {resetResult ? (
          <Modal.Body className="p-4">
            <div className="text-center mb-3">
              <div className="p-3 bg-success-subtle text-success rounded-circle d-inline-flex mb-2">
                <IconShieldCheck size={36} />
              </div>
              <h5 className="fw-bold text-dark">New Credentials Generated</h5>
              <p className="text-secondary small mb-0">
                The password for <strong>{resetResult.name}</strong> has been updated.
              </p>
            </div>

            <Card className="border bg-light p-3 mb-3">
              <div className="mb-2.5 pb-2 border-bottom d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small d-block">Login Email</span>
                  <strong className="text-dark font-monospace">{resetResult.email}</strong>
                </div>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => copyToClipboard(resetResult.email, "Email")}
                  className="d-flex align-items-center gap-1 text-nowrap px-2 py-1 fs-7"
                  title="Copy Email"
                >
                  <IconCopy size={14} /> Copy
                </Button>
              </div>

              <div>
                <span className="text-muted small d-block">New Temporary Password</span>
                <div className="d-flex align-items-center justify-content-between gap-2 mt-1">
                  <span
                    className="fs-5 fw-bold font-monospace text-primary bg-white px-3 py-2 rounded border flex-grow-1 text-center user-select-all cursor-pointer"
                    onClick={() => copyToClipboard(resetResult.temp_password, "Password")}
                    title="Click to copy password"
                    style={{ letterSpacing: "0.05em", cursor: "pointer" }}
                  >
                    {resetResult.temp_password}
                  </span>
                  <Button
                    variant={copied ? "success" : "primary"}
                    size="sm"
                    onClick={() => copyToClipboard(resetResult.temp_password, "Password")}
                    className="d-flex align-items-center gap-1 text-nowrap px-3 py-2 fw-semibold"
                  >
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </Button>
                </div>
              </div>

              <div className="mt-3 pt-2 border-top">
                <Button
                  variant="outline-dark"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(
                      `AttendStack Sub-Admin Credentials:\nEmail: ${resetResult.email}\nPassword: ${resetResult.temp_password}\nPortal URL: ${typeof window !== "undefined" ? window.location.origin : ""}/admin/sign-in`,
                      "Full credentials"
                    )
                  }
                  className="w-100 d-flex align-items-center justify-content-center gap-1.5 py-1.5 font-monospace"
                >
                  <IconCopy size={15} /> Copy Full Credentials (Email & Password)
                </Button>
              </div>
            </Card>

            <Alert variant="info" className="small border-0 shadow-xs mb-0 py-2">
              ℹ️ Share these credentials with the manager securely. They can change their password anytime after signing in.
            </Alert>
          </Modal.Body>
        ) : (
          <Form onSubmit={handlePerformReset}>
            <Modal.Body className="p-4">
              <div className="mb-3 border-bottom pb-3">
                <strong className="d-block text-dark fs-6">{selectedForReset?.full_name || selectedForReset?.email}</strong>
                <span className="text-secondary small">{selectedForReset?.email} • {selectedForReset?.custom_role_title}</span>
              </div>

              {resetError && (
                <Alert variant="danger" className="py-2 small mb-3">
                  {resetError}
                </Alert>
              )}

              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold small">Password Generation Mode</Form.Label>
                <div className="d-flex flex-column gap-2 mt-1">
                  <Form.Check
                    type="radio"
                    id="reset-mode-auto"
                    name="resetType"
                    label={
                      <div>
                        <strong>Auto-generate strong password</strong>
                        <span className="text-muted small d-block">System generates a secure 10-character temporary password.</span>
                      </div>
                    }
                    checked={resetType === "auto"}
                    onChange={() => setResetType("auto")}
                  />
                  <Form.Check
                    type="radio"
                    id="reset-mode-custom"
                    name="resetType"
                    label={
                      <div>
                        <strong>Set specific custom password</strong>
                        <span className="text-muted small d-block">Manually type a new password for this manager.</span>
                      </div>
                    }
                    checked={resetType === "custom"}
                    onChange={() => setResetType("custom")}
                  />
                </div>
              </Form.Group>

              {resetType === "custom" && (
                <Form.Group className="mb-2">
                  <Form.Label className="fw-semibold small">New Custom Password</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type={showPasswordText ? "text" : "password"}
                      placeholder="Enter minimum 6 characters..."
                      value={customPassword}
                      onChange={(e) => {
                        setCustomPassword(e.target.value);
                        if (resetError) setResetError("");
                      }}
                      required={resetType === "custom"}
                    />
                    <Button
                      variant="outline-secondary"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                    >
                      {showPasswordText ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </Button>
                  </InputGroup>
                </Form.Group>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowResetModal(false)} disabled={isResetting}>
                Cancel
              </Button>
              <Button variant="warning" type="submit" disabled={isResetting} className="d-inline-flex align-items-center gap-1.5 fw-semibold">
                {isResetting ? (
                  <>
                    <Spinner size="sm" animation="border" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <>
                    <IconKey size={16} />
                    <span>Confirm Password Reset</span>
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Form>
        )}

        {resetResult && (
          <Modal.Footer>
            <Button variant="primary" onClick={() => setShowResetModal(false)}>
              Done
            </Button>
          </Modal.Footer>
        )}
      </Modal>
    </Container>
  );
}
