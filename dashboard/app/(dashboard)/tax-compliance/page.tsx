"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import {
  IconReceiptTax,
  IconShieldCheck,
  IconAlertTriangle,
  IconFileInvoice,
  IconUsers,
  IconCurrencyRupee,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconUser,
  IconArrowRight,
  IconBuildingBank,
  IconCheck,
  IconClock,
  IconFileText,
  IconDownload,
  IconSend,
} from "@tabler/icons-react";
import { Spinner, Alert, Badge, Table, Card, Form, OverlayTrigger, Tooltip, ProgressBar, Button, Modal } from "react-bootstrap";
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

const monthNames = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentFY = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
};

interface ComplianceSummary {
  financial_year: string;
  tan_number: string;
  total_tds_liability: string;
  total_tds_deposited: string;
  outstanding: string;
  pending_challans: number;
  returns_filed: number;
  returns_total: number;
  employees_covered: number;
}

interface MonthlyTDSRecord {
  id: number;
  employee: number;
  employee_name?: string;
  month: number;
  year: number;
  financial_year: string;
  tds_this_month: string;
  epf_employee: string;
  epf_employer: string;
  esi_employee: string;
  esi_employer: string;
  professional_tax: string;
  total_statutory_deduction: string;
  estimated_annual_income: string;
  estimated_annual_tax: string;
}

interface CompanyConfig {
  id: number;
  tan_number: string;
  default_tax_regime: string;
  epf_enabled: boolean;
  esi_enabled: boolean;
  professional_tax_enabled: boolean;
  epf_employer_rate: string;
  epf_employee_rate: string;
}

interface TaxDeclaration {
  id: number;
  employee: number;
  employee_name?: string;
  financial_year: string;
  tax_regime: string;
  status: string;
  section_80c: string;
  section_80d_self: string;
  section_80d_parents: string;
  hra_claimed: string;
}

