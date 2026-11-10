"use client";

import { useState, useEffect, useCallback } from "react";
import {
  IconReceiptTax,
  IconShieldCheck,
  IconInfoCircle,
  IconDeviceFloppy,
  IconSend,
  IconArrowsShuffle,
  IconCheck,
  IconAlertTriangle,
  IconLock,
  IconCalculator,
} from "@tabler/icons-react";
import {
  Spinner,
  Alert,
  Badge,
  Card,
  Form,
  Button,
  OverlayTrigger,
  Tooltip,
  Row,
  Col,
  ProgressBar,
  Modal,
} from "react-bootstrap";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const API = process.env.NEXT_PUBLIC_API_ENDPOINT;

const authHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(val));

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "warning",
  SUBMITTED: "info",
  VERIFIED: "success",
  LOCKED: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft — You can still edit",
  SUBMITTED: "Submitted — Waiting for admin verification",
  VERIFIED: "Verified by Admin",
  LOCKED: "Locked for this FY",
};

interface DeductionField {
  key: string;
  label: string;
  help: string;
  max?: number;
  section: string;
}

const OLD_REGIME_FIELDS: DeductionField[] = [
  { key: "section_80c", label: "Section 80C", help: "PPF, ELSS, LIC, PF, Tuition fees, etc.", max: 150000, section: "Chapter VI-A" },
  { key: "section_80ccd_1b", label: "Section 80CCD(1B)", help: "Additional NPS contribution", max: 50000, section: "Chapter VI-A" },
  { key: "section_80d_self", label: "Section 80D (Self & Family)", help: "Health insurance premium — self, spouse, children", max: 25000, section: "Chapter VI-A" },
  { key: "section_80d_parents", label: "Section 80D (Parents)", help: "Health insurance premium — parents (₹50K if senior citizen)", max: 50000, section: "Chapter VI-A" },
  { key: "section_80e", label: "Section 80E", help: "Education loan interest (no cap, for 8 years)", section: "Chapter VI-A" },
  { key: "section_80g", label: "Section 80G", help: "Donations to approved charities", section: "Chapter VI-A" },
  { key: "section_80tta", label: "Section 80TTA", help: "Interest on savings account", max: 10000, section: "Chapter VI-A" },
  { key: "hra_claimed", label: "HRA Exemption", help: "House Rent Allowance exemption under Section 10(13A)", section: "Exemptions" },
  { key: "home_loan_interest", label: "Home Loan Interest", help: "Section 24(b) — max ₹2L for self-occupied property", max: 200000, section: "Home Loan" },
  { key: "home_loan_principal", label: "Home Loan Principal", help: "Included within Section 80C limit", section: "Home Loan" },
];

const COMMON_FIELDS: DeductionField[] = [
  { key: "other_income", label: "Other Income", help: "Income from other sources (interest, freelancing, rental, etc.)", section: "Additional" },
  { key: "previous_employer_salary", label: "Previous Employer Salary", help: "Salary earned from previous employer in this FY (if you joined mid-year)", section: "Additional" },
  { key: "previous_employer_tds", label: "Previous Employer TDS", help: "TDS already deducted by previous employer", section: "Additional" },
];

