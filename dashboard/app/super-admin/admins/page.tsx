"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  InputGroup,
  Modal,
  Row,
  Spinner,
  Table,
  Dropdown,
} from "react-bootstrap";
import {
  IconShieldCheck,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconMail,
  IconBuildingSkyscraper,
  IconUser,
  IconCheck,
  IconAlertTriangle,
  IconKey,
  IconDotsVertical,
  IconCopy,
} from "@tabler/icons-react";
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

type Administrator = {
  id: string | number;
  full_name: string;
  email: string;
  role?: string;
  custom_role_title?: string;
  organization_name?: string;
  is_active?: boolean;
  date_joined?: string;
};

type Organization = {
  id: number;
  name: string;
};

export default function SuperAdminAdminsPage() {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("ALL");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [selectedAdminForView, setSelectedAdminForView] = useState<Administrator | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    organization_id: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [adminRes, orgRes] = await Promise.all([
        apiClient.get("/api/v1/administrators/"),
        apiClient.get("/api/v1/organizations/"),
      ]);
      setAdministrators(Array.isArray(adminRes.data) ? adminRes.data : adminRes.data.results || []);
      setOrganizations(Array.isArray(orgRes.data) ? orgRes.data : orgRes.data.results || []);
    } catch {
      setError("Failed to fetch administrator records. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredAdmins = useMemo(() => {
    return administrators.filter((admin) => {
      // Exclude superadmin users from directory
      if (admin.role === "SUPER_ADMIN" || admin.role === "Super Admin") return false;

      const matchesSearch =
        admin.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        admin.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (admin.organization_name && admin.organization_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (admin.custom_role_title && admin.custom_role_title.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesOrg =
        selectedOrgFilter === "ALL" ||
        (admin.organization_name && admin.organization_name.toLowerCase() === selectedOrgFilter.toLowerCase());

      return matchesSearch && matchesOrg;
    });
  }, [administrators, searchQuery, selectedOrgFilter]);

  const handleCreateHR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email.trim()) return;

    setSubmitting(true);
    setError("");
    setCreatedTempPassword(null);

    try {
      const response = await apiClient.post("/api/v1/accounts/admin/create-hr/", {
        email: createForm.email.trim(),
        first_name: createForm.first_name.trim() || undefined,
        last_name: createForm.last_name.trim() || undefined,
        organization_id: createForm.organization_id ? Number(createForm.organization_id) : undefined,
      });

      setCreatedTempPassword(response.data.temp_password);
      setNotice(`HR Manager account created for ${createForm.email}! Password: ${response.data.temp_password}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.email?.[0] || "Failed to create HR account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container fluid className="py-3 px-lg-4 super-admin-admins-page">
      {/* Breadcrumb */}
      <DasherBreadcrumb
        items={[
          { label: "Super Admin", href: "/super-admin/dashboard" },
          { label: "Administrators Directory" },
        ]}
      />

      {/* Modern SaaS Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom">
        <div className="d-flex align-items-start gap-3">
          <div className="p-2.5 rounded-3 bg-warning-subtle text-warning d-flex align-items-center justify-content-center shadow-xs flex-shrink-0" style={{ width: 44, height: 44 }}>
            <IconShieldCheck size={24} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <h2 className="h4 mb-0 fw-bold text-dark">Administrators &amp; HR Managers</h2>
              <Badge bg="warning-subtle" text="dark" className="px-2.5 py-1 rounded-pill fw-semibold border border-warning-subtle" style={{ fontSize: "11px", letterSpacing: "0.02em" }}>
                Platform Control
              </Badge>
            </div>
            <p className="text-secondary mb-0 small">
              Onboard new tenant HR managers, assign company workspaces, and manage platform administrator access.
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <Button variant="outline-secondary" size="sm" onClick={fetchData} disabled={loading} className="d-inline-flex align-items-center gap-1.5 px-3 py-2 fw-medium shadow-xs">
            <IconRefresh size={16} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </Button>
          <Button
            variant="warning"
            size="sm"
            onClick={() => { setShowCreateModal(true); setCreatedTempPassword(null); }}
            className="d-inline-flex align-items-center gap-1.5 px-3.5 py-2 fw-semibold shadow-sm text-dark text-nowrap"
          >
            <IconPlus size={16} />
            <span>Onboard HR Manager</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError("")} className="border-0 shadow-sm d-flex align-items-center gap-2 mb-3">
          <IconAlertTriangle size={20} />
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice("")} className="border-0 shadow-sm d-flex align-items-center gap-2 mb-3">
          <IconCheck size={20} />
          {notice}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={7}>
              <InputGroup>
                <InputGroup.Text className="bg-white border-end-0 text-secondary">
                  <IconSearch size={18} />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search administrator by name, email, or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-start-0 ps-0 shadow-none"
                />
              </InputGroup>
            </Col>
            <Col xs={12} md={5}>
              <Form.Select
                value={selectedOrgFilter}
                onChange={(e) => setSelectedOrgFilter(e.target.value)}
                className="shadow-none"
              >
                <option value="ALL">All Company Workspaces ({organizations.length})</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.name}>
                    {org.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Main Table */}
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="warning" />
              <p className="text-secondary mb-0 mt-2">Loading administrator records…</p>
            </div>
          ) : filteredAdmins.length === 0 ? (
            <div className="text-center py-5 px-3">
              <IconShieldCheck size={48} className="text-secondary mb-3 opacity-50" />
              <h5 className="fw-bold text-dark mb-1">No administrators found</h5>
              <p className="text-secondary small mb-3">No matching administrator or HR manager records found.</p>
              <Button variant="warning" size="sm" className="fw-bold text-dark" onClick={() => setShowCreateModal(true)}>
                <IconPlus size={16} className="me-1" /> Onboard HR Manager
              </Button>
            </div>
          ) : (
            <Table responsive hover className="align-middle text-nowrap mb-0">
              <thead className="table-light">
                <tr className="text-nowrap">
                  <th className="ps-4">Administrator Name</th>
                  <th>Email Address</th>
                  <th>Assigned Workspace</th>
                  <th>Role & Access</th>
                  <th>Status</th>
                  <th className="text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id}>
                    <td className="ps-4">
                      <div className="d-flex align-items-center gap-2.5">
                        <div className="rounded-circle bg-warning-subtle text-warning-emphasis fw-bold d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                          <IconUser size={18} />
                        </div>
                        <div>
                          <strong className="text-dark d-block fs-6">{admin.full_name}</strong>
                          <span className="text-secondary small">ID: #{admin.id}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-dark d-flex align-items-center gap-1.5 small fw-medium">
                        <IconMail size={14} className="text-secondary" /> {admin.email}
                      </span>
                    </td>
                    <td>
                      <span className="d-flex align-items-center gap-1.5 text-secondary small fw-semibold">
                        <IconBuildingSkyscraper size={14} className="text-primary" /> {admin.organization_name || "Platform Global"}
                      </span>
                    </td>
                    <td>
                      <Badge
                        bg={
                          admin.role === "SUPER_ADMIN"
                            ? "dark"
                            : admin.role === "SUB_ADMIN"
                            ? "primary"
                            : "warning"
                        }
                        text={
                          admin.role === "SUPER_ADMIN" || admin.role === "SUB_ADMIN"
                            ? "white"
                            : "dark"
                        }
                        className="px-2.5 py-1 font-monospace"
                      >
                        {admin.custom_role_title || (admin.role === "SUPER_ADMIN" ? "Super Admin" : "Company Admin (HR)")}
                      </Badge>
                    </td>
                    <td>
                      <Badge bg="success-subtle" text="success" className="border border-success-subtle px-2.5 py-1">
                        Active
                      </Badge>
                    </td>
                    <td className="text-end pe-4">
                      <Dropdown align="end">
                        <Dropdown.Toggle as={ActionToggle}>
                          <IconDotsVertical size={16} />
                        </Dropdown.Toggle>
                        <Dropdown.Menu className="shadow border-0">
                          <Dropdown.Item onClick={() => setSelectedAdminForView(admin)}>
                            <IconShieldCheck size={15} className="me-2 text-warning" /> View Admin Details
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Modal: View Admin Details */}
      <Modal
        show={!!selectedAdminForView}
        onHide={() => {
          setSelectedAdminForView(null);
          setCopiedId(false);
          setCopiedEmail(false);
        }}
        centered
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold d-flex align-items-center gap-2 text-dark">
            <div className="p-2 rounded-3 bg-warning-subtle text-warning-emphasis d-flex align-items-center justify-content-center shadow-xs">
              <IconShieldCheck size={20} />
            </div>
            <div>
              <div className="fs-6 fw-bold">Administrator Profile</div>
              <span className="text-secondary small fw-normal" style={{ fontSize: "12px" }}>Platform Access & Assignment Details</span>
            </div>
          </Modal.Title>
        </Modal.Header>
        {selectedAdminForView && (
          <Modal.Body className="pt-3">
            {/* Top User Header Card */}
            <div className="p-3.5 bg-light rounded-3 mb-3 border">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded-3 bg-warning text-dark fw-bold d-flex align-items-center justify-content-center fs-4 flex-shrink-0 shadow-xs"
                  style={{ width: 48, height: 48 }}
                >
                  {(selectedAdminForView.full_name || selectedAdminForView.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-grow-1">
                  <h5 className="fw-bold text-dark mb-0.5 text-truncate">
                    {selectedAdminForView.full_name || selectedAdminForView.email.split("@")[0]}
                  </h5>
                  <div className="d-flex align-items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-secondary small d-flex align-items-center gap-1 text-truncate" style={{ fontSize: "12.5px" }}>
                      <IconMail size={14} className="text-muted" />
                      {selectedAdminForView.email}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-link p-0 text-secondary border-0"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedAdminForView.email);
                        setCopiedEmail(true);
                        setTimeout(() => setCopiedEmail(false), 2000);
                      }}
                      title="Copy Email"
                    >
                      {copiedEmail ? <IconCheck size={13} className="text-success" /> : <IconCopy size={13} className="text-muted" />}
                    </button>
                  </div>
                  <Badge bg="warning" text="dark" className="px-2 py-0.5 font-monospace rounded-pill" style={{ fontSize: "10.5px" }}>
                    {selectedAdminForView.custom_role_title || (selectedAdminForView.role === "SUPER_ADMIN" ? "Super Admin" : "Company Administrator (HR)")}
                  </Badge>
                </div>
              </div>
            </div>

            {/* 2-Column Info Grid */}
            <Row className="g-2.5">
              <Col xs={12} sm={6}>
                <div className="p-3 bg-white border rounded-3 h-100 shadow-xs">
                  <span className="text-secondary small fw-bold text-uppercase d-block mb-1" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                    Assigned Workspace
                  </span>
                  <div className="d-flex align-items-center gap-1.5 text-dark fw-semibold small">
                    <IconBuildingSkyscraper size={16} className="text-primary flex-shrink-0" />
                    <span className="text-truncate">{selectedAdminForView.organization_name || "Platform Global"}</span>
                  </div>
                </div>
              </Col>

              <Col xs={12} sm={6}>
                <div className="p-3 bg-white border rounded-3 h-100 shadow-xs">
                  <span className="text-secondary small fw-bold text-uppercase d-block mb-1" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                    Account Status
                  </span>
                  <div>
                    <Badge bg="success-subtle" text="success" className="border border-success-subtle px-2.5 py-1 rounded-pill fw-semibold" style={{ fontSize: "11px" }}>
                      ● Active Account
                    </Badge>
                  </div>
                </div>
              </Col>

              <Col xs={12} sm={6}>
                <div className="p-3 bg-white border rounded-3 h-100 shadow-xs">
                  <span className="text-secondary small fw-bold text-uppercase d-block mb-1" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                    Role Classification
                  </span>
                  <span className="text-dark fw-semibold small d-block">
                    {selectedAdminForView.custom_role_title || "Primary Tenant Owner"}
                  </span>
                </div>
              </Col>

              <Col xs={12} sm={6}>
                <div className="p-3 bg-white border rounded-3 h-100 shadow-xs">
                  <span className="text-secondary small fw-bold text-uppercase d-block mb-1" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                    Administrator ID
                  </span>
                  <div className="d-flex align-items-center justify-content-between gap-1">
                    <code className="text-dark font-monospace text-truncate small" style={{ maxWidth: 140 }}>
                      #{selectedAdminForView.id}
                    </code>
                    <button
                      type="button"
                      className="btn btn-sm btn-link p-0 text-secondary border-0"
                      onClick={() => {
                        navigator.clipboard.writeText(String(selectedAdminForView.id));
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      }}
                      title="Copy ID"
                    >
                      {copiedId ? <IconCheck size={13} className="text-success" /> : <IconCopy size={13} className="text-muted" />}
                    </button>
                  </div>
                </div>
              </Col>
            </Row>
          </Modal.Body>
        )}
        <Modal.Footer className="border-0 pt-2 pb-3">
          <Button
            variant="outline-secondary"
            size="sm"
            className="px-3 fw-semibold"
            onClick={() => {
              setSelectedAdminForView(null);
              setCopiedId(false);
              setCopiedEmail(false);
            }}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal: Onboard New HR Manager */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2 text-dark">
            <IconShieldCheck className="text-warning" size={24} />
            Onboard HR Manager Account
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateHR}>
          <Modal.Body className="py-3">
            <p className="text-secondary small mb-3">
              Super Admin can create a new HR Manager account. An initial temporary password will be generated for login access.
            </p>

            {createdTempPassword && (
              <Alert variant="success" className="border-0 shadow-xs mb-3">
                <div className="fw-bold mb-1 d-flex align-items-center gap-1">
                  <IconKey size={18} /> Credentials Generated:
                </div>
                <div className="small font-monospace bg-white p-2 border rounded">
                  Email: <strong>{createForm.email}</strong><br />
                  Temporary Password: <strong className="text-danger">{createdTempPassword}</strong>
                </div>
              </Alert>
            )}

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Assign to Company Workspace</Form.Label>
              <Form.Select
                value={createForm.organization_id || ""}
                onChange={(e) => setCreateForm({ ...createForm, organization_id: e.target.value })}
              >
                <option value="">-- Platform Global / Unassigned --</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} (ID: #{org.id})
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-secondary small">
                Designate this administrator as the primary HR manager for the selected company workspace.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">HR Manager Email Address *</Form.Label>
              <Form.Control
                type="email"
                required
                placeholder="hr@company.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </Form.Group>

            <Row className="g-2">
              <Col xs={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">First Name</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Priya"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">Last Name</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Patel"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowCreateModal(false)}>
              Close
            </Button>
            <Button variant="warning" type="submit" disabled={submitting} className="fw-bold text-dark">
              {submitting ? <Spinner size="sm" /> : "Create HR Account"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
