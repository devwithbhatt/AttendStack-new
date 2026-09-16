"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
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
  IconBuildingSkyscraper,
  IconCopy,
  IconRefresh,
  IconPlus,
  IconSearch,
  IconEdit,
  IconTrash,
  IconPower,
  IconEye,
  IconUsers,
  IconUserCheck,
  IconCheck,
  IconAlertTriangle,
  IconCalendarEvent,
  IconMail,
  IconDotsVertical,
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

type Organization = {
  id: number;
  name: string;
  invite_code: string;
  owner: string | number | null;
  owner_name: string | null;
  owner_email: string | null;
  is_active: boolean;
  created_at: string;
  can_manage_invite_code?: boolean;
  employee_count?: number;
  active_employee_count?: number;
  today_attendance_count?: number;
};

type CompanyStats = {
  id: number;
  name: string;
  invite_code: string;
  is_active: boolean;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  employee_count: number;
  active_employees: number;
  today_attendance: {
    present: number;
    late: number;
    absent: number;
    on_leave: number;
  };
  pending_leaves: number;
  employees: Array<{
    id: string;
    employee_id: string;
    full_name: string;
    email: string;
    department: string;
    designation: string;
    status: string;
    joining_date: string;
  }>;
};

export default function SuperAdminCompaniesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED">("ALL");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState({
    name: "",
    owner_email: "",
    owner_first_name: "",
    owner_last_name: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    owner_email: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.get("/api/v1/organizations/");
      setOrganizations(Array.isArray(response.data) ? response.data : response.data.results || []);
    } catch {
      setError("Failed to load company accounts. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const statsSummary = useMemo(() => {
    const totalCompanies = organizations.length;
    const activeCompanies = organizations.filter((org) => org.is_active).length;
    const suspendedCompanies = totalCompanies - activeCompanies;
    const totalWorkforce = organizations.reduce((acc, org) => acc + (org.employee_count || 0), 0);
    const totalTodayAttendance = organizations.reduce((acc, org) => acc + (org.today_attendance_count || 0), 0);

    return {
      totalCompanies,
      activeCompanies,
      suspendedCompanies,
      totalWorkforce,
      totalTodayAttendance,
    };
  }, [organizations]);

  const filteredOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      const matchesSearch =
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (org.owner_name && org.owner_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (org.owner_email && org.owner_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        org.invite_code.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && org.is_active) ||
        (statusFilter === "SUSPENDED" && !org.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [organizations, searchQuery, statusFilter]);

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setNotice("Onboarding code copied to clipboard.");
  };

  const toggleStatus = async (org: Organization) => {
    setBusyId(org.id);
    setError("");
    try {
      const response = await apiClient.post(`/api/v1/organizations/${org.id}/toggle-status/`);
      setOrganizations((current) => current.map((item) => (item.id === org.id ? response.data : item)));
      setNotice(`Company "${org.name}" status set to ${response.data.is_active ? "Active" : "Suspended"}.`);
    } catch {
      setError(`Failed to toggle status for ${org.name}. Super Admin permission required.`);
    } finally {
      setBusyId(null);
    }
  };

  const regenerateCode = async (org: Organization) => {
    if (!window.confirm(`Regenerate invite code for "${org.name}"? Previous code will immediately expire.`)) return;
    setBusyId(org.id);
    setError("");
    try {
      const response = await apiClient.post(`/api/v1/organizations/${org.id}/regenerate-invite-code/`);
      setOrganizations((current) => current.map((item) => (item.id === org.id ? response.data : item)));
      setNotice(`New invite code for ${org.name}: ${response.data.invite_code}`);
    } catch {
      setError("Failed to regenerate invite code.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await apiClient.post("/api/v1/organizations/", {
        name: createForm.name.trim(),
        owner_email: createForm.owner_email.trim() || undefined,
        owner_first_name: createForm.owner_first_name.trim() || undefined,
        owner_last_name: createForm.owner_last_name.trim() || undefined,
      });

      setOrganizations((current) => [response.data, ...current]);
      setShowCreateModal(false);
      setCreateForm({ name: "", owner_email: "", owner_first_name: "", owner_last_name: "" });
      setNotice(`Company "${response.data.name}" created! Onboarding Code: ${response.data.invite_code}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create company.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditModal = (org: Organization) => {
    setSelectedOrg(org);
    setEditForm({
      name: org.name,
      owner_email: org.owner_email || "",
    });
    setShowEditModal(true);
  };

  const handleEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !editForm.name.trim()) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await apiClient.patch(`/api/v1/organizations/${selectedOrg.id}/`, {
        name: editForm.name.trim(),
        owner_email: editForm.owner_email.trim() || undefined,
      });

      setOrganizations((current) => current.map((item) => (item.id === selectedOrg.id ? response.data : item)));
      setShowEditModal(false);
      setNotice(`Company "${response.data.name}" updated successfully.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to edit company.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetails = async (org: Organization) => {
    setSelectedOrg(org);
    setCompanyStats(null);
    setShowDetailsModal(true);
    setLoadingStats(true);

    try {
      const response = await apiClient.get(`/api/v1/organizations/${org.id}/stats/`);
      setCompanyStats(response.data);
    } catch {
      setError("Failed to fetch detailed statistics for this company.");
    } finally {
      setLoadingStats(false);
    }
  };

  const handleOpenDeleteModal = (org: Organization) => {
    setSelectedOrg(org);
    setShowDeleteModal(true);
  };

  const handleDeleteCompany = async () => {
    if (!selectedOrg) return;

    setSubmitting(true);
    setError("");
    try {
      await apiClient.delete(`/api/v1/organizations/${selectedOrg.id}/`);
      setOrganizations((current) => current.filter((item) => item.id !== selectedOrg.id));
      setShowDeleteModal(false);
      setNotice(`Company "${selectedOrg.name}" deleted.`);
    } catch {
      setError("Failed to delete company.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container fluid className="py-3 px-lg-4 super-admin-companies-page">
      {/* Breadcrumb */}
      <DasherBreadcrumb
        items={[
          { label: "Super Admin", href: "/super-admin/dashboard" },
          { label: "Companies & Workspaces" },
        ]}
      />

      {/* Modern SaaS Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom">
        <div className="d-flex align-items-start gap-3">
          <div className="p-2.5 rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center shadow-xs flex-shrink-0" style={{ width: 44, height: 44 }}>
            <IconBuildingSkyscraper size={24} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <h2 className="h4 mb-0 fw-bold text-dark">Companies &amp; Workspaces</h2>
              <Badge bg="primary-subtle" text="primary" className="px-2.5 py-1 rounded-pill fw-semibold" style={{ fontSize: "11px", letterSpacing: "0.02em" }}>
                Tenant Directory
              </Badge>
            </div>
            <p className="text-secondary mb-0 small">
              Create, inspect, activate, or suspend any tenant company workspace across the AttendStack platform.
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <Button variant="outline-secondary" size="sm" onClick={loadOrganizations} disabled={loading} className="d-inline-flex align-items-center gap-1.5 px-3 py-2 fw-medium shadow-xs">
            <IconRefresh size={16} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="d-inline-flex align-items-center gap-1.5 px-3.5 py-2 fw-semibold shadow-sm text-nowrap"
          >
            <IconPlus size={16} />
            <span>Create New Company</span>
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

      {/* Summary Cards */}
      <Row className="g-3 mb-4">
        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-primary-subtle text-primary">
                <IconBuildingSkyscraper size={26} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Total Companies</span>
                <h3 className="mb-0 fw-bold">{statsSummary.totalCompanies}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-success-subtle text-success">
                <IconUserCheck size={26} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Active Workspaces</span>
                <h3 className="mb-0 fw-bold">{statsSummary.activeCompanies}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-info-subtle text-info">
                <IconUsers size={26} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Total Workforce</span>
                <h3 className="mb-0 fw-bold">{statsSummary.totalWorkforce}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} lg={3}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center gap-3 p-3.5">
              <div className="rounded-3 p-3 bg-warning-subtle text-warning">
                <IconCalendarEvent size={26} />
              </div>
              <div>
                <span className="text-secondary small fw-bold text-uppercase d-block">Today Check-ins</span>
                <h3 className="mb-0 fw-bold">{statsSummary.totalTodayAttendance}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Filter and Search Bar */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={6} lg={7}>
              <InputGroup>
                <InputGroup.Text className="bg-white border-end-0 text-secondary">
                  <IconSearch size={18} />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search by company name, owner email, or invite code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-start-0 ps-0 shadow-none"
                />
              </InputGroup>
            </Col>
            <Col xs={12} md={6} lg={5}>
              <div className="d-flex align-items-center justify-content-md-end gap-2">
                <span className="text-secondary small fw-semibold">Filter:</span>
                <div className="btn-group" role="group">
                  <Button
                    variant={statusFilter === "ALL" ? "primary" : "outline-secondary"}
                    size="sm"
                    onClick={() => setStatusFilter("ALL")}
                  >
                    All ({organizations.length})
                  </Button>
                  <Button
                    variant={statusFilter === "ACTIVE" ? "success" : "outline-secondary"}
                    size="sm"
                    onClick={() => setStatusFilter("ACTIVE")}
                  >
                    Active ({statsSummary.activeCompanies})
                  </Button>
                  <Button
                    variant={statusFilter === "SUSPENDED" ? "danger" : "outline-secondary"}
                    size="sm"
                    onClick={() => setStatusFilter("SUSPENDED")}
                  >
                    Suspended ({statsSummary.suspendedCompanies})
                  </Button>
                </div>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Main Companies Table */}
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="text-secondary mb-0 mt-2">Loading multi-tenant company accounts…</p>
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="text-center py-5 px-3">
              <IconBuildingSkyscraper size={48} className="text-secondary mb-3 opacity-50" />
              <h5 className="fw-bold text-dark mb-1">No companies found</h5>
              <p className="text-secondary small mb-3">
                {searchQuery || statusFilter !== "ALL"
                  ? "No company matches your search or filter."
                  : "No company workspace exists yet."}
              </p>
              <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                <IconPlus size={16} className="me-1" /> Onboard First Company
              </Button>
            </div>
          ) : (
            <Table responsive hover className="align-middle text-nowrap mb-0">
              <thead className="table-light">
                <tr className="text-nowrap">
                  <th className="ps-4">Company Name</th>
                  <th>HR Owner & Contact</th>
                  <th>Invite Code</th>
                  <th>Workforce Size</th>
                  <th>Today Check-ins</th>
                  <th>Status</th>
                  <th>Created Date</th>
                  <th className="text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrganizations.map((org) => (
                  <tr key={org.id} className={!org.is_active ? "table-light text-muted" : ""}>
                    <td className="ps-4">
                      <div className="d-flex align-items-center gap-2.5">
                        <div
                          className={`rounded-circle d-flex align-items-center justify-content-center fw-bold ${
                            org.is_active ? "bg-primary-subtle text-primary" : "bg-secondary-subtle text-secondary"
                          }`}
                          style={{ width: 38, height: 38, fontSize: 16 }}
                        >
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong className="text-dark d-block fs-6 mb-0">{org.name}</strong>
                          <span className="text-secondary small font-monospace">ID: #{org.id}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div>
                        <span className="fw-semibold text-dark d-block">{org.owner_name || "Unassigned"}</span>
                        <small className="text-secondary d-flex align-items-center gap-1">
                          <IconMail size={13} /> {org.owner_email || "No email"}
                        </small>
                      </div>
                    </td>

                    <td>
                      <div className="d-flex align-items-center gap-1.5">
                        <code className="fw-bold fs-6 text-primary bg-primary-subtle px-2 py-1 rounded font-monospace">
                          {org.invite_code}
                        </code>
                        <Button
                          size="sm"
                          variant="light"
                          className="p-1 border shadow-xs"
                          title="Copy Code"
                          onClick={() => copyCode(org.invite_code)}
                        >
                          <IconCopy size={14} className="text-secondary" />
                        </Button>
                      </div>
                    </td>

                    <td>
                      <div className="d-flex align-items-center gap-1.5">
                        <IconUsers size={16} className="text-secondary" />
                        <span className="fw-bold text-dark">{org.employee_count ?? 0}</span>
                        <span className="text-secondary small">({org.active_employee_count ?? 0} active)</span>
                      </div>
                    </td>

                    <td>
                      <Badge bg="info-subtle" text="info" className="border border-info-subtle px-2.5 py-1">
                        {org.today_attendance_count ?? 0} present
                      </Badge>
                    </td>

                    <td>
                      <Badge
                        bg={org.is_active ? "success" : "danger"}
                        className="px-2.5 py-1 rounded-pill"
                      >
                        {org.is_active ? "Active" : "Suspended"}
                      </Badge>
                    </td>

                    <td>
                      <span className="text-secondary small">
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(org.created_at))}
                      </span>
                    </td>

                    <td className="text-end pe-4">
                      <Dropdown align="end">
                        <Dropdown.Toggle as={ActionToggle}>
                          <IconDotsVertical size={16} />
                        </Dropdown.Toggle>
                        <Dropdown.Menu className="shadow border-0">
                          <Dropdown.Item onClick={() => handleOpenDetails(org)}>
                            <IconEye size={15} className="me-2 text-info" /> Inspect Analytics & Details
                          </Dropdown.Item>
                          <Dropdown.Item onClick={() => handleOpenEditModal(org)}>
                            <IconEdit size={15} className="me-2 text-primary" /> Edit Company Details
                          </Dropdown.Item>
                          <Dropdown.Item
                            onClick={() => toggleStatus(org)}
                            disabled={busyId === org.id}
                          >
                            <IconPower size={15} className={`me-2 ${org.is_active ? "text-warning" : "text-success"}`} />
                            {org.is_active ? "Suspend Company" : "Activate Company"}
                          </Dropdown.Item>
                          <Dropdown.Item onClick={() => regenerateCode(org)}>
                            <IconRefresh size={15} className="me-2 text-warning" /> Regenerate Invite Code
                          </Dropdown.Item>
                          <Dropdown.Divider />
                          <Dropdown.Item onClick={() => handleOpenDeleteModal(org)} className="text-danger">
                            <IconTrash size={15} className="me-2" /> Delete Company Tenant
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

      {/* Modal 1: Create New Company Workspace */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconBuildingSkyscraper className="text-primary" size={24} />
            Create New Company Workspace
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateCompany}>
          <Modal.Body className="py-3">
            <p className="text-secondary small mb-3">
              Super Admin can onboard a new company tenant. An HR Administrator account will be generated automatically.
            </p>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Company / Organization Name *</Form.Label>
              <Form.Control
                type="text"
                required
                placeholder="e.g. Acme Tech Solutions Pvt Ltd"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Owner HR Email Address *</Form.Label>
              <Form.Control
                type="email"
                required
                placeholder="hr@acmetech.com"
                value={createForm.owner_email}
                onChange={(e) => setCreateForm({ ...createForm, owner_email: e.target.value })}
              />
            </Form.Group>

            <Row className="g-2">
              <Col xs={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">Owner First Name</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Rahul"
                    value={createForm.owner_first_name}
                    onChange={(e) => setCreateForm({ ...createForm, owner_first_name: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">Owner Last Name</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Sharma"
                    value={createForm.owner_last_name}
                    onChange={(e) => setCreateForm({ ...createForm, owner_last_name: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : "Create Company"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modal 2: Edit Company Details */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconEdit className="text-primary" size={22} />
            Edit Company #{selectedOrg?.id}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleEditCompany}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Organization Name</Form.Label>
              <Form.Control
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Owner Email</Form.Label>
              <Form.Control
                type="email"
                placeholder="Assign owner email"
                value={editForm.owner_email}
                onChange={(e) => setEditForm({ ...editForm, owner_email: e.target.value })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : "Save Changes"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modal 3: Company Detailed Analytics & Employee List */}
      <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconBuildingSkyscraper className="text-primary" size={24} />
            Company Analytics: {selectedOrg?.name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {loadingStats || !companyStats ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="text-secondary mb-0 mt-2">Loading stats for {selectedOrg?.name}…</p>
            </div>
          ) : (
            <div>
              <Row className="g-3 mb-4">
                <Col xs={12} sm={4}>
                  <div className="p-3 border rounded bg-light">
                    <span className="text-secondary small fw-semibold text-uppercase d-block">Owner</span>
                    <strong className="text-dark d-block">{companyStats.owner_name || "Unassigned"}</strong>
                    <small className="text-secondary">{companyStats.owner_email || "No email"}</small>
                  </div>
                </Col>
                <Col xs={12} sm={4}>
                  <div className="p-3 border rounded bg-light">
                    <span className="text-secondary small fw-semibold text-uppercase d-block">Onboarding Code</span>
                    <code className="fs-5 fw-bold text-primary">{companyStats.invite_code}</code>
                    <small className="text-secondary d-block mt-1">Status: {companyStats.is_active ? "Active" : "Suspended"}</small>
                  </div>
                </Col>
                <Col xs={12} sm={4}>
                  <div className="p-3 border rounded bg-light">
                    <span className="text-secondary small fw-semibold text-uppercase d-block">Workforce</span>
                    <h4 className="fw-bold text-dark mb-0">{companyStats.employee_count}</h4>
                    <small className="text-success">{companyStats.active_employees} active</small>
                  </div>
                </Col>
              </Row>

              <h6 className="fw-bold text-dark mb-3">Today's Attendance Status</h6>
              <Row className="g-2 mb-4">
                <Col xs={3}>
                  <div className="p-2.5 text-center bg-success-subtle text-success rounded border border-success-subtle">
                    <span className="small fw-semibold d-block">Present</span>
                    <strong className="fs-4">{companyStats.today_attendance.present}</strong>
                  </div>
                </Col>
                <Col xs={3}>
                  <div className="p-2.5 text-center bg-warning-subtle text-warning rounded border border-warning-subtle">
                    <span className="small fw-semibold d-block">Late</span>
                    <strong className="fs-4">{companyStats.today_attendance.late}</strong>
                  </div>
                </Col>
                <Col xs={3}>
                  <div className="p-2.5 text-center bg-danger-subtle text-danger rounded border border-danger-subtle">
                    <span className="small fw-semibold d-block">Absent</span>
                    <strong className="fs-4">{companyStats.today_attendance.absent}</strong>
                  </div>
                </Col>
                <Col xs={3}>
                  <div className="p-2.5 text-center bg-info-subtle text-info rounded border border-info-subtle">
                    <span className="small fw-semibold d-block">On Leave</span>
                    <strong className="fs-4">{companyStats.today_attendance.on_leave}</strong>
                  </div>
                </Col>
              </Row>

              <h6 className="fw-bold text-dark mb-2">Workforce Preview ({companyStats.employees.length})</h6>
              <div style={{ maxHeight: 220, overflowY: "auto" }} className="border rounded">
                <Table size="sm" responsive hover className="align-middle mb-0">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th>Emp ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Department</th>
                      <th>Designation</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyStats.employees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-3">
                          No employees registered in this company yet.
                        </td>
                      </tr>
                    ) : (
                      companyStats.employees.map((emp) => (
                        <tr key={emp.id}>
                          <td><code>{emp.employee_id}</code></td>
                          <td className="fw-medium">{emp.full_name}</td>
                          <td className="small text-secondary">{emp.email}</td>
                          <td>{emp.department || "-"}</td>
                          <td>{emp.designation || "-"}</td>
                          <td>
                            <Badge bg={emp.status === "ACTIVE" ? "success" : "secondary"}>
                              {emp.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal 4: Delete Confirmation */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold text-danger d-flex align-items-center gap-2">
            <IconAlertTriangle size={24} />
            Confirm Delete Company
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <p className="text-dark mb-2">
            Are you sure you want to permanently delete <strong>"{selectedOrg?.name}"</strong>?
          </p>
          <Alert variant="danger" className="py-2 px-3 small border-0 mb-0">
            <strong>Warning:</strong> This will remove company tenant records from the platform.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteCompany} disabled={submitting}>
            {submitting ? <Spinner size="sm" /> : "Delete Company"}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