const TaxDeclarationClient = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [declaration, setDeclaration] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Tax comparison
  const [comparison, setComparison] = useState<any>(null);
  const [showComparison, setShowComparison] = useState(false);

  // Tax breakdown preview
  const [taxPreview, setTaxPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchDeclaration = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/tax/declarations/my-declaration/`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to load tax declaration.");
      }
      const data = await res.json();
      setDeclaration(data);

      // Initialize form from existing declaration
      const initial: Record<string, any> = {
        tax_regime: data.tax_regime || "NEW",
      };
      [...OLD_REGIME_FIELDS, ...COMMON_FIELDS].forEach((f) => {
        initial[f.key] = data[f.key] ?? 0;
      });
      setFormData(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeclaration();
  }, [fetchDeclaration]);

  // Fetch tax preview whenever regime changes
  const fetchTaxPreview = useCallback(async () => {
    if (!declaration?.annual_salary || Number(declaration.annual_salary) <= 0) return;
    setLoadingPreview(true);
    try {
      const res = await fetch(`${API}/api/v1/tax/calculator/compute/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          annual_gross: declaration.annual_salary,
          regime: formData.tax_regime || "NEW",
          chapter_via_deductions: formData.tax_regime === "OLD"
            ? String(
                Math.min(Number(formData.section_80c || 0) + Number(formData.home_loan_principal || 0), 150000)
                + Math.min(Number(formData.section_80ccd_1b || 0), 50000)
                + Number(formData.section_80d_self || 0)
                + Number(formData.section_80d_parents || 0)
                + Number(formData.section_80e || 0)
                + Number(formData.section_80g || 0)
                + Math.min(Number(formData.section_80tta || 0), 10000)
              )
            : "0",
          hra_exemption: formData.tax_regime === "OLD" ? String(formData.hra_claimed || 0) : "0",
          other_income: String(formData.other_income || 0),
        }),
      });
      if (res.ok) {
        setTaxPreview(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoadingPreview(false);
    }
  }, [declaration?.annual_salary, formData]);

  useEffect(() => {
    if (declaration) fetchTaxPreview();
  }, [fetchTaxPreview, declaration]);

  // Compare regimes
  const fetchComparison = async () => {
    if (!declaration?.annual_salary) return;
    try {
      const res = await fetch(`${API}/api/v1/tax/calculator/compare-regimes/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          annual_gross: declaration.annual_salary,
          chapter_via_deductions: String(
            Math.min(Number(formData.section_80c || 0) + Number(formData.home_loan_principal || 0), 150000)
            + Math.min(Number(formData.section_80ccd_1b || 0), 50000)
            + Number(formData.section_80d_self || 0)
            + Number(formData.section_80d_parents || 0)
            + Number(formData.section_80e || 0)
            + Number(formData.section_80g || 0)
            + Math.min(Number(formData.section_80tta || 0), 10000)
          ),
          hra_exemption: String(formData.hra_claimed || 0),
          other_income: String(formData.other_income || 0),
        }),
      });
      if (res.ok) {
        setComparison(await res.json());
        setShowComparison(true);
      }
    } catch {
      // silent
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    if (key === "tax_regime") {
      setFormData((prev) => ({ ...prev, [key]: value }));
      return;
    }
    const num = value === "" ? 0 : Number(value);
    if (isNaN(num) || num < 0) return;
    setFormData((prev) => ({ ...prev, [key]: num }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API}/api/v1/tax/declarations/my-declaration/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save.");
      }
      const data = await res.json();
      setDeclaration(data);
      setSuccess("Declaration saved successfully.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    setSuccess("");
    setShowSubmitModal(false);
    try {
      // Save first, then submit
      const saveRes = await fetch(`${API}/api/v1/tax/declarations/my-declaration/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(formData),
      });
      if (!saveRes.ok) throw new Error("Failed to save before submitting.");

      const submitRes = await fetch(`${API}/api/v1/tax/declarations/my-declaration/submit/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!submitRes.ok) {
        const data = await submitRes.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to submit.");
      }
      const data = await submitRes.json();
      setDeclaration(data);
      setSuccess("Declaration submitted for verification! Your HR admin will review it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = declaration?.status === "LOCKED";
  const isSubmitted = declaration?.status === "SUBMITTED";
  const isVerified = declaration?.status === "VERIFIED";
  const canEdit = !isLocked && !isSubmitted && !isVerified;
  const isOldRegime = formData.tax_regime === "OLD";

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" /> <span className="ms-2">Loading your tax declaration...</span>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4">
      <DasherBreadcrumb
        items={[
          { label: "Employee Dashboard", href: "/employee-dashboard" },
          { label: "Tax Declaration" },
        ]}
      />

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="mb-1 d-flex align-items-center gap-2">
            <IconReceiptTax size={24} className="text-primary" />
            Tax Declaration — FY {declaration?.financial_year}
          </h4>
          <p className="text-muted mb-0">
            File your investment declarations to optimize TDS deductions. Your employer will adjust monthly TDS based on this.
          </p>
        </div>
        {declaration?.status && (
          <Badge bg={STATUS_COLORS[declaration.status] || "secondary"} className="px-3 py-2 fs-6">
            {declaration.status === "DRAFT" && <IconInfoCircle size={14} className="me-1" />}
            {declaration.status === "SUBMITTED" && <IconSend size={14} className="me-1" />}
            {declaration.status === "VERIFIED" && <IconCheck size={14} className="me-1" />}
            {declaration.status === "LOCKED" && <IconLock size={14} className="me-1" />}
            {STATUS_LABELS[declaration.status] || declaration.status}
          </Badge>
        )}
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {/* Salary & Regime */}
      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom py-3">
              <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
                <IconShieldCheck size={18} className="text-success" />
                Step 1: Choose Tax Regime
              </h6>
            </Card.Header>
            <Card.Body>
              <Row className="g-3 align-items-center">
                <Col md={4}>
                  <div className="p-3 bg-light rounded-3">
                    <div className="text-muted small">Your Annual CTC</div>
                    <div className="fw-bold fs-4">{formatCurrency(declaration?.annual_salary || 0)}</div>
                  </div>
                </Col>
                <Col md={5}>
                  <Form.Label className="fw-semibold">Tax Regime</Form.Label>
                  <div className="d-flex gap-3">
                    <Form.Check
                      type="radio"
                      id="regime-new"
                      name="tax_regime"
                      label={
                        <span>
                          <strong>New Regime</strong>
                          <div className="text-muted" style={{ fontSize: "12px" }}>Lower rates, no deductions (Default)</div>
                        </span>
                      }
                      checked={formData.tax_regime === "NEW"}
                      onChange={() => handleFieldChange("tax_regime", "NEW")}
                      disabled={!canEdit}
                    />
                    <Form.Check
                      type="radio"
                      id="regime-old"
                      name="tax_regime"
                      label={
                        <span>
                          <strong>Old Regime</strong>
                          <div className="text-muted" style={{ fontSize: "12px" }}>Higher rates, but allows deductions</div>
                        </span>
                      }
                      checked={formData.tax_regime === "OLD"}
                      onChange={() => handleFieldChange("tax_regime", "OLD")}
                      disabled={!canEdit}
                    />
                  </div>
                </Col>
                <Col md={3}>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    className="w-100 mt-3"
                    onClick={fetchComparison}
                  >
                    <IconArrowsShuffle size={16} className="me-1" />
                    Compare Regimes
                  </Button>
                </Col>
              </Row>

              {formData.tax_regime === "NEW" && (
                <Alert variant="info" className="mt-3 mb-0 d-flex align-items-start gap-2">
                  <IconInfoCircle size={18} className="flex-shrink-0 mt-1" />
                  <div>
                    <strong>New Regime selected.</strong> Under the New Tax Regime, most deductions (80C, 80D, HRA, etc.) are not applicable.
                    You still get the Standard Deduction of ₹75,000 automatically. Only &quot;Other Income&quot; and &quot;Previous Employer&quot; fields below apply.
                  </div>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Live Tax Preview */}
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white border-bottom py-3">
              <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
                <IconCalculator size={18} className="text-primary" />
                Tax Preview
              </h6>
            </Card.Header>
            <Card.Body>
              {loadingPreview ? (
                <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
              ) : taxPreview ? (
                <div>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Gross Salary</span>
                    <span className="fw-semibold">{formatCurrency(taxPreview.gross_salary)}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Standard Deduction</span>
                    <span className="text-danger">-{formatCurrency(taxPreview.standard_deduction)}</span>
                  </div>
                  {Number(taxPreview.chapter_via_deductions) > 0 && (
                    <div className="d-flex justify-content-between mb-2">
                      <span className="text-muted">Chapter VI-A</span>
                      <span className="text-danger">-{formatCurrency(taxPreview.chapter_via_deductions)}</span>
                    </div>
                  )}
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Taxable Income</span>
                    <span className="fw-bold">{formatCurrency(taxPreview.taxable_income)}</span>
                  </div>
                  <hr className="my-2" />
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Tax on Slabs</span>
                    <span>{formatCurrency(taxPreview.base_tax)}</span>
                  </div>
                  {Number(taxPreview.rebate_87a) > 0 && (
                    <div className="d-flex justify-content-between mb-2 text-success">
                      <span>87A Rebate</span>
                      <span>-{formatCurrency(taxPreview.rebate_87a)}</span>
                    </div>
                  )}
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Cess (4%)</span>
                    <span>{formatCurrency(taxPreview.cess)}</span>
                  </div>
                  <hr className="my-2" />
                  <div className="d-flex justify-content-between">
                    <span className="fw-bold">Total Annual Tax</span>
                    <span className="fw-bold fs-5 text-primary">{formatCurrency(taxPreview.total_tax)}</span>
                  </div>
                  <div className="d-flex justify-content-between mt-1">
                    <span className="text-muted small">Monthly TDS</span>
                    <span className="fw-semibold">{formatCurrency(Number(taxPreview.total_tax) / 12)}</span>
                  </div>
                  <div className="d-flex justify-content-between mt-1">
                    <span className="text-muted small">Effective Rate</span>
                    <span className="fw-semibold">{taxPreview.effective_rate}%</span>
                  </div>
                </div>
              ) : (
                <div className="text-muted text-center py-3">No preview available</div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Investment Declarations — Old Regime only */}
      {isOldRegime && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Header className="bg-white border-bottom py-3">
            <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
              <IconReceiptTax size={18} className="text-primary" />
              Step 2: Declare Your Investments & Deductions (Old Regime)
            </h6>
          </Card.Header>
          <Card.Body>
            <p className="text-muted small mb-4">
              Enter your planned/actual investments for the financial year. These deductions reduce your taxable income and lower your TDS.
            </p>

            {/* Group by section */}
            {["Chapter VI-A", "Exemptions", "Home Loan"].map((section) => {
              const fields = OLD_REGIME_FIELDS.filter((f) => f.section === section);
              if (fields.length === 0) return null;
              return (
                <div key={section} className="mb-4">
                  <h6 className="text-muted fw-bold small text-uppercase mb-3 pb-1 border-bottom">{section}</h6>
                  <Row className="g-3">
                    {fields.map((field) => (
                      <Col md={6} lg={4} key={field.key}>
                        <Form.Group>
                          <Form.Label className="fw-semibold small d-flex align-items-center gap-1">
                            {field.label}
                            {field.max && (
                              <Badge bg="light" text="muted" className="fw-normal" style={{ fontSize: "10px" }}>
                                Max ₹{field.max.toLocaleString("en-IN")}
                              </Badge>
                            )}
                            <OverlayTrigger
                              placement="top"
                              overlay={<Tooltip>{field.help}</Tooltip>}
                            >
                              <IconInfoCircle size={14} className="text-muted ms-1" style={{ cursor: "help" }} />
                            </OverlayTrigger>
                          </Form.Label>
                          <Form.Control
                            type="number"
                            min={0}
                            max={field.max}
                            value={formData[field.key] || ""}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            disabled={!canEdit}
                            placeholder="0"
                            size="sm"
                          />
                          {field.max && Number(formData[field.key] || 0) > field.max && (
                            <Form.Text className="text-danger">
                              Exceeds maximum limit of ₹{field.max.toLocaleString("en-IN")}
                            </Form.Text>
                          )}
                        </Form.Group>
                      </Col>
                    ))}
                  </Row>
                </div>
              );
            })}
          </Card.Body>
        </Card>
      )}

      {/* Additional Income (both regimes) */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header className="bg-white border-bottom py-3">
          <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
            <IconInfoCircle size={18} className="text-warning" />
            {isOldRegime ? "Step 3" : "Step 2"}: Additional Income & Previous Employment
          </h6>
        </Card.Header>
        <Card.Body>
          <p className="text-muted small mb-3">
            If you have income from other sources or joined mid-year, declare them here so TDS is calculated correctly.
          </p>
          <Row className="g-3">
            {COMMON_FIELDS.map((field) => (
              <Col md={4} key={field.key}>
                <Form.Group>
                  <Form.Label className="fw-semibold small d-flex align-items-center gap-1">
                    {field.label}
                    <OverlayTrigger placement="top" overlay={<Tooltip>{field.help}</Tooltip>}>
                      <IconInfoCircle size={14} className="text-muted ms-1" style={{ cursor: "help" }} />
                    </OverlayTrigger>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    value={formData[field.key] || ""}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    disabled={!canEdit}
                    placeholder="0"
                    size="sm"
                  />
                </Form.Group>
              </Col>
            ))}
          </Row>
        </Card.Body>
      </Card>

      {/* Action Buttons */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
        <div className="text-muted small">
          {isLocked && <span className="text-secondary"><IconLock size={14} className="me-1" />This declaration is locked and cannot be edited.</span>}
          {isSubmitted && <span className="text-info"><IconSend size={14} className="me-1" />Submitted and waiting for admin verification. Contact HR to re-open if you need to make changes.</span>}
          {isVerified && <span className="text-success"><IconCheck size={14} className="me-1" />Verified by admin. Contact HR to re-open if you need to make changes.</span>}
        </div>
        {canEdit && (
          <div className="d-flex gap-2">
            <Button variant="outline-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner animation="border" size="sm" className="me-1" /> : <IconDeviceFloppy size={16} className="me-1" />}
              Save Draft
            </Button>
            <Button variant="primary" onClick={() => setShowSubmitModal(true)} disabled={submitting}>
              <IconSend size={16} className="me-1" />
              Submit Declaration
            </Button>
          </div>
        )}
      </div>

      {/* Submit Confirmation Modal */}
      <Modal show={showSubmitModal} onHide={() => setShowSubmitModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">
            <IconAlertTriangle size={20} className="text-warning me-2" />
            Confirm Submission
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Are you sure you want to submit your tax declaration for <strong>FY {declaration?.financial_year}</strong>?</p>
          <ul className="mb-0">
            <li>Your declaration will be sent to your HR admin for verification.</li>
            <li>You <strong>won&apos;t be able to edit</strong> until the admin re-opens it.</li>
            <li>Your monthly TDS will be recalculated based on this declaration.</li>
          </ul>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowSubmitModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Spinner animation="border" size="sm" className="me-1" /> : <IconSend size={16} className="me-1" />}
            Yes, Submit
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Regime Comparison Modal */}
      <Modal show={showComparison} onHide={() => setShowComparison(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">
            <IconArrowsShuffle size={20} className="text-primary me-2" />
            Tax Regime Comparison — FY {declaration?.financial_year}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {comparison ? (
            <div>
              <Row className="g-3 mb-3">
                <Col md={6}>
                  <Card className={`h-100 ${comparison.recommended === "NEW" ? "border-success border-2" : ""}`}>
                    <Card.Header className="bg-primary bg-opacity-10 text-center py-3">
                      <h6 className="mb-0 fw-bold">New Tax Regime</h6>
                      {comparison.recommended === "NEW" && (
                        <Badge bg="success" className="mt-1">Recommended for you</Badge>
                      )}
                    </Card.Header>
                    <Card.Body className="text-center">
                      <div className="text-muted small">Taxable Income</div>
                      <div className="fw-bold fs-5 mb-2">{formatCurrency(comparison.new_regime.taxable_income)}</div>
                      <div className="text-muted small">Total Tax</div>
                      <div className="fw-bold fs-3 text-primary">{formatCurrency(comparison.new_regime.total_tax)}</div>
                      <div className="text-muted small mt-1">Effective Rate: {comparison.new_regime.effective_rate}%</div>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className={`h-100 ${comparison.recommended === "OLD" ? "border-success border-2" : ""}`}>
                    <Card.Header className="bg-warning bg-opacity-10 text-center py-3">
                      <h6 className="mb-0 fw-bold">Old Tax Regime</h6>
                      {comparison.recommended === "OLD" && (
                        <Badge bg="success" className="mt-1">Recommended for you</Badge>
                      )}
                    </Card.Header>
                    <Card.Body className="text-center">
                      <div className="text-muted small">Taxable Income</div>
                      <div className="fw-bold fs-5 mb-2">{formatCurrency(comparison.old_regime.taxable_income)}</div>
                      <div className="text-muted small">Total Tax</div>
                      <div className="fw-bold fs-3 text-primary">{formatCurrency(comparison.old_regime.total_tax)}</div>
                      <div className="text-muted small mt-1">Effective Rate: {comparison.old_regime.effective_rate}%</div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {(Number(comparison.savings_with_new) > 0 || Number(comparison.savings_with_old) > 0) && (
                <Alert variant="success" className="text-center mb-0">
                  <strong>
                    You save {formatCurrency(Math.max(Number(comparison.savings_with_new), Number(comparison.savings_with_old)))} per year
                  </strong>{" "}
                  with the <strong>{comparison.recommended} Regime</strong> based on your current declarations.
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center py-3"><Spinner animation="border" /></div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowComparison(false)}>Close</Button>
          {comparison && formData.tax_regime !== comparison.recommended && canEdit && (
            <Button
              variant="success"
              onClick={() => {
                setFormData((prev) => ({ ...prev, tax_regime: comparison.recommended }));
                setShowComparison(false);
              }}
            >
              Switch to {comparison.recommended === "NEW" ? "New" : "Old"} Regime
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default TaxDeclarationClient;
