"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  Col,
  Row,
  Button,
  Badge,
  Spinner,
  Table,
  Modal,
  Form,
  InputGroup,
} from "react-bootstrap";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconStar,
  IconCreditCard,
  IconShieldLock,
  IconRefresh,
  IconBuildingSkyscraper,
  IconUsers,
  IconChecklist,
} from "@tabler/icons-react";
import Swal from "sweetalert2";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

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

interface PlanItem {
  id?: number;
  name: string;
  slug: string;
  description: string;
  monthly_price: number | string;
  yearly_price: number | string;
  max_employees: number;
  badge_text: string;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
  allows_employees: boolean;
  allows_attendance: boolean;
  allows_geofencing: boolean;
  allows_holidays: boolean;
  allows_payroll_reports: boolean;
  allows_leaves: boolean;
  allows_projects_tasks: boolean;
  allows_chat: boolean;
  allows_custom_shifts: boolean;
  allows_auto_checkout: boolean;
  allows_dedicated_api: boolean;
  allows_simplyjob_sync: boolean;
  features_list: string[];
}

const emptyPlan: PlanItem = {
  name: "",
  slug: "",
  description: "",
  monthly_price: 499,
  yearly_price: 4990,
  max_employees: 50,
  badge_text: "",
  is_popular: false,
  is_active: true,
  sort_order: 1,
  allows_employees: true,
  allows_attendance: true,
  allows_geofencing: false,
  allows_holidays: true,
  allows_payroll_reports: false,
  allows_leaves: true,
  allows_projects_tasks: false,
  allows_chat: false,
  allows_custom_shifts: false,
  allows_auto_checkout: false,
  allows_dedicated_api: false,
  allows_simplyjob_sync: true,
  features_list: [
    "Real-Time Clock In / Out Feed",
    "SimplyJob 1-Click Candidate Invites",
    "Standard Leave Management",
  ],
};

