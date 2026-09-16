"use client";

import { Fragment, useState, useEffect } from "react";
import {
  IconDownload,
  IconSearch,
  IconPlus,
  IconPencil,
  IconCheck,
  IconInfoCircle,
  IconCurrencyRupee,
  IconTrendingUp,
  IconLock,
  IconHistory,
  IconAlertTriangle,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Spinner, Alert, Modal, Button, Form, Badge, Table, Nav } from "react-bootstrap";
import Swal from "sweetalert2";
import PayslipPreview from "components/payroll/PayslipPreview";
import { downloadPayslipPdf } from "components/payroll/payslipPdf";
import { useBranding } from "context/BrandingContext";
import UpcomingIncrementsWidget from "components/UpcomingIncrementsWidget";
import PlanFeatureLockedPaywall from "components/PlanFeatureLockedPaywall";
import ModuleAccessDenied from "components/ModuleAccessDeniedPaywall";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";
import CustomPagination from "components/shared/CustomPagination";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/payroll/`;

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(val));

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
};

const leaveTotal = (summary: any, paymentType: "paid" | "unpaid") =>
  Object.values(summary?.leave_breakdown || {}).reduce(
    (total: number, item: any) => total + Number(item?.[paymentType] || 0),
    0,
  );

const monthsList = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const SalaryPage = () => {
  const branding = useBranding();
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<"payroll" | "increments">("payroll");

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals States
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genMonth, setGenMonth] = useState<number>(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState<number>(new Date().getFullYear());
  const [isGenerating, setIsGenerating] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<any | null>(null);
  const [editBasic, setEditBasic] = useState("");
  const [editAllowances, setEditAllowances] = useState("");
  const [editDeductions, setEditDeductions] = useState("");
  const [editStatus, setEditStatus] = useState("PENDING");
  const [editReason, setEditReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPayroll, setHistoryPayroll] = useState<any | null>(null);

  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [payslipData, setPayslipData] = useState<any | null>(null);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [deductionData, setDeductionData] = useState<any | null>(null);

  // Parse User Credentials
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setIsAdmin(parsed.role === "SUPER_ADMIN" || parsed.role === "HR");
      } catch (err) {
        console.error("Failed to parse user data.", err);
      }
    }
  }, []);

  // Fetch Payroll records
  const fetchPayrolls = async () => {
    const userData = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (userData) {
      try {
        const u = JSON.parse(userData);
        if (u.role === "SUB_ADMIN" && u.permissions?.payroll?.view === false) {
          setIsLoading(false);
          return;
        }
      } catch {}
    }

    setIsLoading(true);
    setError("");
    try {
      const url = new URL(BASE_URL);
      if (selectedMonth) url.searchParams.append("month", String(selectedMonth));
      if (selectedYear) url.searchParams.append("year", String(selectedYear));
      if (searchTerm) url.searchParams.append("search", searchTerm);

      const res = await fetch(url.toString(), { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load payroll list.");
      const data = await res.json();
      setPayrolls(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payroll data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchPayrolls();
  }, [selectedMonth, selectedYear, searchTerm]);

  // Generate Payroll batch
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const res = await fetch(`${BASE_URL}generate/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ month: genMonth, year: genYear }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        try {
          const errData = JSON.parse(errorText);
          throw new Error(errData.detail || "Failed to generate payroll.");
        } catch (e) {
          throw new Error(errorText || "Failed to generate payroll.");
        }
      }
      const result = await res.json();
      Swal.fire({
        title: "Payroll Run Completed",
        html: `
          <div class="text-start">
            <p class="mb-3 text-secondary">The system processed the monthly payroll successfully.</p>
            <div class="d-flex justify-content-between border-bottom py-2">
              <span class="fw-semibold">Generated Paychecks:</span>
              <span class="badge bg-success rounded-pill px-3 py-1 fs-6">${result.generated}</span>
            </div>
            <div class="d-flex justify-content-between border-bottom py-2">
              <span class="fw-semibold">Recalculated Pending Paychecks:</span>
              <span class="badge bg-primary rounded-pill px-3 py-1 fs-6">${result.updated}</span>
            </div>
            <div class="d-flex justify-content-between py-2">
              <span class="fw-semibold">Skipped Paid Paychecks:</span>
              <span class="badge bg-secondary rounded-pill px-3 py-1 fs-6">${result.skipped}</span>
            </div>
          </div>
        `,
        icon: "success",
        confirmButtonText: "Done",
        confirmButtonColor: "#3085d6",
      });
      setShowGenerateModal(false);
      setSelectedMonth(genMonth);
      setSelectedYear(genYear);
      fetchPayrolls();
    } catch (err) {
      Swal.fire({
        title: "Generation Failed",
        text: err instanceof Error ? err.message : "Failed to generate payroll run.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (p: any) => {
    setSelectedPayroll(p);
    setEditBasic(Number(p.basic_salary || 0).toFixed(2));
    setEditAllowances(p.allowances);
    setEditDeductions(p.deductions);
    setEditStatus(p.status);
    setEditReason(p.modification_reason || "");
    setReasonError("");
    setShowEditModal(true);
  };

  // Handle Edit Submit
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayroll) return;

    const isAlreadyPaid = selectedPayroll.status === "PAID";
    const hasChanged =
      Number(editBasic) !== Number(selectedPayroll.basic_salary) ||
      Number(editAllowances) !== Number(selectedPayroll.allowances) ||
      Number(editDeductions) !== Number(selectedPayroll.deductions) ||
      editStatus !== selectedPayroll.status;

    if (isAlreadyPaid && hasChanged) {
      if (!editReason || editReason.trim().length < 5) {
        setReasonError("A valid reason for modification (minimum 5 characters) is required for already paid salary records.");
        return;
      }
    }

    setReasonError("");
    setIsUpdating(true);
    try {
      const res = await fetch(`${BASE_URL}${selectedPayroll.id}/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          employee_id: selectedPayroll.employee_details.id,
          month: selectedPayroll.month,
          year: selectedPayroll.year,
          basic_salary: Number(editBasic),
          allowances: Number(editAllowances),
          deductions: Number(editDeductions),
          status: editStatus,
          modification_reason: editReason.trim(),
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = "Failed to update payroll details.";
        try {
          const errData = JSON.parse(errorText);
          errorMsg =
            typeof errData.modification_reason === "string"
              ? errData.modification_reason
              : Array.isArray(errData.modification_reason)
              ? errData.modification_reason[0]
              : errData.detail || errorMsg;
        } catch {
          errorMsg = errorText || `Server error (${res.status})`;
        }
        throw new Error(errorMsg);
      }
      setShowEditModal(false);
      fetchPayrolls();
      Swal.fire({
        title: "Salary Record Updated",
        text: isAlreadyPaid && hasChanged
          ? "Adjustment successfully saved and logged to the statutory audit trail."
          : "Payroll details updated successfully.",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        title: "Update Failed",
        text: err instanceof Error ? err.message : "Failed to update payroll.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Quick payout mark as PAID
  const quickMarkPaid = async (p: any) => {
    const result = await Swal.fire({
      title: "Confirm Payout",
      text: `Are you sure you want to mark ${p.employee_details.full_name}'s salary as PAID?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#198754",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Mark Paid",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${BASE_URL}${p.id}/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          employee_id: p.employee_details.id,
          month: p.month,
          year: p.year,
          basic_salary: Number(p.basic_salary),
          allowances: Number(p.allowances),
          deductions: Number(p.deductions),
          status: "PAID",
        }),
      });
      if (!res.ok) throw new Error("Failed to process payment status.");
      fetchPayrolls();
      Swal.fire({
        title: "Success",
        text: "Payout marked as PAID successfully.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        title: "Processing Failed",
        text: err instanceof Error ? err.message : "Failed to change payout status.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    }
  };

  const [organization, setOrganization] = useState<any>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);

  // Parse User Credentials & Organization
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setCurrentUser(parsed);
        setIsAdmin(parsed.role === "SUPER_ADMIN" || parsed.role === "HR");
      } catch (err) {
        console.error("Failed to parse user data.", err);
      }
    }
    const orgData = localStorage.getItem("organization");
    if (orgData) {
      try {
        setOrganization(JSON.parse(orgData));
      } catch {}
    }
  }, []);

  const isFeatureLocked =
    organization?.plan_features && organization.plan_features.allows_payroll_reports === false;

  const handleDownloadPdf = async () => {
    if (!payslipData) return;
    await downloadPayslipPdf(payslipData, branding);
  };

  const isSubAdmin = currentUser?.role === "SUB_ADMIN";
  const userPermissions = currentUser?.permissions || {};
  const payrollPerm = userPermissions.payroll;
  const incrementsPerm = userPermissions.increments;

  const hasPayrollPermission = !isSubAdmin || (
    typeof payrollPerm === "object" && payrollPerm !== null
      ? Boolean(payrollPerm.view)
      : Boolean(payrollPerm)
  );

  const hasIncrementsPermission = !isSubAdmin || (
    typeof incrementsPerm === "object" && incrementsPerm !== null
      ? Boolean(incrementsPerm.view)
      : Boolean(incrementsPerm)
  );

  const canEditPayroll = !isSubAdmin || Boolean(payrollPerm?.edit);
  const canEditIncrements = !isSubAdmin || Boolean(incrementsPerm?.edit);

  // Auto-switch to allowed tab if one is restricted
  useEffect(() => {
    if (isSubAdmin) {
      if (!hasPayrollPermission && hasIncrementsPermission) {
        setActiveTab("increments");
      } else if (hasPayrollPermission && !hasIncrementsPermission) {
        setActiveTab("payroll");
      }
    }
  }, [isSubAdmin, hasPayrollPermission, hasIncrementsPermission]);

  if (isSubAdmin && !hasPayrollPermission && !hasIncrementsPermission) {
    return (
      <ModuleAccessDenied
        moduleTitle="Salary & Increments"
        description="You do not have permission to view or manage Salary Payouts or Employee Increments. Please contact your organization administrator to grant you access."
      />
    );
  }

  if (isFeatureLocked) {
    return (
      <PlanFeatureLockedPaywall
        featureTitle="Salary & Payroll Processing"
        featureDescription="Automated monthly salary calculation, deduction engine, and PDF payslip distribution are locked under your current plan."
        benefits={[
          "Instant monthly payroll calculations & bulk disbursement",
          "Automated deduction, overtime & late penalty logic",
          "Official downloadable PDF payslips with company branding",
          "Salary increment history & milestone tracking",
        ]}
        requiredTier="Growth Pro or Enterprise"
      />
    );
  }

  // Pagination calculations
  const totalRecords = payrolls.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const paginatedPayrolls = payrolls.slice(startIndex, endIndex);

  return (
    <Fragment>
      <DasherBreadcrumb />
      <div className="mb-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div>
          <h2 className="mb-0 fw-bold">Salary Management</h2>
          <p className="text-secondary mb-0">Manage employee monthly salaries, generate payslips, and review upcoming salary increments.</p>
        </div>
        {canEditPayroll && activeTab === "payroll" && (
          <button
            className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
            onClick={() => setShowGenerateModal(true)}
          >
            <IconPlus size={18} /> Generate Payroll
          </button>
        )}
      </div>

      {/* Two Main Section Tabs (shown if both available, or appropriate tab) */}
      {(hasPayrollPermission && hasIncrementsPermission) ? (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-2">
            <Nav variant="pills" className="nav-custom-pills gap-2">
              <Nav.Item>
                <Nav.Link
                  as="button"
                  active={activeTab === "payroll"}
                  onClick={() => setActiveTab("payroll")}
                  className="fw-semibold px-4 py-2 cursor-pointer d-flex align-items-center gap-2 border-0"
                >
                  <IconCurrencyRupee size={18} />
                  Salary & Payroll
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link
                  as="button"
                  active={activeTab === "increments"}
                  onClick={() => setActiveTab("increments")}
                  className="fw-semibold px-4 py-2 cursor-pointer d-flex align-items-center gap-2 border-0"
                >
                  <IconTrendingUp size={18} />
                  Employee Salary Increment Management
                </Nav.Link>
              </Nav.Item>
            </Nav>
          </div>
        </div>
      ) : null}

      {error && <Alert variant="danger">{error}</Alert>}

      {activeTab === "payroll" && (
        <div className="card border-0 shadow-sm mb-6">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-0">
          <div className="row g-3 align-items-center">
            {/* Search */}
            <div className="col-md-4">
              <div className="input-group">
                <span className="input-group-text bg-transparent border-end-0">
                  <IconSearch size={18} className="text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 ps-0"
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Month Filter */}
            <div className="col-md-3">
              <select
                className="form-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {monthsList.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div className="col-md-2">
              <select
                className="form-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card-body p-0 mt-3">
          <div className="table-responsive">
            {isLoading ? (
              <div className="d-flex justify-content-center align-items-center py-6">
                <Spinner animation="border" variant="primary" role="status">
                  <span className="visually-hidden">Loading Payroll...</span>
                </Spinner>
              </div>
            ) : (
              <Table hover className="align-middle text-nowrap mb-0" style={{ minWidth: "780px" }}>
                <thead className="table-light">
                  <tr>
                    <th>Employee Name</th>
                    <th>Monthly Salary</th>
                    <th>Allowances</th>
                    <th>Deductions</th>
                    <th>Net Payout</th>
                    <th>Status</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-5 text-secondary">
                        No payroll records found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedPayrolls.map((p) => {
                      const monthlySalary = Number(p.basic_salary || 0);
                      const calculatedDeductions = Number(p.deductions || 0);
                      const netSalary = Number(p.payable_salary ?? p.net_salary ?? 0);

                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="d-flex align-items-center">
                              <img
                                src={p.employee_details.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                                alt=""
                                className="avatar avatar-sm rounded-circle me-3"
                              />
                              <div>
                                <h6 className="mb-0 fw-semibold">{p.employee_details.full_name}</h6>
                                <small className="text-muted">
                                  {p.employee_details.department} • {p.employee_details.designation}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>{formatCurrency(monthlySalary)}</td>
                          <td>{formatCurrency(p.allowances)}</td>
                          <td className="text-danger">
                            -{formatCurrency(calculatedDeductions)}
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => {
                                setDeductionData(p);
                                setShowDeductionModal(true);
                              }}
                              className="d-inline-flex align-items-center gap-1 ms-1 border-0 p-0"
                            >
                              <IconInfoCircle size={16} />
                            </Button>
                          </td>
                          <td>
                            <div className="fw-bold text-success">{formatCurrency(netSalary)}</div>
                            <small className="text-secondary d-block">Paid leave: {leaveTotal(p.attendance_summary, "paid")} day(s)</small>
                            <small className="text-danger">Unpaid days: {Number(p.attendance_summary?.unpaid_days || 0)}</small>
                          </td>
                          <td>
                            {p.status === "PAID" ? (
                              <div className="d-flex flex-column align-items-start gap-1">
                                <Badge bg="success" className="d-inline-flex align-items-center gap-1 px-2 py-1">
                                  <IconLock size={12} /> PAID
                                </Badge>
                                {p.is_modified_after_payment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHistoryPayroll(p);
                                      setShowHistoryModal(true);
                                    }}
                                    className="badge bg-light text-primary border border-primary-subtle d-inline-flex align-items-center gap-1 px-1.5 py-0.5"
                                    title="Click to view change audit trail"
                                    style={{ fontSize: "10px", cursor: "pointer" }}
                                  >
                                    <IconHistory size={11} /> Adjusted
                                  </button>
                                )}
                              </div>
                            ) : (
                              <Badge bg="warning" className="px-2 py-1">
                                PENDING
                              </Badge>
                            )}
                          </td>
                          <td className="text-end">
                            <div className="d-flex justify-content-end gap-2 px-3">
                              {canEditPayroll && p.status === "PENDING" && (
                                <Button
                                  variant="outline-success"
                                  size="sm"
                                  onClick={() => quickMarkPaid(p)}
                                  className="px-2 py-1"
                                >
                                  <IconCheck size={14} className="me-1" /> Pay
                                </Button>
                              )}
                              {canEditPayroll && (
                                <Button
                                  variant={p.status === "PAID" ? "outline-warning" : "outline-primary"}
                                  size="sm"
                                  onClick={() => openEditModal(p)}
                                  className="px-2 py-1 d-flex align-items-center gap-1"
                                  title={p.status === "PAID" ? "Modify paid salary (requires audit justification)" : "Edit payroll"}
                                >
                                  {p.status === "PAID" ? <IconLock size={13} /> : <IconPencil size={13} />}
                                  {p.status === "PAID" ? "Adjust" : "Edit"}
                                </Button>
                              )}
                              {p.is_modified_after_payment && (
                                <Button
                                  variant="outline-info"
                                  size="sm"
                                  onClick={() => {
                                    setHistoryPayroll(p);
                                    setShowHistoryModal(true);
                                  }}
                                  className="px-2 py-1 d-flex align-items-center gap-1"
                                  title="View modification audit history"
                                >
                                  <IconHistory size={13} /> Audit
                                </Button>
                              )}
                              <Button
                                variant="light"
                                size="sm"
                                onClick={() => {
                                  setPayslipData(p);
                                  setShowPayslipModal(true);
                                }}
                                className="d-flex align-items-center gap-1 border px-2 py-1"
                              >
                                <IconDownload size={14} /> Payslip
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            )}
          </div>
        </div>
        {payrolls.length > 0 && (
          <div className="card-footer bg-white border-top py-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <div className="text-muted small">
                Showing <span className="fw-semibold text-dark">{totalRecords > 0 ? startIndex + 1 : 0}</span> to{" "}
                <span className="fw-semibold text-dark">{endIndex}</span> of{" "}
                <span className="fw-semibold text-dark">{totalRecords}</span> employee records
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small">Per page:</span>
                <Form.Select
                  size="sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{ width: "auto" }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </Form.Select>
              </div>
            </div>
            {totalPages > 1 && (
              <CustomPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </div>
        )}
      </div>
      )}

      {activeTab === "increments" && (
        <UpcomingIncrementsWidget canEdit={canEditIncrements} />
      )}

      {/* Generate Payroll Modal */}
      <Modal show={showGenerateModal} onHide={() => setShowGenerateModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">Generate Monthly Payroll Run</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleGenerate}>
          <Modal.Body>
            <p className="text-muted mb-4">
              Select a month and year to generate or recalculate payroll for active employees. The system uses attendance status, auto-marked holidays, Sunday unpaid days, leave, and half-day records to calculate deductions and payable salary.
            </p>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Payroll Month</Form.Label>
              <Form.Select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
              >
                {monthsList.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Payroll Year</Form.Label>
              <Form.Select
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowGenerateModal(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  Generating...
                </>
              ) : (
                "Generate Payouts"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Edit Payroll Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold fs-6 d-flex align-items-center gap-2">
            {selectedPayroll?.status === "PAID" ? (
              <>
                <IconShieldCheck size={20} className="text-warning" />
                Adjust Paid Payroll Record
              </>
            ) : (
              <>
                <IconPencil size={18} className="text-primary" />
                Adjust Payroll Details
              </>
            )}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleUpdate}>
          {selectedPayroll && (
            <Modal.Body>
              <div className="mb-3 border-bottom pb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <h6 className="mb-0 fw-bold">{selectedPayroll.employee_details.full_name}</h6>
                  <small className="text-secondary">
                    Payroll Period: {selectedPayroll.month_name} {selectedPayroll.year} • {selectedPayroll.employee_details.department}
                  </small>
                </div>
                <Badge bg={selectedPayroll.status === "PAID" ? "success" : "warning"} className="px-3 py-1.5 fs-7">
                  {selectedPayroll.status === "PAID" ? "DISBURSED (PAID)" : "PENDING"}
                </Badge>
              </div>

              {selectedPayroll.status === "PAID" && (
                <Alert variant="warning" className="d-flex align-items-start gap-2 border-warning-subtle py-2 px-3 small mb-3">
                  <IconAlertTriangle size={20} className="text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="d-block text-dark">Locked Disbursed Record</strong>
                    <span className="text-secondary">
                      This salary was already marked as <strong>PAID</strong> on{" "}
                      {selectedPayroll.paid_on ? formatDate(selectedPayroll.paid_on) : "record"}. Under accounting compliance, modifying disbursed payroll figures requires a mandatory audit justification.
                    </span>
                  </div>
                </Alert>
              )}

              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <Form.Group>
                    <Form.Label className="fw-semibold small">Basic Salary (INR)</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={editBasic}
                      onChange={(e) => setEditBasic(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>

                <div className="col-md-4">
                  <Form.Group>
                    <Form.Label className="fw-semibold small">Allowances / Bonuses (INR)</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={editAllowances}
                      onChange={(e) => setEditAllowances(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>

                <div className="col-md-4">
                  <Form.Group>
                    <Form.Label className="fw-semibold small">Deductions / LOP (INR)</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={editDeductions}
                      onChange={(e) => setEditDeductions(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>
              </div>

              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <Form.Group>
                    <Form.Label className="fw-semibold small">Payout Status</Form.Label>
                    <Form.Select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="PAID">PAID</option>
                    </Form.Select>
                  </Form.Group>
                </div>
                <div className="col-md-6">
                  <div className="p-2 border rounded bg-light-subtle h-100 d-flex flex-column justify-content-center">
                    <span className="text-muted small">Estimated Net Salary</span>
                    <strong className="text-success fs-5">
                      {formatCurrency(
                        Math.max(0, Number(editBasic || 0) + Number(editAllowances || 0) - Number(editDeductions || 0))
                      )}
                    </strong>
                  </div>
                </div>
              </div>

              {selectedPayroll.status === "PAID" && (
                <Form.Group className="mb-2">
                  <Form.Label className="fw-semibold small text-danger d-flex align-items-center gap-1">
                    Reason for Modification / Audit Remark <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="e.g. Retroactive performance bonus addition / Correction of overtime deduction / TDS tax adjustment approved by finance"
                    value={editReason}
                    onChange={(e) => {
                      setEditReason(e.target.value);
                      if (reasonError) setReasonError("");
                    }}
                    isInvalid={!!reasonError}
                    required
                  />
                  {reasonError && (
                    <div className="text-danger small mt-1">
                      {reasonError}
                    </div>
                  )}
                  <Form.Text className="text-muted small">
                    This justification is permanently stored in the audit trail with your administrator ID and timestamp.
                  </Form.Text>
                </Form.Group>
              )}
            </Modal.Body>
          )}
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowEditModal(false)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button
              variant={selectedPayroll?.status === "PAID" ? "warning" : "primary"}
              type="submit"
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  Saving...
                </>
              ) : selectedPayroll?.status === "PAID" ? (
                "Save & Log Audit Justification"
              ) : (
                "Save Changes"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Audit History Modal */}
      <Modal show={showHistoryModal} onHide={() => setShowHistoryModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold fs-6 d-flex align-items-center gap-2">
            <IconHistory size={20} className="text-primary" />
            Adjustment Audit Trail — {historyPayroll?.employee_details?.full_name} ({historyPayroll?.month_name} {historyPayroll?.year})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {historyPayroll?.modification_history && historyPayroll.modification_history.length > 0 ? (
            <div className="table-responsive">
              <Table bordered hover className="align-middle small mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "22%" }}>Date & Time</th>
                    <th style={{ width: "23%" }}>Modified By</th>
                    <th style={{ width: "30%" }}>Audit Justification</th>
                    <th style={{ width: "25%" }}>Values Altered</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPayroll.modification_history.map((entry: any, index: number) => (
                    <tr key={index}>
                      <td className="text-nowrap">{formatDate(entry.modified_at)}</td>
                      <td>
                        <div className="fw-semibold text-dark">{entry.modified_by_name || "Administrator"}</div>
                        <small className="text-muted">{entry.modified_by_email}</small>
                      </td>
                      <td>
                        <div className="p-2 rounded bg-light border text-break">
                          {entry.reason}
                        </div>
                      </td>
                      <td>
                        <div className="d-flex flex-column gap-1 small">
                          {entry.old_values?.basic_salary !== entry.new_values?.basic_salary && (
                            <div>
                              <span className="text-muted">Basic: </span>
                              <del className="text-danger">{formatCurrency(entry.old_values?.basic_salary)}</del>
                              {" → "}
                              <strong className="text-success">{formatCurrency(entry.new_values?.basic_salary)}</strong>
                            </div>
                          )}
                          {entry.old_values?.allowances !== entry.new_values?.allowances && (
                            <div>
                              <span className="text-muted">Allowances: </span>
                              <del className="text-danger">{formatCurrency(entry.old_values?.allowances)}</del>
                              {" → "}
                              <strong className="text-success">{formatCurrency(entry.new_values?.allowances)}</strong>
                            </div>
                          )}
                          {entry.old_values?.deductions !== entry.new_values?.deductions && (
                            <div>
                              <span className="text-muted">Deductions: </span>
                              <del className="text-danger">{formatCurrency(entry.old_values?.deductions)}</del>
                              {" → "}
                              <strong className="text-success">{formatCurrency(entry.new_values?.deductions)}</strong>
                            </div>
                          )}
                          {entry.old_values?.status !== entry.new_values?.status && (
                            <div>
                              <span className="text-muted">Status: </span>
                              <del>{entry.old_values?.status}</del>
                              {" → "}
                              <strong>{entry.new_values?.status}</strong>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-5 text-muted">
              <IconShieldCheck size={36} className="text-muted opacity-50 mb-2" />
              <p className="mb-0">No post-disbursement modifications have been recorded for this salary.</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowHistoryModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Printable Payslip Modal */}
      <Modal show={showPayslipModal} onHide={() => setShowPayslipModal(false)} size="xl" centered>
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold fs-6">
            {payslipData?.employee_details?.full_name
              ? `Payslip - ${payslipData.employee_details.full_name} - ${payslipData.month_name || payslipData.month} ${payslipData.year}`
              : "Payslip Preview"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3" style={{ background: "#f1f5f9" }}>
          {payslipData && <PayslipPreview payroll={payslipData} />}
        </Modal.Body>
        <Modal.Footer className="border-top">
          <Button variant="outline-secondary" onClick={() => setShowPayslipModal(false)}>
            Close
          </Button>
          <Button variant="outline-dark" onClick={handleDownloadPdf} className="d-flex align-items-center gap-2">
            <IconDownload size={16} /> Download PDF
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Deduction Details Modal */}
      <Modal show={showDeductionModal} onHide={() => setShowDeductionModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">Deduction Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deductionData && (
            <div>
              <p>
                Here is a breakdown of the deductions for{" "}
                <strong>
                  {deductionData.employee_details.full_name} ({deductionData.month_name} {deductionData.year})
                </strong>
                .
              </p>
              <Table striped bordered hover>
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th className="text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {deductionData.deduction_details && Object.keys(deductionData.deduction_details).length > 0 ? (
                    Object.entries(deductionData.deduction_details).map(([reason, amount]) => (
                      <tr key={reason}>
                        <td>{reason.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</td>
                        <td className="text-end">{formatCurrency(amount as number)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="text-center text-muted">
                        No deduction details available.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="table-light">
                  <tr>
                    <td className="fw-bold">Total Deductions</td>
                    <td className="text-end fw-bold">{formatCurrency(deductionData.deductions)}</td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowDeductionModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Fragment>
  );
};

export default SalaryPage;