const TaxCompliancePage = () => {
  const [fy, setFy] = useState(currentFY());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyTDSRecord[]>([]);
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [declarations, setDeclarations] = useState<TaxDeclaration[]>([]);

  const [expandedSection, setExpandedSection] = useState<string | null>("summary");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [employeeBreakdown, setEmployeeBreakdown] = useState<any>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [payTdsExpandedEmp, setPayTdsExpandedEmp] = useState<string | null>(null);

  // TDS Deposit Pipeline
  const [timeline, setTimeline] = useState<any>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [generatingChallan, setGeneratingChallan] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentChallan, setPaymentChallan] = useState<any>(null);
  const [paymentChallanDetails, setPaymentChallanDetails] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState({ cin: "", bsr_code: "", challan_serial: "", payment_date: "", payment_mode: "Net Banking" });
  const [savingPayment, setSavingPayment] = useState(false);

  // 24Q / Form 16
  const [show24QModal, setShow24QModal] = useState(false);
  const [data24Q, setData24Q] = useState<any>(null);
  const [loading24Q, setLoading24Q] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState("Q3");
  const [showForm16Modal, setShowForm16Modal] = useState(false);
  const [form16Data, setForm16Data] = useState<any>(null);
  const [loadingForm16, setLoadingForm16] = useState(false);
  const [form16EmpId, setForm16EmpId] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, tdsRes, configRes, declRes] = await Promise.all([
        fetch(`${API}/api/v1/tax/calculator/compliance-summary/?financial_year=${fy}`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/tax/monthly-tds/?financial_year=${fy}`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/tax/config/`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/tax/declarations/?financial_year=${fy}`, { headers: authHeaders() }),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }

      if (tdsRes.ok) {
        const data = await tdsRes.json();
        setMonthlyRecords(Array.isArray(data) ? data : data.results || []);
      }

      if (configRes.ok) {
        const data = await configRes.json();
        const configs = Array.isArray(data) ? data : data.results || [];
        setConfig(configs.length > 0 ? configs[0] : null);
      }

      if (declRes.ok) {
        const data = await declRes.json();
        setDeclarations(Array.isArray(data) ? data : data.results || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tax data.");
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleEmployeeClick = async (empId: string) => {
    if (selectedEmployee === empId) {
      setSelectedEmployee(null);
      setEmployeeBreakdown(null);
      return;
    }
    setSelectedEmployee(empId);
    setLoadingBreakdown(true);
    try {
      const now = new Date();
      const res = await fetch(
        `${API}/api/v1/tax/calculator/employee-tax-breakdown/?employee_id=${empId}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        setEmployeeBreakdown(await res.json());
      }
    } catch (err) {
      console.error("Failed to load employee breakdown:", err);
    } finally {
      setLoadingBreakdown(false);
    }
  };

  // Fetch compliance timeline
  const fetchTimeline = useCallback(async () => {
    setLoadingTimeline(true);
    try {
      const res = await fetch(`${API}/api/v1/tax/challans/timeline/?financial_year=${fy}`, { headers: authHeaders() });
      if (res.ok) setTimeline(await res.json());
    } catch { /* silent */ } finally {
      setLoadingTimeline(false);
    }
  }, [fy]);

  useEffect(() => {
    if (expandedSection === "pipeline") fetchTimeline();
  }, [expandedSection, fetchTimeline]);

  const handleGenerateChallan = async (month: number, year: number) => {
    setGeneratingChallan(`${month}-${year}`);
    try {
      const res = await fetch(`${API}/api/v1/tax/challans/generate-for-month/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ month, year }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchTimeline();
        fetchAll();
        openPaymentModal(data.challan?.id, {
          month, year,
          total_tds: data.challan?.total_tds_amount,
          employees: data.employee_breakdown || [],
          tan: config?.tan_number || "",
        });
      } else if (res.status === 409) {
        fetchTimeline();
        fetchAll();
        openPaymentModal(data.challan?.id, {
          month, year,
          total_tds: data.challan?.total_tds_amount,
          employees: [],
          tan: config?.tan_number || "",
        });
      } else {
        alert(data.detail || "Failed to generate challan.");
      }
    } catch { alert("Network error."); } finally {
      setGeneratingChallan(null);
    }
  };

  const openPaymentModal = (challanId: number, details?: any) => {
    setPaymentChallan(challanId);
    setPaymentChallanDetails(details || null);
    setPaymentForm({ cin: "", bsr_code: "", challan_serial: "", payment_date: "", payment_mode: "Net Banking" });
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.cin || !paymentForm.payment_date) {
      alert("CIN and Payment Date are required.");
      return;
    }
    setSavingPayment(true);
    try {
      const res = await fetch(`${API}/api/v1/tax/challans/${paymentChallan}/mark-paid/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(paymentForm),
      });
      if (res.ok) {
        setShowPaymentModal(false);
        fetchTimeline();
        fetchAll();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || "Failed to record payment.");
      }
    } catch { alert("Network error."); } finally {
      setSavingPayment(false);
    }
  };

  const fetch24QData = async (quarter: string) => {
    setLoading24Q(true);
    setData24Q(null);
    try {
      const res = await fetch(`${API}/api/v1/tax/returns/generate-24q-data/?financial_year=${fy}&quarter=${quarter}`, { headers: authHeaders() });
      if (res.ok) setData24Q(await res.json());
    } catch { /* silent */ } finally {
      setLoading24Q(false);
    }
  };

  const fetchForm16 = async (empId: string) => {
    setLoadingForm16(true);
    setForm16Data(null);
    try {
      const res = await fetch(`${API}/api/v1/tax/returns/generate-form16/?financial_year=${fy}&employee_id=${empId}`, { headers: authHeaders() });
      if (res.ok) setForm16Data(await res.json());
      else {
        const d = await res.json().catch(() => ({}));
        alert(d.detail || "Failed to generate Form 16.");
      }
    } catch { /* silent */ } finally {
      setLoadingForm16(false);
    }
  };

  const employeeTotals = monthlyRecords.reduce<Record<string, {
    name: string; tds: number; epf: number; esi: number; pt: number; total: number;
    annualTax: number; annualIncome: number;
    months: { month: number; year: number; tds: number; epf: number; esi: number; pt: number; total: number }[];
  }>>((acc, r) => {
    const key = String(r.employee);
    if (!acc[key]) {
      acc[key] = {
        name: r.employee_name || `Employee #${r.employee}`,
        tds: 0, epf: 0, esi: 0, pt: 0, total: 0,
        annualTax: 0, annualIncome: 0, months: [],
      };
    }
    acc[key].tds += Number(r.tds_this_month || 0);
    acc[key].epf += Number(r.epf_employee || 0);
    acc[key].esi += Number(r.esi_employee || 0);
    acc[key].pt += Number(r.professional_tax || 0);
    acc[key].total += Number(r.total_statutory_deduction || 0);
    acc[key].annualTax = Math.max(acc[key].annualTax, Number(r.estimated_annual_tax || 0));
    acc[key].annualIncome = Math.max(acc[key].annualIncome, Number(r.estimated_annual_income || 0));
    acc[key].months.push({
      month: r.month, year: r.year,
      tds: Number(r.tds_this_month || 0),
      epf: Number(r.epf_employee || 0),
      esi: Number(r.esi_employee || 0),
      pt: Number(r.professional_tax || 0),
      total: Number(r.total_statutory_deduction || 0),
    });
    return acc;
  }, {});

  const monthlyTotals = monthlyRecords.reduce<Record<string, { tds: number; epf: number; pt: number; esi: number; total: number; count: number }>>((acc, r) => {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!acc[key]) {
      acc[key] = { tds: 0, epf: 0, pt: 0, esi: 0, total: 0, count: 0 };
    }
    acc[key].tds += Number(r.tds_this_month || 0);
    acc[key].epf += Number(r.epf_employee || 0);
    acc[key].pt += Number(r.professional_tax || 0);
    acc[key].esi += Number(r.esi_employee || 0);
    acc[key].total += Number(r.total_statutory_deduction || 0);
    acc[key].count += 1;
    return acc;
  }, {});

  const sortedMonths = Object.keys(monthlyTotals).sort();

  if (loading) {
    return (
      <Fragment>
        <DasherBreadcrumb />
        <div className="d-flex justify-content-center align-items-center py-6" style={{ minHeight: "60vh" }}>
          <Spinner animation="border" variant="primary" />
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <style>{`
        .tax-compliance-tables .table-hover > tbody > tr:hover > * {
          --bs-table-hover-bg: transparent !important;
          --bs-table-accent-bg: transparent !important;
          --bs-table-bg-state: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
        }
        .tax-compliance-tables .table-hover > tbody > tr:hover {
          background-color: rgba(13, 110, 253, 0.06) !important;
        }
        .tax-compliance-tables .table-hover > tbody > tr:hover > td,
        .tax-compliance-tables .table-hover > tbody > tr:hover > th {
          background-color: inherit !important;
          color: inherit;
        }
        .tax-compliance-tables .table-hover > tbody > tr.table-danger:hover {
          background-color: rgba(220, 53, 69, 0.12) !important;
        }
      `}</style>
      <DasherBreadcrumb />
      <div className="tax-compliance-tables">

      {/* Header */}
      <div className="mb-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <IconReceiptTax size={28} className="text-primary" />
            Tax & Compliance
          </h2>
          <p className="text-secondary mb-0">
            TDS, EPF, ESI, and Professional Tax compliance dashboard for your organization.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Form.Label className="mb-0 text-muted small fw-semibold">Financial Year:</Form.Label>
          <Form.Select
            size="sm"
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            style={{ width: "160px" }}
          >
            <option value="2026-27">FY 2026-27</option>
            <option value="2025-26">FY 2025-26</option>
            <option value="2024-25">FY 2024-25</option>
          </Form.Select>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-start gap-3">
              <div className="rounded-3 p-2 bg-primary bg-opacity-10">
                <IconCurrencyRupee size={24} className="text-primary" />
              </div>
              <div>
                <div className="text-muted small">Total TDS Liability</div>
                <div className="fw-bold fs-5">{formatCurrency(summary?.total_tds_liability || 0)}</div>
              </div>
            </Card.Body>
          </Card>
        </div>
        <div className="col-md-3">
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-start gap-3">
              <div className="rounded-3 p-2 bg-success bg-opacity-10">
                <IconShieldCheck size={24} className="text-success" />
              </div>
              <div>
                <div className="text-muted small">TDS Deposited</div>
                <div className="fw-bold fs-5 text-success">{formatCurrency(summary?.total_tds_deposited || 0)}</div>
              </div>
            </Card.Body>
          </Card>
        </div>
        <div className="col-md-3">
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-start gap-3">
              <div className={`rounded-3 p-2 ${Number(summary?.outstanding || 0) > 0 ? "bg-danger bg-opacity-10" : "bg-success bg-opacity-10"}`}>
                <IconAlertTriangle size={24} className={Number(summary?.outstanding || 0) > 0 ? "text-danger" : "text-success"} />
              </div>
              <div>
                <div className="text-muted small">Outstanding</div>
                <div className={`fw-bold fs-5 ${Number(summary?.outstanding || 0) > 0 ? "text-danger" : "text-success"}`}>
                  {formatCurrency(summary?.outstanding || 0)}
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>
        <div className="col-md-3">
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-start gap-3">
              <div className="rounded-3 p-2 bg-info bg-opacity-10">
                <IconUsers size={24} className="text-info" />
              </div>
              <div>
                <div className="text-muted small">Employees Covered</div>
                <div className="fw-bold fs-5">{summary?.employees_covered || 0}</div>
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>

      {/* Company Tax Config */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header
          className="bg-white border-bottom d-flex align-items-center justify-content-between cursor-pointer py-3"
          onClick={() => toggleSection("config")}
          style={{ cursor: "pointer" }}
        >
          <div className="d-flex align-items-center gap-2">
            <IconFileInvoice size={20} className="text-primary" />
            <span className="fw-bold">Company Tax Configuration</span>
          </div>
          {expandedSection === "config" ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Card.Header>
        {expandedSection === "config" && (
          <Card.Body>
            {config ? (
              <div className="row g-3">
                <div className="col-md-4">
                  <div className="p-3 rounded bg-light">
                    <div className="text-muted small">TAN Number</div>
                    <div className="fw-bold">{config.tan_number || "Not configured"}</div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-light">
                    <div className="text-muted small">Default Tax Regime</div>
                    <div className="fw-bold">
                      <Badge bg={config.default_tax_regime === "NEW" ? "primary" : "secondary"}>
                        {config.default_tax_regime === "NEW" ? "New Regime (2024+)" : "Old Regime"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-light">
                    <div className="text-muted small">Returns Filed</div>
                    <div className="fw-bold">{summary?.returns_filed || 0} / {summary?.returns_total || 4} quarters</div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-light">
                    <div className="d-flex align-items-center gap-1">
                      <div className="text-muted small">EPF</div>
                      <Badge bg={config.epf_enabled ? "success" : "secondary"} className="ms-1" style={{ fontSize: "10px" }}>
                        {config.epf_enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="fw-semibold small mt-1">
                      Employee: {config.epf_employee_rate}% | Employer: {config.epf_employer_rate}%
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-light">
                    <div className="d-flex align-items-center gap-1">
                      <div className="text-muted small">ESI</div>
                      <Badge bg={config.esi_enabled ? "success" : "secondary"} className="ms-1" style={{ fontSize: "10px" }}>
                        {config.esi_enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="fw-semibold small mt-1">0.75% employee + 3.25% employer</div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-light">
                    <div className="d-flex align-items-center gap-1">
                      <div className="text-muted small">Professional Tax</div>
                      <Badge bg={config.professional_tax_enabled ? "success" : "secondary"} className="ms-1" style={{ fontSize: "10px" }}>
                        {config.professional_tax_enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="fw-semibold small mt-1">State slab-based deduction</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted">
                <IconAlertTriangle size={32} className="mb-2 opacity-50" />
                <p className="mb-0">No tax configuration found. Go to Settings to set up TAN, EPF, and ESI details.</p>
              </div>
            )}
          </Card.Body>
        )}
      </Card>

      {/* Monthly Statutory Summary */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header
          className="bg-white border-bottom d-flex align-items-center justify-content-between py-3"
          onClick={() => toggleSection("monthly")}
          style={{ cursor: "pointer" }}
        >
          <div className="d-flex align-items-center gap-2">
            <IconCalendarEvent size={20} className="text-primary" />
            <span className="fw-bold">Monthly Statutory Summary</span>
            <Badge bg="light" text="dark" className="ms-1">{sortedMonths.length} month(s)</Badge>
          </div>
          {expandedSection === "monthly" ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Card.Header>
        {expandedSection === "monthly" && (
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Month</th>
                    <th className="text-end">TDS</th>
                    <th className="text-end">EPF (Employee)</th>
                    <th className="text-end">ESI (Employee)</th>
                    <th className="text-end">Professional Tax</th>
                    <th className="text-end">Total Statutory</th>
                    <th className="text-center">Employees</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMonths.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">
                        No statutory deduction records for this financial year.
                      </td>
                    </tr>
                  ) : (
                    sortedMonths.map((key) => {
                      const data = monthlyTotals[key];
                      const [y, m] = key.split("-").map(Number);
                      return (
                        <tr key={key}>
                          <td className="fw-semibold">{monthNames[m]} {y}</td>
                          <td className="text-end">{formatCurrency(data.tds)}</td>
                          <td className="text-end">{formatCurrency(data.epf)}</td>
                          <td className="text-end">{formatCurrency(data.esi)}</td>
                          <td className="text-end">{formatCurrency(data.pt)}</td>
                          <td className="text-end fw-bold">{formatCurrency(data.total)}</td>
                          <td className="text-center">
                            <Badge bg="light" text="dark">{data.count}</Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {sortedMonths.length > 0 && (
                  <tfoot className="table-light">
                    <tr className="fw-bold">
                      <td>Grand Total</td>
                      <td className="text-end">{formatCurrency(sortedMonths.reduce((s, k) => s + monthlyTotals[k].tds, 0))}</td>
                      <td className="text-end">{formatCurrency(sortedMonths.reduce((s, k) => s + monthlyTotals[k].epf, 0))}</td>
                      <td className="text-end">{formatCurrency(sortedMonths.reduce((s, k) => s + monthlyTotals[k].esi, 0))}</td>
                      <td className="text-end">{formatCurrency(sortedMonths.reduce((s, k) => s + monthlyTotals[k].pt, 0))}</td>
                      <td className="text-end">{formatCurrency(sortedMonths.reduce((s, k) => s + monthlyTotals[k].total, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </Card.Body>
        )}
      </Card>

      {/* Employee-wise Breakdown with Expandable Detail */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header
          className="bg-white border-bottom d-flex align-items-center justify-content-between py-3"
          onClick={() => toggleSection("employees")}
          style={{ cursor: "pointer" }}
        >
          <div className="d-flex align-items-center gap-2">
            <IconUsers size={20} className="text-primary" />
            <span className="fw-bold">Employee-wise Deduction Breakdown</span>
            <Badge bg="light" text="dark" className="ms-1">{Object.keys(employeeTotals).length} employees</Badge>
            <span className="text-muted small ms-2">Click any employee for full details</span>
          </div>
          {expandedSection === "employees" ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Card.Header>
        {expandedSection === "employees" && (
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th></th>
                    <th>Employee</th>
                    <th className="text-center">Pay TDS</th>
                    <th className="text-end">TDS (YTD)</th>
                    <th className="text-end">EPF (YTD)</th>
                    <th className="text-end">ESI (YTD)</th>
                    <th className="text-end">PT (YTD)</th>
                    <th className="text-end">Total Deducted</th>
                    <th className="text-end">Annual Tax</th>
                    <th className="text-end">TDS Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(employeeTotals).length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-4 text-muted">
                        No employee deduction data available.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(employeeTotals)
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([empId, data]) => {
                        const tdsRemaining = Math.max(0, data.annualTax - data.tds);
                        const tdsProgress = data.annualTax > 0 ? Math.round((data.tds / data.annualTax) * 100) : 0;
                        const isSelected = selectedEmployee === empId;
                        return (
                          <Fragment key={empId}>
                            <tr
                              onClick={() => handleEmployeeClick(empId)}
                              style={{ cursor: "pointer" }}
                              className={isSelected ? "table-active" : ""}
                            >
                              <td style={{ width: "32px" }}>
                                {isSelected ? <IconChevronUp size={16} className="text-primary" /> : <IconChevronDown size={16} className="text-muted" />}
                              </td>
                              <td className="fw-semibold">
                                <div className="d-flex align-items-center gap-2">
                                  <div className="rounded-circle bg-primary bg-opacity-10 d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }}>
                                    <IconUser size={14} className="text-primary" />
                                  </div>
                                  {data.name}
                                </div>
                              </td>
                              <td className="text-center" onClick={(e) => e.stopPropagation()}>
                                {data.tds > 0 ? (
                                  <Button
                                    variant={payTdsExpandedEmp === empId ? "outline-primary" : "primary"}
                                    size="sm"
                                    className="px-3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (payTdsExpandedEmp !== empId && !timeline) fetchTimeline();
                                      setPayTdsExpandedEmp(payTdsExpandedEmp === empId ? null : empId);
                                    }}
                                  >
                                    <IconCurrencyRupee size={14} className="me-1" />Pay TDS
                                    {payTdsExpandedEmp === empId ? <IconChevronUp size={12} className="ms-1" /> : <IconChevronDown size={12} className="ms-1" />}
                                  </Button>
                                ) : (
                                  <span className="text-muted small">No TDS</span>
                                )}
                              </td>
                              <td className="text-end">{data.tds > 0 ? formatCurrency(data.tds) : <span className="text-muted">-</span>}</td>
                              <td className="text-end">{data.epf > 0 ? formatCurrency(data.epf) : <span className="text-muted">-</span>}</td>
                              <td className="text-end">{data.esi > 0 ? formatCurrency(data.esi) : <span className="text-muted">-</span>}</td>
                              <td className="text-end">{data.pt > 0 ? formatCurrency(data.pt) : <span className="text-muted">-</span>}</td>
                              <td className="text-end fw-bold">{formatCurrency(data.total)}</td>
                              <td className="text-end">{data.annualTax > 0 ? formatCurrency(data.annualTax) : <span className="text-muted">₹0</span>}</td>
                              <td className="text-end">
                                {data.annualTax > 0 ? (
                                  <span className={tdsRemaining > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>
                                    {formatCurrency(tdsRemaining)}
                                  </span>
                                ) : (
                                  <span className="text-success">₹0</span>
                                )}
                              </td>
                            </tr>

                            {/* Pay TDS Dropdown for this employee */}
                            {payTdsExpandedEmp === empId && data.tds > 0 && (
                              <tr>
                                <td colSpan={10} className="p-0 border-0">
                                  <div className="bg-primary bg-opacity-10 p-3" style={{ borderLeft: "4px solid var(--bs-primary)" }}>
                                    <div className="d-flex align-items-center justify-content-between mb-2">
                                      <span className="fw-bold small text-primary">
                                        <IconCurrencyRupee size={14} className="me-1" />
                                        Monthly TDS Breakdown — {data.name}
                                      </span>
                                      <span className="fw-bold small">Total YTD: {formatCurrency(data.tds)}</span>
                                    </div>
                                    <table className="table table-sm mb-0 bg-white rounded" style={{ fontSize: "12px" }}>
                                      <thead>
                                        <tr className="text-muted">
                                          <th style={{ fontWeight: 600 }}>Month</th>
                                          <th className="text-end" style={{ fontWeight: 600 }}>TDS Amount</th>
                                          <th className="text-center" style={{ fontWeight: 600 }}>Status</th>
                                          <th className="text-center" style={{ fontWeight: 600 }}>Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {data.months
                                          .sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year)
                                          .map((m, idx) => {
                                            const mKey = `${m.year}-${String(m.month).padStart(2, "0")}`;
                                            const tlMonth = timeline?.months?.find((t: any) => t.month === m.month && t.year === m.year);
                                            const challanStatus = tlMonth?.challan_status || "NOT_GENERATED";
                                            const statusMap: Record<string, { label: string; bg: string; text?: string }> = {
                                              PAID: { label: "Paid", bg: "success" },
                                              VERIFIED: { label: "Verified", bg: "success" },
                                              PENDING: { label: "Pending", bg: "warning", text: "dark" },
                                              FAILED: { label: "Failed", bg: "danger" },
                                              NOT_GENERATED: { label: "Not Generated", bg: "info" },
                                            };
                                            const st = statusMap[challanStatus] || { label: "—", bg: "light", text: "muted" };
                                            return (
                                              <tr key={idx}>
                                                <td className="fw-semibold">{monthNames[m.month]} {m.year}</td>
                                                <td className="text-end fw-semibold">{m.tds > 0 ? formatCurrency(m.tds) : <span className="text-muted">-</span>}</td>
                                                <td className="text-center">
                                                  <Badge bg={st.bg} text={st.text as any} style={{ fontSize: "10px" }}>{st.label}</Badge>
                                                </td>
                                                <td className="text-center">
                                                  {challanStatus === "NOT_GENERATED" && m.tds > 0 && (
                                                    <Button
                                                      variant="primary"
                                                      size="sm"
                                                      style={{ fontSize: "11px", padding: "2px 8px" }}
                                                      disabled={generatingChallan === `${m.month}-${m.year}`}
                                                      onClick={() => {
                                                        if (!timeline) fetchTimeline();
                                                        handleGenerateChallan(m.month, m.year);
                                                      }}
                                                    >
                                                      {generatingChallan === `${m.month}-${m.year}` ? <Spinner animation="border" size="sm" /> : <>₹ Pay</>}
                                                    </Button>
                                                  )}
                                                  {challanStatus === "PENDING" && tlMonth?.challan_id && (
                                                    <Button
                                                      variant="success"
                                                      size="sm"
                                                      style={{ fontSize: "11px", padding: "2px 8px" }}
                                                      onClick={() => openPaymentModal(tlMonth.challan_id, { month: m.month, year: m.year, total_tds: m.tds, employees: [], tan: config?.tan_number || "" })}
                                                    >
                                                      Record
                                                    </Button>
                                                  )}
                                                  {challanStatus === "FAILED" && (
                                                    <Button
                                                      variant="danger"
                                                      size="sm"
                                                      style={{ fontSize: "11px", padding: "2px 8px" }}
                                                      disabled={generatingChallan === `${m.month}-${m.year}`}
                                                      onClick={() => handleGenerateChallan(m.month, m.year)}
                                                    >
                                                      Retry
                                                    </Button>
                                                  )}
                                                  {(challanStatus === "PAID" || challanStatus === "VERIFIED") && (
                                                    <span className="text-success" style={{ fontSize: "11px" }}><IconCheck size={12} /> Done</span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                      </tbody>
                                    </table>
                                    <div className="text-muted mt-2" style={{ fontSize: "11px" }}>
                                      <IconInfoCircle size={12} className="me-1" />
                                      Challan 281 is generated for all employees combined. Individual TDS amounts shown above are {data.name}&apos;s share.
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* Expanded Employee Detail */}
                            {isSelected && (
                              <tr>
                                <td colSpan={10} className="p-0 border-0">
                                  <div className="bg-light p-4" style={{ borderLeft: "4px solid var(--bs-primary)" }}>
                                    {loadingBreakdown ? (
                                      <div className="text-center py-3"><Spinner animation="border" size="sm" /> Loading details...</div>
                                    ) : employeeBreakdown ? (
                                      <div>
                                        {/* Summary row */}
                                        <div className="row g-3 mb-4">
                                          <div className="col-md-3">
                                            <div className="bg-white rounded-3 p-3 border">
                                              <div className="text-muted small">Annual CTC</div>
                                              <div className="fw-bold fs-5">{formatCurrency(employeeBreakdown.annual_ctc)}</div>
                                            </div>
                                          </div>
                                          <div className="col-md-3">
                                            <div className="bg-white rounded-3 p-3 border">
                                              <div className="text-muted small">Total Annual Tax</div>
                                              <div className="fw-bold fs-5">{formatCurrency(employeeBreakdown.tax_computation?.total_annual_tax || 0)}</div>
                                            </div>
                                          </div>
                                          <div className="col-md-3">
                                            <div className="bg-white rounded-3 p-3 border">
                                              <div className="text-muted small">TDS Paid (YTD)</div>
                                              <div className="fw-bold fs-5 text-success">{formatCurrency(data.tds)}</div>
                                            </div>
                                          </div>
                                          <div className="col-md-3">
                                            <div className="bg-white rounded-3 p-3 border">
                                              <div className="text-muted small">TDS Remaining</div>
                                              <div className={`fw-bold fs-5 ${tdsRemaining > 0 ? "text-danger" : "text-success"}`}>
                                                {formatCurrency(tdsRemaining)}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* TDS Progress */}
                                        {data.annualTax > 0 && (
                                          <div className="mb-4">
                                            <div className="d-flex justify-content-between small mb-1">
                                              <span className="text-muted">TDS Progress for FY {fy}</span>
                                              <span className="fw-semibold">{tdsProgress}% collected</span>
                                            </div>
                                            <ProgressBar
                                              now={tdsProgress}
                                              variant={tdsProgress >= 80 ? "success" : tdsProgress >= 50 ? "primary" : "warning"}
                                              style={{ height: "8px" }}
                                            />
                                          </div>
                                        )}

                                        <div className="row g-4">
                                          {/* Tax Computation */}
                                          <div className="col-lg-6">
                                            <div className="bg-white rounded-3 border p-3">
                                              <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                                                <IconReceiptTax size={16} className="text-primary" />
                                                Tax Computation ({employeeBreakdown.regime === "NEW" ? "New Regime" : "Old Regime"})
                                                {(() => {
                                                  const slabs = employeeBreakdown.tax_computation?.slab_breakdown || [];
                                                  const highest = [...slabs].reverse().find((s: any) => Number(s.tax) > 0);
                                                  return highest ? (
                                                    <Badge bg="primary" className="ms-auto">{Number(highest.rate)}% Tax Bracket</Badge>
                                                  ) : null;
                                                })()}
                                              </h6>
                                              <table className="table table-sm mb-0" style={{ fontSize: "13px" }}>
                                                <tbody>
                                                  <tr>
                                                    <td>Gross Annual Salary</td>
                                                    <td className="text-end fw-semibold">{formatCurrency(employeeBreakdown.tax_computation?.gross_salary || 0)}</td>
                                                  </tr>
                                                  <tr>
                                                    <td>
                                                      <div className="d-flex align-items-center gap-1">
                                                        Less: Standard Deduction
                                                        <a href="https://incometaxindia.gov.in/pages/tools/standard-deduction.aspx" target="_blank" rel="noopener noreferrer" className="badge bg-light text-primary border border-primary border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                      </div>
                                                      <div className="text-muted" style={{ fontSize: "11px" }}>{employeeBreakdown.tax_computation?.standard_deduction_explanation}</div>
                                                    </td>
                                                    <td className="text-end text-danger">-{formatCurrency(employeeBreakdown.tax_computation?.standard_deduction || 0)}</td>
                                                  </tr>
                                                  <tr className="table-light">
                                                    <td className="fw-bold">Taxable Income</td>
                                                    <td className="text-end fw-bold">{formatCurrency(employeeBreakdown.tax_computation?.taxable_income || 0)}</td>
                                                  </tr>
                                                  <tr>
                                                    <td>
                                                      <div className="d-flex align-items-center gap-1">
                                                        Tax on Slabs
                                                        <a href="https://incometaxindia.gov.in/pages/tools/income-tax-calculator.aspx" target="_blank" rel="noopener noreferrer" className="badge bg-light text-primary border border-primary border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                      </div>
                                                    </td>
                                                    <td className="text-end">{formatCurrency(employeeBreakdown.tax_computation?.base_tax || 0)}</td>
                                                  </tr>
                                                  {Number(employeeBreakdown.tax_computation?.rebate_87a || 0) > 0 && (
                                                    <tr className="text-success">
                                                      <td>
                                                        <div className="d-flex align-items-center gap-1">
                                                          Less: Section 87A Rebate
                                                          <a href="https://incometaxindia.gov.in/Pages/tools/rebate-under-section-87a.aspx" target="_blank" rel="noopener noreferrer" className="badge bg-light text-success border border-success border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                        </div>
                                                      </td>
                                                      <td className="text-end">-{formatCurrency(employeeBreakdown.tax_computation?.rebate_87a || 0)}</td>
                                                    </tr>
                                                  )}
                                                  <tr>
                                                    <td>
                                                      <div className="d-flex align-items-center gap-1">
                                                        Health &amp; Education Cess (4%)
                                                        <a href="https://incometaxindia.gov.in/Pages/tools/health-and-education-cess.aspx" target="_blank" rel="noopener noreferrer" className="badge bg-light text-primary border border-primary border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                      </div>
                                                      <div className="text-muted" style={{ fontSize: "11px" }}>Mandatory 4% cess on tax — levied by Government of India u/s 2(11) of Finance Act for funding health & education</div>
                                                    </td>
                                                    <td className="text-end">{formatCurrency(employeeBreakdown.tax_computation?.cess || 0)}</td>
                                                  </tr>
                                                  <tr className="table-warning">
                                                    <td className="fw-bold">Total Annual Tax</td>
                                                    <td className="text-end fw-bold">{formatCurrency(employeeBreakdown.tax_computation?.total_annual_tax || 0)}</td>
                                                  </tr>
                                                  <tr className="table-primary">
                                                    <td>
                                                      <div className="d-flex align-items-center gap-1 fw-bold">
                                                        Monthly TDS (Section 192)
                                                        <a href="https://incometaxindia.gov.in/Pages/tools/tds-on-salary-702.aspx" target="_blank" rel="noopener noreferrer" className="badge bg-white text-primary border border-primary border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                      </div>
                                                    </td>
                                                    <td className="text-end fw-bold">{formatCurrency(employeeBreakdown.tax_computation?.monthly_tds || 0)}</td>
                                                  </tr>
                                                </tbody>
                                              </table>

                                              {/* Slab breakdown */}
                                              {employeeBreakdown.tax_computation?.slab_breakdown && (() => {
                                                const slabs = employeeBreakdown.tax_computation.slab_breakdown;
                                                const highestIdx = [...slabs].map((s: any, i: number) => ({ i, tax: Number(s.tax) })).filter(x => x.tax > 0).pop()?.i ?? -1;
                                                return (
                                                <div className="mt-3 pt-3 border-top">
                                                  <div className="text-muted small fw-semibold mb-2">Slab-wise Tax Breakdown</div>
                                                  <table className="table table-sm mb-0" style={{ fontSize: "12px" }}>
                                                    <thead>
                                                      <tr className="text-muted">
                                                        <th style={{ fontWeight: 600 }}>Slab</th>
                                                        <th className="text-center" style={{ fontWeight: 600 }}>Rate</th>
                                                        <th className="text-end" style={{ fontWeight: 600 }}>Taxable</th>
                                                        <th className="text-end" style={{ fontWeight: 600 }}>Tax</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {slabs.map((slab: any, idx: number) => {
                                                        const from = Number(slab.from);
                                                        const to = slab.to === "Above" ? null : Number(slab.to);
                                                        const fromL = from >= 100000 ? `${(from / 100000).toFixed(0)}L` : `₹${from.toLocaleString("en-IN")}`;
                                                        const toL = to === null ? "Above" : to >= 100000 ? `${(to / 100000).toFixed(0)}L` : `₹${to.toLocaleString("en-IN")}`;
                                                        const taxAmt = Number(slab.tax);
                                                        const isHighest = idx === highestIdx;
                                                        return (
                                                          <tr key={idx} className={isHighest ? "table-primary fw-semibold" : taxAmt > 0 ? "" : "text-muted"}>
                                                            <td>
                                                              ₹{fromL} – {toL}
                                                              {isHighest && <Badge bg="primary" className="ms-2" style={{ fontSize: "9px" }}>YOUR SLAB</Badge>}
                                                            </td>
                                                            <td className="text-center">{Number(slab.rate)}%</td>
                                                            <td className="text-end">{Number(slab.taxable_in_slab) > 0 ? formatCurrency(slab.taxable_in_slab) : "-"}</td>
                                                            <td className="text-end">{taxAmt > 0 ? formatCurrency(slab.tax) : "-"}</td>
                                                          </tr>
                                                        );
                                                      })}
                                                    </tbody>
                                                  </table>
                                                </div>
                                                );
                                              })()}
                                            </div>
                                          </div>

                                          {/* Right: Month-by-month + Other deductions */}
                                          <div className="col-lg-6">
                                            {/* Other statutory deductions */}
                                            {(employeeBreakdown.epf || employeeBreakdown.professional_tax || employeeBreakdown.esi) && (
                                              <div className="bg-white rounded-3 border p-3 mb-3">
                                                <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                                                  <IconShieldCheck size={16} className="text-success" />
                                                  Other Statutory (Monthly)
                                                </h6>
                                                <table className="table table-sm mb-0" style={{ fontSize: "13px" }}>
                                                  <tbody>
                                                    {employeeBreakdown.epf && (
                                                      <>
                                                        <tr>
                                                          <td>
                                                            <div className="d-flex align-items-center gap-1">
                                                              EPF (Employee {employeeBreakdown.epf.employee_rate}%)
                                                              <a href="https://www.epfindia.gov.in/site_en/EPF_Scheme.php" target="_blank" rel="noopener noreferrer" className="badge bg-light text-primary border border-primary border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                            </div>
                                                            <div className="text-muted" style={{ fontSize: "11px" }}>
                                                              On min(Basic+DA ₹{Number(employeeBreakdown.epf.basic_plus_da).toLocaleString("en-IN")}, Ceiling ₹{Number(employeeBreakdown.epf.wage_ceiling).toLocaleString("en-IN")})
                                                            </div>
                                                          </td>
                                                          <td className="text-end fw-semibold">{formatCurrency(employeeBreakdown.epf.employee_contribution)}/mo</td>
                                                        </tr>
                                                        <tr className="text-muted">
                                                          <td>EPF (Employer {employeeBreakdown.epf.employer_rate}%)</td>
                                                          <td className="text-end">{formatCurrency(employeeBreakdown.epf.employer_contribution)}/mo</td>
                                                        </tr>
                                                      </>
                                                    )}
                                                    {employeeBreakdown.professional_tax && (
                                                      <tr>
                                                        <td>
                                                          <div className="d-flex align-items-center gap-1">
                                                            Professional Tax ({employeeBreakdown.professional_tax.state})
                                                            <a href="https://www.mahagst.gov.in/en/professional-tax" target="_blank" rel="noopener noreferrer" className="badge bg-light text-primary border border-primary border-opacity-25" style={{ fontSize: "10px", textDecoration: "none" }}>View ↗</a>
                                                          </div>
                                                        </td>
                                                        <td className="text-end fw-semibold">{formatCurrency(employeeBreakdown.professional_tax.monthly_tax)}/mo</td>
                                                      </tr>
                                                    )}
                                                    {employeeBreakdown.esi?.applicable && (
                                                      <tr>
                                                        <td>ESI (Employee {employeeBreakdown.esi.employee_rate}%)</td>
                                                        <td className="text-end fw-semibold">{formatCurrency(employeeBreakdown.esi.employee_contribution)}/mo</td>
                                                      </tr>
                                                    )}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}

                                            {/* YTD Accumulated */}
                                            <div className="bg-white rounded-3 border p-3 mb-3">
                                              <h6 className="fw-bold mb-3">YTD Accumulated (FY {fy})</h6>
                                              <div className="row g-2">
                                                <div className="col-6">
                                                  <div className="p-2 bg-primary bg-opacity-10 rounded text-center">
                                                    <div className="small text-muted">TDS Paid</div>
                                                    <div className="fw-bold">{formatCurrency(data.tds)}</div>
                                                  </div>
                                                </div>
                                                <div className="col-6">
                                                  <div className="p-2 bg-success bg-opacity-10 rounded text-center">
                                                    <div className="small text-muted">EPF Paid</div>
                                                    <div className="fw-bold">{formatCurrency(data.epf)}</div>
                                                  </div>
                                                </div>
                                                <div className="col-6">
                                                  <div className="p-2 bg-warning bg-opacity-10 rounded text-center">
                                                    <div className="small text-muted">PT Paid</div>
                                                    <div className="fw-bold">{formatCurrency(data.pt)}</div>
                                                  </div>
                                                </div>
                                                <div className="col-6">
                                                  <div className="p-2 bg-info bg-opacity-10 rounded text-center">
                                                    <div className="small text-muted">ESI Paid</div>
                                                    <div className="fw-bold">{formatCurrency(data.esi)}</div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Month-by-month history */}
                                            <div className="bg-white rounded-3 border p-3">
                                              <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                                                <IconCalendarEvent size={16} className="text-info" />
                                                Month-by-Month History
                                              </h6>
                                              <table className="table table-sm mb-0" style={{ fontSize: "12px" }}>
                                                <thead>
                                                  <tr className="text-muted">
                                                    <th style={{ fontWeight: 600 }}>Month</th>
                                                    <th className="text-end" style={{ fontWeight: 600 }}>TDS</th>
                                                    <th className="text-end" style={{ fontWeight: 600 }}>EPF</th>
                                                    <th className="text-end" style={{ fontWeight: 600 }}>PT</th>
                                                    <th className="text-end" style={{ fontWeight: 600 }}>Total</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {data.months
                                                    .sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year)
                                                    .map((m, idx) => (
                                                      <tr key={idx}>
                                                        <td className="fw-semibold">{monthNames[m.month]} {m.year}</td>
                                                        <td className="text-end">{m.tds > 0 ? formatCurrency(m.tds) : "-"}</td>
                                                        <td className="text-end">{m.epf > 0 ? formatCurrency(m.epf) : "-"}</td>
                                                        <td className="text-end">{m.pt > 0 ? formatCurrency(m.pt) : "-"}</td>
                                                        <td className="text-end fw-semibold">{formatCurrency(m.total)}</td>
                                                      </tr>
                                                    ))
                                                  }
                                                  <tr className="table-light fw-bold">
                                                    <td>Total YTD</td>
                                                    <td className="text-end">{formatCurrency(data.tds)}</td>
                                                    <td className="text-end">{formatCurrency(data.epf)}</td>
                                                    <td className="text-end">{formatCurrency(data.pt)}</td>
                                                    <td className="text-end">{formatCurrency(data.total)}</td>
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Toggle Status */}
                                        <div className="mt-3 d-flex gap-2 flex-wrap">
                                          {[
                                            { key: "tds_applicable", label: "TDS", color: "primary" },
                                            { key: "epf_applicable", label: "EPF", color: "success" },
                                            { key: "esi_applicable", label: "ESI", color: "info" },
                                            { key: "pt_applicable", label: "PT", color: "warning" },
                                          ].map((t) => (
                                            <Badge
                                              key={t.key}
                                              bg={employeeBreakdown.toggles?.[t.key] ? `${t.color}` : "secondary"}
                                              className="px-3 py-2"
                                              style={{ fontSize: "12px" }}
                                            >
                                              {t.label}: {employeeBreakdown.toggles?.[t.key] ? "Enabled" : "Disabled"}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-muted text-center py-3">Unable to load breakdown.</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        )}
      </Card>

      {/* Tax Declarations */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header
          className="bg-white border-bottom d-flex align-items-center justify-content-between py-3"
          onClick={() => toggleSection("declarations")}
          style={{ cursor: "pointer" }}
        >
          <div className="d-flex align-items-center gap-2">
            <IconFileInvoice size={20} className="text-primary" />
            <span className="fw-bold">Employee Tax Declarations</span>
            <Badge bg="light" text="dark" className="ms-1">{declarations.length}</Badge>
          </div>
          {expandedSection === "declarations" ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Card.Header>
        {expandedSection === "declarations" && (
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Employee</th>
                    <th>Regime</th>
                    <th>Status</th>
                    <th className="text-end">80C</th>
                    <th className="text-end">80D</th>
                    <th className="text-end">HRA Claimed</th>
                  </tr>
                </thead>
                <tbody>
                  {declarations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-muted">
                        No tax declarations filed for this financial year.
                      </td>
                    </tr>
                  ) : (
                    declarations.map((d) => (
                      <tr key={d.id}>
                        <td className="fw-semibold">{d.employee_name || `Employee #${d.employee}`}</td>
                        <td>
                          <Badge bg={d.tax_regime === "NEW" ? "primary" : "secondary"}>
                            {d.tax_regime === "NEW" ? "New" : "Old"}
                          </Badge>
                        </td>
                        <td>
                          <Badge
                            bg={
                              d.status === "VERIFIED" ? "success" :
                              d.status === "SUBMITTED" ? "info" :
                              "warning"
                            }
                          >
                            {d.status}
                          </Badge>
                        </td>
                        <td className="text-end">{Number(d.section_80c || 0) > 0 ? formatCurrency(d.section_80c) : "-"}</td>
                        <td className="text-end">{(Number(d.section_80d_self || 0) + Number(d.section_80d_parents || 0)) > 0 ? formatCurrency(Number(d.section_80d_self || 0) + Number(d.section_80d_parents || 0)) : "-"}</td>
                        <td className="text-end">{Number(d.hra_claimed || 0) > 0 ? formatCurrency(d.hra_claimed) : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TDS DEPOSIT PIPELINE                                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header
          className="bg-white border-bottom d-flex align-items-center justify-content-between py-3"
          onClick={() => toggleSection("pipeline")}
          style={{ cursor: "pointer" }}
        >
          <div className="d-flex align-items-center gap-2">
            <IconBuildingBank size={20} className="text-primary" />
            <span className="fw-bold">TDS Deposit Pipeline — Challan 281</span>
            <Badge bg="primary" className="ms-1">One-Click Flow</Badge>
          </div>
          {expandedSection === "pipeline" ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Card.Header>
        {expandedSection === "pipeline" && (
          <Card.Body>
            <div className="alert alert-light border d-flex align-items-start gap-2 py-2 px-3 mb-3" style={{ fontSize: "12px" }}>
              <IconInfoCircle size={16} className="text-primary flex-shrink-0 mt-1" />
              <span>
                This is the <strong>combined TDS deposit</strong> for all employees each month. As per Section 192 of the Income Tax Act, employers must deposit the total TDS deducted from all employees&apos; salaries via a single <strong>Challan 281</strong> to the government by the 7th of the following month.
              </span>
            </div>
            {loadingTimeline ? (
              <div className="text-center py-4"><Spinner animation="border" size="sm" /> Loading timeline...</div>
            ) : timeline ? (
              <div>
                {/* Monthly Timeline */}
                <div className="table-responsive">
                  <Table hover className="align-middle mb-0" size="sm">
                    <thead className="table-light">
                      <tr>
                        <th>Month</th>
                        <th>Quarter</th>
                        <th className="text-end">TDS Amount</th>
                        <th className="text-center">Employees</th>
                        <th className="text-center">Due Date</th>
                        <th className="text-center">Status</th>
                        <th className="text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.months.map((m: any) => {
                        const amt = Number(m.tds_amount);
                        const statusMap: Record<string, { label: string; bg: string; text?: string; icon: any }> = {
                          PAID: { label: "Paid", bg: "success", icon: <IconCheck size={12} /> },
                          VERIFIED: { label: "Verified", bg: "success", icon: <IconShieldCheck size={12} /> },
                          PENDING: { label: "Pending Payment", bg: "warning", text: "dark", icon: <IconClock size={12} /> },
                          FAILED: { label: "Failed", bg: "danger", icon: <IconAlertTriangle size={12} /> },
                          NOT_GENERATED: { label: "Not Generated", bg: "info", text: "white", icon: null },
                          NO_TDS: { label: "No TDS", bg: "light", text: "muted", icon: null },
                        };
                        const st = statusMap[m.challan_status] || statusMap.NO_TDS;
                        return (
                          <tr key={`${m.month}-${m.year}`} className={m.is_overdue ? "table-danger" : ""}>
                            <td className="fw-semibold">{m.month_name}</td>
                            <td><Badge bg="primary" className="bg-opacity-10 text-primary border border-primary border-opacity-25">{m.quarter}</Badge></td>
                            <td className="text-end">{amt > 0 ? formatCurrency(amt) : <span className="text-muted">-</span>}</td>
                            <td className="text-center">{m.employees > 0 ? m.employees : "-"}</td>
                            <td className="text-center small">{m.due_date}</td>
                            <td className="text-center">
                              <Badge bg={st.bg} text={st.text as any} className="d-inline-flex align-items-center gap-1">
                                {st.icon} {st.label}
                              </Badge>
                              {m.is_overdue && <Badge bg="danger" className="ms-1">Overdue</Badge>}
                            </td>
                            <td className="text-center">
                              {m.challan_status === "NO_TDS" && <span className="text-muted small">—</span>}
                              {m.challan_status === "NOT_GENERATED" && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={generatingChallan === `${m.month}-${m.year}`}
                                  onClick={() => handleGenerateChallan(m.month, m.year)}
                                >
                                  {generatingChallan === `${m.month}-${m.year}` ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <><IconCurrencyRupee size={14} className="me-1" />Pay TDS</>
                                  )}
                                </Button>
                              )}
                              {m.challan_status === "PENDING" && m.challan_id && (
                                <Button variant="success" size="sm" onClick={() => openPaymentModal(m.challan_id, { month: m.month, year: m.year, total_tds: Number(m.tds_amount), employees: [], tan: config?.tan_number || "" })}>
                                  <IconBuildingBank size={14} className="me-1" />
                                  Record Payment
                                </Button>
                              )}
                              {m.challan_status === "FAILED" && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={generatingChallan === `${m.month}-${m.year}`}
                                  onClick={() => handleGenerateChallan(m.month, m.year)}
                                >
                                  {generatingChallan === `${m.month}-${m.year}` ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <><IconCurrencyRupee size={14} className="me-1" />Retry Payment</>
                                  )}
                                </Button>
                              )}
                              {(m.challan_status === "PAID" || m.challan_status === "VERIFIED") && (
                                <span className="small text-success">
                                  <IconCheck size={14} className="me-1" />
                                  CIN: {m.cin || "—"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>

                {/* Quarterly Returns Summary */}
                <h6 className="fw-bold mt-4 mb-3 d-flex align-items-center gap-2">
                  <IconFileText size={18} className="text-info" />
                  Quarterly Returns (Form 24Q)
                </h6>
                <div className="row g-3">
                  {timeline.quarters.map((q: any) => {
                    const retStatus: Record<string, { label: string; bg: string }> = {
                      FILED: { label: "Filed", bg: "success" },
                      ACCEPTED: { label: "Accepted", bg: "success" },
                      VALIDATED: { label: "Validated", bg: "info" },
                      DRAFT: { label: "Draft", bg: "warning" },
                      REJECTED: { label: "Rejected", bg: "danger" },
                      NOT_FILED: { label: "Not Filed", bg: "secondary" },
                    };
                    const rs = retStatus[q.return_status] || retStatus.NOT_FILED;
                    return (
                      <div className="col-md-3" key={q.quarter}>
                        <Card className="border h-100">
                          <Card.Body className="text-center py-3">
                            <div className="fw-bold fs-5 text-primary">{q.quarter}</div>
                            <div className="text-muted small mb-2">TDS: {formatCurrency(q.total_tds)}</div>
                            <Badge bg={rs.bg} className="mb-2">{rs.label}</Badge>
                            <div>
                              <Button
                                variant="outline-info"
                                size="sm"
                                className="mt-2"
                                onClick={() => { setSelectedQuarter(q.quarter); fetch24QData(q.quarter); setShow24QModal(true); }}
                              >
                                <IconFileText size={14} className="me-1" />View 24Q Data
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-muted text-center py-4">
                No timeline data available. Generate payroll records first.
              </div>
            )}
          </Card.Body>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* FORM 16 GENERATION                                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Header
          className="bg-white border-bottom d-flex align-items-center justify-content-between py-3"
          onClick={() => toggleSection("form16")}
          style={{ cursor: "pointer" }}
        >
          <div className="d-flex align-items-center gap-2">
            <IconFileText size={20} className="text-primary" />
            <span className="fw-bold">Form 16 — TDS Certificate</span>
          </div>
          {expandedSection === "form16" ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </Card.Header>
        {expandedSection === "form16" && (
          <Card.Body>
            <p className="text-muted small mb-3">
              Generate Form 16 (TDS Certificate) for any employee. This includes Part A (TDS deposited with challan references) and Part B (Income & Tax computation).
            </p>
            <div className="row g-3 align-items-end">
              <div className="col-md-6">
                <Form.Label className="fw-semibold small">Select Employee</Form.Label>
                <Form.Select
                  size="sm"
                  value={form16EmpId}
                  onChange={(e) => setForm16EmpId(e.target.value)}
                >
                  <option value="">— Select Employee —</option>
                  {Object.entries(employeeTotals)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([empId, data]) => (
                      <option key={empId} value={empId}>{data.name}</option>
                    ))}
                </Form.Select>
              </div>
              <div className="col-md-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!form16EmpId || loadingForm16}
                  onClick={() => { fetchForm16(form16EmpId); setShowForm16Modal(true); }}
                >
                  {loadingForm16 ? <Spinner animation="border" size="sm" className="me-1" /> : <IconFileText size={14} className="me-1" />}
                  Generate Form 16
                </Button>
              </div>
            </div>
          </Card.Body>
        )}
      </Card>

      {/* ═══════ MODALS ═══════ */}

      {/* Record Payment Modal */}
      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} centered size="lg">
        <Modal.Header closeButton className="bg-primary bg-opacity-10">
          <Modal.Title className="fs-5"><IconBuildingBank size={20} className="me-2 text-primary" />Pay TDS — Challan 281</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Step 1: Challan Summary */}
          <div className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-3">
              <Badge bg="primary" className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 24, height: 24 }}>1</Badge>
              <span className="fw-bold">Challan Details</span>
            </div>
            {paymentChallanDetails && (
              <div className="bg-light rounded-3 p-3 border">
                <div className="row g-2 mb-2">
                  <div className="col-sm-4">
                    <div className="text-muted" style={{ fontSize: "11px" }}>Month</div>
                    <div className="fw-bold">{monthNames[paymentChallanDetails.month]} {paymentChallanDetails.year}</div>
                  </div>
                  <div className="col-sm-4">
                    <div className="text-muted" style={{ fontSize: "11px" }}>Total TDS Amount</div>
                    <div className="fw-bold text-primary fs-5">{formatCurrency(paymentChallanDetails.total_tds || 0)}</div>
                  </div>
                  <div className="col-sm-4">
                    <div className="text-muted" style={{ fontSize: "11px" }}>Company TAN</div>
                    <div className="fw-bold">{paymentChallanDetails.tan || "Not configured"}</div>
                  </div>
                </div>
                {paymentChallanDetails.employees?.length > 0 && (
                  <div className="mt-2 pt-2 border-top">
                    <div className="text-muted mb-1" style={{ fontSize: "11px" }}>Employee-wise Breakdown</div>
                    <table className="table table-sm mb-0" style={{ fontSize: "12px" }}>
                      <thead>
                        <tr className="text-muted">
                          <th style={{ fontWeight: 600 }}>Employee</th>
                          <th style={{ fontWeight: 600 }}>PAN</th>
                          <th className="text-end" style={{ fontWeight: 600 }}>TDS Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentChallanDetails.employees.map((emp: any, idx: number) => (
                          <tr key={idx}>
                            <td className="fw-semibold">{emp.employee_name}</td>
                            <td><code className="text-dark">{emp.pan || "—"}</code></td>
                            <td className="text-end fw-semibold">{formatCurrency(emp.tds_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Pay on Government Portal */}
          <div className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-3">
              <Badge bg="primary" className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 24, height: 24 }}>2</Badge>
              <span className="fw-bold">Pay on Government Portal</span>
            </div>
            <div className="bg-warning bg-opacity-10 border border-warning border-opacity-25 rounded-3 p-3">
              <p className="mb-2 small">Click below to open the <strong>Income Tax e-Filing Portal (e-Pay Tax)</strong>. Log in with your TAN, select <strong>Challan No. ITNS 281</strong> (TDS/TCS payable by taxpayer), and complete the payment.</p>
              <a
                href="https://eportal.incometax.gov.in/iec/foservices/#/e-pay-tax"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-warning btn-sm fw-bold px-4"
              >
                <IconArrowRight size={16} className="me-1" />
                Open e-Pay Tax Portal (incometax.gov.in)
              </a>
              <div className="mt-2 text-muted" style={{ fontSize: "11px" }}>
                After payment, you will receive a <strong>CIN (Challan Identification Number)</strong>, <strong>BSR Code</strong>, and <strong>Challan Serial Number</strong>. Enter them below.
              </div>
            </div>
          </div>

          {/* Step 3: Record Payment */}
          <div>
            <div className="d-flex align-items-center gap-2 mb-3">
              <Badge bg="primary" className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 24, height: 24 }}>3</Badge>
              <span className="fw-bold">Record Payment Details</span>
            </div>
            <div className="row g-3">
              <div className="col-sm-6">
                <Form.Group>
                  <Form.Label className="fw-semibold small">CIN (Challan Identification Number) *</Form.Label>
                  <Form.Control size="sm" value={paymentForm.cin} onChange={(e) => setPaymentForm(p => ({ ...p, cin: e.target.value }))} placeholder="e.g. 2026112300012345" />
                </Form.Group>
              </div>
              <div className="col-sm-6">
                <Form.Group>
                  <Form.Label className="fw-semibold small">BSR Code *</Form.Label>
                  <Form.Control size="sm" value={paymentForm.bsr_code} onChange={(e) => setPaymentForm(p => ({ ...p, bsr_code: e.target.value }))} placeholder="7-digit BSR code" />
                </Form.Group>
              </div>
              <div className="col-sm-4">
                <Form.Group>
                  <Form.Label className="fw-semibold small">Challan Serial No.</Form.Label>
                  <Form.Control size="sm" value={paymentForm.challan_serial} onChange={(e) => setPaymentForm(p => ({ ...p, challan_serial: e.target.value }))} />
                </Form.Group>
              </div>
              <div className="col-sm-4">
                <Form.Group>
                  <Form.Label className="fw-semibold small">Payment Date *</Form.Label>
                  <Form.Control type="date" size="sm" value={paymentForm.payment_date} onChange={(e) => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} />
                </Form.Group>
              </div>
              <div className="col-sm-4">
                <Form.Group>
                  <Form.Label className="fw-semibold small">Payment Mode</Form.Label>
                  <Form.Select size="sm" value={paymentForm.payment_mode} onChange={(e) => setPaymentForm(p => ({ ...p, payment_mode: e.target.value }))}>
                    <option>Net Banking</option>
                    <option>UPI</option>
                    <option>NEFT</option>
                    <option>RTGS</option>
                    <option>Over the Counter</option>
                  </Form.Select>
                </Form.Group>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
          <Button variant="success" onClick={handleRecordPayment} disabled={savingPayment}>
            {savingPayment ? <Spinner animation="border" size="sm" className="me-1" /> : <IconCheck size={16} className="me-1" />}
            Confirm Payment
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Form 24Q Data Modal */}
      <Modal show={show24QModal} onHide={() => setShow24QModal(false)} centered size="xl">
        <Modal.Header closeButton>
          <Modal.Title className="fs-5"><IconFileText size={20} className="me-2 text-info" />Form 24Q Data — {selectedQuarter} — FY {fy}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loading24Q ? (
            <div className="text-center py-4"><Spinner animation="border" /> Loading 24Q data...</div>
          ) : data24Q ? (
            <div>
              <div className="row g-3 mb-4">
                <div className="col-md-3">
                  <div className="p-2 bg-light rounded">
                    <div className="text-muted small">TAN</div>
                    <div className="fw-bold">{data24Q.tan || "Not configured"}</div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-2 bg-light rounded">
                    <div className="text-muted small">Assessment Year</div>
                    <div className="fw-bold">{data24Q.assessment_year}</div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-2 bg-light rounded">
                    <div className="text-muted small">Total Deductees</div>
                    <div className="fw-bold">{data24Q.total_deductees}</div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-2 bg-primary bg-opacity-10 rounded">
                    <div className="text-muted small">Total TDS</div>
                    <div className="fw-bold text-primary">{formatCurrency(data24Q.total_tds_deducted)}</div>
                  </div>
                </div>
              </div>

              {/* Challan references */}
              {data24Q.challans?.length > 0 && (
                <div className="mb-4">
                  <h6 className="fw-bold small text-uppercase text-muted mb-2">Challan References for {selectedQuarter}</h6>
                  <Table size="sm" className="mb-0" bordered>
                    <thead className="table-light">
                      <tr><th>Month</th><th>CIN</th><th>BSR Code</th><th className="text-end">Amount</th><th>Payment Date</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {data24Q.challans.map((c: any, i: number) => (
                        <tr key={i}>
                          <td>{monthNames[c.month]}</td>
                          <td className="font-monospace small">{c.cin || "—"}</td>
                          <td>{c.bsr_code || "—"}</td>
                          <td className="text-end">{formatCurrency(c.amount)}</td>
                          <td>{c.payment_date || "—"}</td>
                          <td><Badge bg={c.status === "PAID" ? "success" : c.status === "VERIFIED" ? "success" : "warning"}>{c.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}

              {/* Deductee list (PAN mapping) */}
              <h6 className="fw-bold small text-uppercase text-muted mb-2">Deductee Details (PAN ↔ TDS)</h6>
              <div className="table-responsive">
                <Table size="sm" className="mb-0" bordered hover>
                  <thead className="table-light">
                    <tr>
                      <th>#</th>
                      <th>Employee</th>
                      <th>PAN</th>
                      <th className="text-end">Annual Salary</th>
                      <th className="text-end">TDS Deducted ({selectedQuarter})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data24Q.deductees.map((d: any, i: number) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="fw-semibold">{d.employee_name} <span className="text-muted small">({d.employee_id})</span></td>
                        <td className="font-monospace">{d.pan || <span className="text-danger">Missing PAN</span>}</td>
                        <td className="text-end">{formatCurrency(d.annual_salary)}</td>
                        <td className="text-end fw-bold">{formatCurrency(d.tds_deducted)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="table-light">
                    <tr className="fw-bold">
                      <td colSpan={4} className="text-end">Total TDS for {selectedQuarter}:</td>
                      <td className="text-end">{formatCurrency(data24Q.total_tds_deducted)}</td>
                    </tr>
                  </tfoot>
                </Table>
              </div>

              <Alert variant="info" className="mt-3 mb-0 small">
                <IconInfoCircle size={14} className="me-1" />
                Use this data to prepare your Form 24Q filing in the TRACES RPU tool or your tax filing software. The PAN numbers and TDS amounts map each deductee to the government&apos;s records.
              </Alert>
            </div>
          ) : (
            <div className="text-muted text-center py-4">No data available for this quarter.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShow24QModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Form 16 Modal */}
      <Modal show={showForm16Modal} onHide={() => setShowForm16Modal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title className="fs-5"><IconFileText size={20} className="me-2 text-primary" />Form 16 — TDS Certificate</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingForm16 ? (
            <div className="text-center py-4"><Spinner animation="border" /> Generating Form 16...</div>
          ) : form16Data ? (
            <div>
              {/* Part A Header */}
              <div className="border rounded p-3 mb-3 bg-light">
                <h6 className="fw-bold mb-2">Part A — TDS Deposited</h6>
                <div className="row g-2 small">
                  <div className="col-md-6"><span className="text-muted">Employer:</span> <strong>{form16Data.part_a.employer_name}</strong></div>
                  <div className="col-md-6"><span className="text-muted">TAN:</span> <strong className="font-monospace">{form16Data.part_a.employer_tan || "Not configured"}</strong></div>
                  <div className="col-md-6"><span className="text-muted">Employee:</span> <strong>{form16Data.part_a.employee_name}</strong> ({form16Data.part_a.employee_id})</div>
                  <div className="col-md-6"><span className="text-muted">PAN:</span> <strong className="font-monospace">{form16Data.part_a.employee_pan || <span className="text-danger">Missing</span>}</strong></div>
                  <div className="col-md-6"><span className="text-muted">Period:</span> {form16Data.part_a.period}</div>
                  <div className="col-md-6"><span className="text-muted">Assessment Year:</span> {form16Data.assessment_year}</div>
                </div>
              </div>

              {/* Quarter-wise TDS */}
              <h6 className="fw-bold small mb-2">Quarter-wise TDS Summary</h6>
              <Table size="sm" bordered className="mb-3">
                <thead className="table-light">
                  <tr><th>Quarter</th><th className="text-end">TDS Deducted</th></tr>
                </thead>
                <tbody>
                  {Object.entries(form16Data.part_a.quarter_wise_tds || {}).map(([q, amt]: [string, any]) => (
                    <tr key={q}><td>{q}</td><td className="text-end">{formatCurrency(amt)}</td></tr>
                  ))}
                  <tr className="fw-bold table-light">
                    <td>Total</td>
                    <td className="text-end">{formatCurrency(form16Data.part_a.total_tds_deposited)}</td>
                  </tr>
                </tbody>
              </Table>

              {/* Part B */}
              <div className="border rounded p-3 bg-light">
                <h6 className="fw-bold mb-2">Part B — Income & Tax Computation ({form16Data.part_b.regime === "NEW" ? "New Regime" : "Old Regime"})</h6>
                <Table size="sm" className="mb-0">
                  <tbody>
                    <tr><td>Gross Salary</td><td className="text-end fw-semibold">{formatCurrency(form16Data.part_b.gross_salary)}</td></tr>
                    <tr><td>Less: Standard Deduction</td><td className="text-end text-danger">-{formatCurrency(form16Data.part_b.standard_deduction)}</td></tr>
                    {Number(form16Data.part_b.chapter_via_deductions) > 0 && (
                      <tr><td>Less: Chapter VI-A</td><td className="text-end text-danger">-{formatCurrency(form16Data.part_b.chapter_via_deductions)}</td></tr>
                    )}
                    <tr className="table-light"><td className="fw-bold">Taxable Income</td><td className="text-end fw-bold">{formatCurrency(form16Data.part_b.taxable_income)}</td></tr>
                    <tr><td>Tax on Total Income</td><td className="text-end">{formatCurrency(form16Data.part_b.base_tax)}</td></tr>
                    {Number(form16Data.part_b.rebate_87a) > 0 && (
                      <tr className="text-success"><td>Less: Rebate u/s 87A</td><td className="text-end">-{formatCurrency(form16Data.part_b.rebate_87a)}</td></tr>
                    )}
                    <tr><td>Health & Education Cess (4%)</td><td className="text-end">{formatCurrency(form16Data.part_b.cess)}</td></tr>
                    <tr className="table-warning"><td className="fw-bold">Total Tax Liability</td><td className="text-end fw-bold">{formatCurrency(form16Data.part_b.total_tax_liability)}</td></tr>
                    <tr className="table-success"><td className="fw-bold">Total TDS Deducted</td><td className="text-end fw-bold">{formatCurrency(form16Data.part_b.total_tds_deducted)}</td></tr>
                    {Number(form16Data.part_b.balance_tax) > 0 && (
                      <tr className="text-danger"><td className="fw-bold">Balance Tax Payable</td><td className="text-end fw-bold">{formatCurrency(form16Data.part_b.balance_tax)}</td></tr>
                    )}
                    {Number(form16Data.part_b.refund_due) > 0 && (
                      <tr className="text-success"><td className="fw-bold">Refund Due</td><td className="text-end fw-bold">{formatCurrency(form16Data.part_b.refund_due)}</td></tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-muted text-center py-4">Select an employee and generate Form 16.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setShowForm16Modal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Compliance Rules Info Card */}
      <Card className="border-0 shadow-sm mb-4 bg-light">
        <Card.Body>
          <h6 className="fw-bold d-flex align-items-center gap-2 mb-3">
            <IconInfoCircle size={18} className="text-primary" />
            Indian Tax Compliance Reference
          </h6>
          <div className="row g-3">
            <div className="col-md-4">
              <div className="small">
                <strong className="d-block mb-1">TDS (Section 192)</strong>
                <span className="text-muted">
                  Employer deducts income tax monthly using averaging method:
                  (Annual Tax &minus; YTD TDS) &divide; Remaining Months.
                  Due by 7th of next month (Challan 281).
                </span>
              </div>
            </div>
            <div className="col-md-4">
              <div className="small">
                <strong className="d-block mb-1">EPF (12% + 12%)</strong>
                <span className="text-muted">
                  12% employee + 12% employer on Basic+DA.
                  Wage ceiling: &#8377;15,000/mo (max &#8377;1,800/mo each).
                  Due by 15th of next month.
                </span>
              </div>
            </div>
            <div className="col-md-4">
              <div className="small">
                <strong className="d-block mb-1">Professional Tax</strong>
                <span className="text-muted">
                  State-level slab deduction.
                  Maharashtra: &#8377;200/mo for gross &gt; &#8377;10,000.
                  Max &#8377;2,500/year. Due monthly.
                </span>
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>
      </div>{/* end tax-compliance-tables wrapper */}
    </Fragment>
  );
};

export default TaxCompliancePage;