export default function SuperAdminPlansPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null);
  const [formData, setFormData] = useState<PlanItem>(emptyPlan);
  const [newFeatureInput, setNewFeatureInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/plans/`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setPlans(list);
      }
    } catch (err) {
      console.error("Failed to fetch plans", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      ...emptyPlan,
      sort_order: plans.length + 1,
    });
    setNewFeatureInput("");
    setShowModal(true);
  };

  const openEditModal = (plan: PlanItem) => {
    setEditingPlan(plan);
    setFormData({
      ...plan,
      features_list: Array.isArray(plan.features_list) ? [...plan.features_list] : [],
    });
    setNewFeatureInput("");
    setShowModal(true);
  };

  const handleAddFeature = () => {
    const trimmed = newFeatureInput.trim();
    if (!trimmed) return;
    setFormData((prev) => ({
      ...prev,
      features_list: [...prev.features_list, trimmed],
    }));
    setNewFeatureInput("");
  };

  const handleRemoveFeature = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      features_list: prev.features_list.filter((_, i) => i !== index),
    }));
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire("Validation Error", "Plan name is required.", "warning");
      return;
    }

    const slug =
      formData.slug.trim() ||
      formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const payload = {
      ...formData,
      slug,
      monthly_price: Number(formData.monthly_price) || 0,
      yearly_price: Number(formData.yearly_price) || 0,
      max_employees: Number(formData.max_employees) || 50,
      sort_order: Number(formData.sort_order) || 0,
    };

    setIsSaving(true);
    try {
      const url = editingPlan?.id ? `${BASE_URL}/plans/${editingPlan.id}/` : `${BASE_URL}/plans/`;
      const method = editingPlan?.id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(JSON.stringify(errData) || "Failed to save plan.");
      }

      Swal.fire({
        icon: "success",
        title: editingPlan ? "Plan Updated!" : "Plan Created!",
        text: `Plan "${payload.name}" has been saved successfully.`,
        timer: 2000,
        showConfirmButton: false,
      });

      setShowModal(false);
      fetchPlans();
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error Saving Plan",
        text: err.message || "Failed to save plan. Ensure the slug is unique.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlan = async (plan: PlanItem) => {
    if (!plan.id) return;
    const result = await Swal.fire({
      title: `Delete ${plan.name}?`,
      text: "This action cannot be undone. Companies subscribed to this tier may need re-assignment.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete Plan",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${BASE_URL}/plans/${plan.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete plan.");

      Swal.fire({
        icon: "success",
        title: "Deleted",
        text: `Plan "${plan.name}" has been removed.`,
        timer: 2000,
        showConfirmButton: false,
      });
      fetchPlans();
    } catch (err: any) {
      Swal.fire("Error", err.message || "Could not delete plan.", "error");
    }
  };

  const handleSeedDefaults = async () => {
    const result = await Swal.fire({
      title: "Reset to Default Plans?",
      text: "This will recreate the standard Starter, Growth Pro, and Enterprise tiers with default features.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#4f46e5",
      confirmButtonText: "Yes, Seed Defaults",
    });
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${BASE_URL}/plans/seed-defaults/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to seed default plans.");
      Swal.fire("Success", "Default plans restored successfully.", "success");
      fetchPlans();
    } catch (err: any) {
      Swal.fire("Error", err.message, "error");
    }
  };

  return (
    <div className="py-3 px-lg-4">
      {/* Breadcrumb */}
      <DasherBreadcrumb
        items={[
          { label: "Super Admin", href: "/super-admin/dashboard" },
          { label: "Subscription Plans" },
        ]}
      />

      {/* Modern SaaS Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom">
        <div className="d-flex align-items-start gap-3">
          <div className="p-2.5 rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center shadow-xs flex-shrink-0" style={{ width: 44, height: 44 }}>
            <IconCreditCard size={24} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <h2 className="h4 mb-0 fw-bold text-dark">Subscription Plans &amp; Tiers</h2>
              <Badge bg="primary-subtle" text="primary" className="px-2.5 py-1 rounded-pill fw-semibold" style={{ fontSize: "11px", letterSpacing: "0.02em" }}>
                Pricing Architecture
              </Badge>
            </div>
            <p className="text-secondary mb-0 small">
              Configure public AttendStack subscription plans, seat capacity thresholds, and granular feature flags.
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleSeedDefaults}
            className="d-inline-flex align-items-center gap-1.5 px-3 py-2 fw-medium shadow-xs"
          >
            <IconRefresh size={16} />
            <span>Restore Defaults</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            className="d-inline-flex align-items-center gap-1.5 px-3.5 py-2 fw-semibold shadow-sm text-nowrap"
          >
            <IconPlus size={16} />
            <span>Create New Plan</span>
          </Button>
        </div>
      </div>

      {/* ── Overview Metrics ── */}
      <Row className="g-3 mb-4">
        <Col md={4}>
          <Card className="border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-bold text-uppercase">Total Configured Plans</span>
                <h3 className="fw-bold text-dark mb-0 mt-1">{plans.length}</h3>
              </div>
              <div className="bg-primary-subtle text-primary p-3 rounded-circle">
                <IconCreditCard size={24} />
              </div>
            </div>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-bold text-uppercase">Active Public Tiers</span>
                <h3 className="fw-bold text-success mb-0 mt-1">
                  {plans.filter((p) => p.is_active).length}
                </h3>
              </div>
              <div className="bg-success-subtle text-success p-3 rounded-circle">
                <IconCheck size={24} />
              </div>
            </div>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary small fw-bold text-uppercase">Featured Popular Tiers</span>
                <h3 className="fw-bold text-primary mb-0 mt-1">
                  {plans.filter((p) => p.is_popular).length}
                </h3>
              </div>
              <div className="bg-warning-subtle text-warning p-3 rounded-circle">
                <IconStar size={24} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Plans Table ── */}
      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Header className="bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
          <h5 className="fw-bold mb-0 text-dark">Platform Plans List</h5>
          <Badge bg="secondary" className="px-2.5 py-1 rounded-pill">
            {plans.length} Tiers
          </Badge>
        </Card.Header>

        {isLoading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-5">
            <IconCreditCard size={48} className="text-muted mb-3" />
            <h5 className="text-dark">No Plans Configured</h5>
            <p className="text-secondary small mb-3">Click below to restore the standard default plans or add a new one.</p>
            <Button variant="primary" size="sm" onClick={handleSeedDefaults}>
              Restore Default Plans
            </Button>
          </div>
        ) : (
          <div className="table-responsive">
            <Table className="align-middle mb-0" hover>
              <thead className="table-light">
                <tr>
                  <th className="py-3 ps-4">Order</th>
                  <th className="py-3">Plan Name & Slug</th>
                  <th className="py-3">Monthly Price</th>
                  <th className="py-3">Yearly Price</th>
                  <th className="py-3">Capacity Limit</th>
                  <th className="py-3">Enabled Capabilities</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="ps-4 fw-bold text-muted">#{p.sort_order}</td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <strong className="text-dark">{p.name}</strong>
                        {p.badge_text && (
                          <Badge bg={p.is_popular ? "primary" : "secondary"} className="rounded-pill">
                            {p.badge_text}
                          </Badge>
                        )}
                      </div>
                      <small className="text-muted font-monospace">{p.slug}</small>
                    </td>
                    <td>
                      <strong className="text-primary">₹{p.monthly_price}</strong>
                      <small className="text-muted"> / mo</small>
                    </td>
                    <td>
                      <strong className="text-success">₹{p.yearly_price}</strong>
                      <small className="text-muted"> / yr</small>
                    </td>
                    <td>
                      <span className="fw-semibold">
                        {p.max_employees === -1 ? "Unlimited" : `${p.max_employees} Seats`}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1" style={{ maxWidth: "280px" }}>
                        {p.allows_geofencing && <Badge bg="light" text="dark" className="border">Geofencing</Badge>}
                        {p.allows_payroll_reports && <Badge bg="light" text="dark" className="border">Payroll CSV</Badge>}
                        {p.allows_auto_checkout && <Badge bg="light" text="dark" className="border">Auto-Checkout</Badge>}
                        {p.allows_dedicated_api && <Badge bg="light" text="dark" className="border">API & Webhooks</Badge>}
                        {p.allows_simplyjob_sync && <Badge bg="light" text="primary" className="border border-primary-subtle">SimplyJob Sync</Badge>}
                      </div>
                    </td>
                    <td>
                      <Badge bg={p.is_active ? "success" : "danger"} className="rounded-pill">
                        {p.is_active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </td>
                    <td className="text-end pe-4">
                      <div className="d-inline-flex gap-1.5">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className="px-2 py-1"
                          onClick={() => openEditModal(p)}
                          title="Edit Plan"
                        >
                          <IconEdit size={16} />
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          className="px-2 py-1"
                          onClick={() => handleDeletePlan(p)}
                          title="Delete Plan"
                        >
                          <IconTrash size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* ── Create / Edit Modal ── */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
        <Form onSubmit={handleSavePlan}>
          <Modal.Header closeButton className="bg-primary text-white py-3 border-0">
            <Modal.Title className="fw-bold d-flex align-items-center gap-2 text-white">
              <IconCreditCard size={22} />
              {editingPlan ? `Edit Plan: ${editingPlan.name}` : "Create New Subscription Plan"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-4">
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Group controlId="planName">
                  <Form.Label className="fw-semibold small">Plan Title *</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Growth Pro Plan"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="planSlug">
                  <Form.Label className="fw-semibold small">Plan Slug (Unique Key)</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. growth-pro"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group controlId="planDesc" className="mb-3">
              <Form.Label className="fw-semibold small">Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="Brief value proposition shown on pricing cards..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Form.Group>

            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group controlId="monthlyPrice">
                  <Form.Label className="fw-semibold small">Monthly Price (₹)</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.monthly_price}
                    onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="yearlyPrice">
                  <Form.Label className="fw-semibold small">Annual Price (₹)</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.yearly_price}
                    onChange={(e) => setFormData({ ...formData, yearly_price: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="maxEmployees">
                  <Form.Label className="fw-semibold small">Max Seats (-1 = Unlimited)</Form.Label>
                  <Form.Control
                    type="number"
                    value={formData.max_employees}
                    onChange={(e) => setFormData({ ...formData, max_employees: Number(e.target.value) })}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Group controlId="badgeText">
                  <Form.Label className="fw-semibold small">Badge Text (Optional)</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. RECOMMENDED"
                    value={formData.badge_text}
                    onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="sortOrder">
                  <Form.Label className="fw-semibold small">Display Sort Order</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  />
                </Form.Group>
              </Col>
              <Col md={4} className="d-flex align-items-center pt-3">
                <Form.Check
                  type="switch"
                  id="isPopularSwitch"
                  label="Highlight as Popular"
                  className="fw-semibold small"
                  checked={formData.is_popular}
                  onChange={(e) => setFormData({ ...formData, is_popular: e.target.checked })}
                />
              </Col>
            </Row>

            <div className="bg-light p-3 rounded-3 border mb-3">
              <h6 className="fw-bold text-dark mb-1 d-flex align-items-center gap-1.5">
                <IconChecklist size={18} className="text-primary" />
                AttendStack Sidebar Module Access Permissions
              </h6>
              <p className="text-muted small mb-3">
                Enable or disable specific dashboard navigation modules and capabilities for this tier.
              </p>

              {/* Group 1: HR & Core Attendance */}
              <div className="mb-3 bg-white p-2.5 rounded-2 border">
                <span className="text-uppercase text-secondary fw-bold small d-block mb-2" style={{ fontSize: "11px", letterSpacing: "0.05em" }}>
                  HR &amp; Core Attendance Modules
                </span>
                <Row className="g-2">
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featEmployees"
                      label="Employees Directory & Profiles"
                      checked={formData.allows_employees}
                      onChange={(e) => setFormData({ ...formData, allows_employees: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featAttendance"
                      label="Daily Attendance & Live Punches"
                      checked={formData.allows_attendance}
                      onChange={(e) => setFormData({ ...formData, allows_attendance: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featGeofence"
                      label="Office IP Shield & GPS Geofencing"
                      checked={formData.allows_geofencing}
                      onChange={(e) => setFormData({ ...formData, allows_geofencing: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featHolidays"
                      label="Holiday Calendar Management"
                      checked={formData.allows_holidays}
                      onChange={(e) => setFormData({ ...formData, allows_holidays: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featLeaves"
                      label="Leave Requests & Approval Workflow"
                      checked={formData.allows_leaves}
                      onChange={(e) => setFormData({ ...formData, allows_leaves: e.target.checked })}
                    />
                  </Col>
                </Row>
              </div>

              {/* Group 2: Payroll & Collaboration */}
              <div className="mb-3 bg-white p-2.5 rounded-2 border">
                <span className="text-uppercase text-secondary fw-bold small d-block mb-2" style={{ fontSize: "11px", letterSpacing: "0.05em" }}>
                  Payroll, Tasks &amp; Team Collaboration
                </span>
                <Row className="g-2">
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featPayroll"
                      label="Salary & Payroll Processing (Payslips/Reports)"
                      checked={formData.allows_payroll_reports}
                      onChange={(e) => setFormData({ ...formData, allows_payroll_reports: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featTasks"
                      label="Projects & Tasks Workspace"
                      checked={formData.allows_projects_tasks}
                      onChange={(e) => setFormData({ ...formData, allows_projects_tasks: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featChat"
                      label="Team Chat & Direct Messaging (Beta)"
                      checked={formData.allows_chat}
                      onChange={(e) => setFormData({ ...formData, allows_chat: e.target.checked })}
                    />
                  </Col>
                </Row>
              </div>

              {/* Group 3: Automation & Integrations */}
              <div className="bg-white p-2.5 rounded-2 border">
                <span className="text-uppercase text-secondary fw-bold small d-block mb-2" style={{ fontSize: "11px", letterSpacing: "0.05em" }}>
                  Automation, APIs &amp; Integrations
                </span>
                <Row className="g-2">
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featCheckout"
                      label="Auto-Checkout & Shift Rulebooks"
                      checked={formData.allows_auto_checkout}
                      onChange={(e) => setFormData({ ...formData, allows_auto_checkout: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featShifts"
                      label="Multi-Shift & Late Cutoff Rules"
                      checked={formData.allows_custom_shifts}
                      onChange={(e) => setFormData({ ...formData, allows_custom_shifts: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featApi"
                      label="Dedicated API Key & Webhooks"
                      checked={formData.allows_dedicated_api}
                      onChange={(e) => setFormData({ ...formData, allows_dedicated_api: e.target.checked })}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Check
                      type="checkbox"
                      id="featSimplyJob"
                      label="SimplyJob Candidate Sync Engine"
                      checked={formData.allows_simplyjob_sync}
                      onChange={(e) => setFormData({ ...formData, allows_simplyjob_sync: e.target.checked })}
                    />
                  </Col>
                </Row>
              </div>
            </div>

            {/* Custom Feature Bullets */}
            <div>
              <h6 className="fw-bold text-dark mb-2">Display Feature Checklist Bullets</h6>
              <InputGroup className="mb-2">
                <Form.Control
                  placeholder="e.g. 24/7 Dedicated Account Manager"
                  value={newFeatureInput}
                  onChange={(e) => setNewFeatureInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddFeature();
                    }
                  }}
                />
                <Button variant="primary" onClick={handleAddFeature}>
                  <IconPlus size={16} /> Add Bullet
                </Button>
              </InputGroup>

              <div className="d-flex flex-column gap-1.5">
                {formData.features_list.map((feat, i) => (
                  <div
                    key={i}
                    className="d-flex align-items-center justify-content-between bg-white border p-2 rounded small"
                  >
                    <div className="d-flex align-items-center gap-2">
                      <IconCheck size={16} className="text-success" />
                      <span>{feat}</span>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-danger p-0 text-decoration-none"
                      onClick={() => handleRemoveFeature(i)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer className="border-0 pt-0 pb-3 pe-4">
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSaving} className="fw-bold px-4">
              {isSaving ? (
                <>
                  <Spinner size="sm" className="me-1" /> Saving...
                </>
              ) : (
                "Save & Publish Plan"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
