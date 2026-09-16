"use client";

import { Fragment, useState, useEffect } from "react";
import { IconDownload, IconInfoCircle } from "@tabler/icons-react";
import { Spinner, Alert, Badge, Table, Button, Modal, Row, Col } from "react-bootstrap";
import PayslipPreview from "components/payroll/PayslipPreview";
import { downloadPayslipPdf } from "components/payroll/payslipPdf";
import { useBranding } from "context/BrandingContext";
import EmployeeIncrementWidget from "components/EmployeeIncrementWidget";

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

const formatDays = (val: number | string | undefined) =>
  Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });

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

const MySalaryClient = () => {
  const branding = useBranding();
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [employeeProfile, setEmployeeProfile] = useState<any | null>(null);

  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [payslipData, setPayslipData] = useState<any | null>(null);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [deductionData, setDeductionData] = useState<any | null>(null);

  // Load employee profile from localStorage to render CTC details
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setEmployeeProfile(parsed);
      } catch (err) {
        console.error("Failed to parse user session.", err);
      }
    }
  }, []);

  // Fetch only this employee's payrolls
  const fetchMyPayrolls = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(BASE_URL, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load your payroll history.");
      const data = await res.json();
      setPayrolls(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payrolls.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyPayrolls();
  }, []);

  const handleDownloadPdf = async () => {
    if (!payslipData) return;
    await downloadPayslipPdf(payslipData, branding);
  };

  const annualSalary = payrolls[0]?.employee_details?.annual_salary || 0;
  const monthlyEst = annualSalary ? Number(annualSalary) / 12 : 0;
  const lastGeneratedDate = payrolls[0]?.created_at;

  return (
    <Fragment>
      <div className="card border-0 shadow-sm mb-5">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-0">
          <h4 className="mb-0 fw-bold text-dark">My Salary & Pay History</h4>
          <p className="text-secondary small mb-0">View your current salary profile, generation dates, and download monthly payslip summaries.</p>
        </div>
        <div className="card-body">
          {error && <Alert variant="danger">{error}</Alert>}

          <Row className="g-4 mb-4">
            <Col lg={3} md={6}>
              <div className="p-3 border rounded bg-light-subtle">
                <span className="text-muted d-block small fw-semibold text-uppercase mb-1">Annual CTC</span>
                <strong className="fs-4 text-dark">
                  {annualSalary ? formatCurrency(annualSalary) : "Fetching profile..."}
                </strong>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="p-3 border rounded bg-light-subtle">
                <span className="text-muted d-block small fw-semibold text-uppercase mb-1">Monthly Salary</span>
                <strong className="fs-4 text-dark">
                  {monthlyEst ? formatCurrency(monthlyEst) : "Fetching profile..."}
                </strong>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="p-3 border rounded bg-light-subtle">
                <span className="text-muted d-block small fw-semibold text-uppercase mb-1">Pay Frequency</span>
                <strong className="fs-4 text-primary">Monthly</strong>
              </div>
            </Col>
            <Col lg={3} md={6}>
              <div className="p-3 border rounded bg-light-subtle">
                <span className="text-muted d-block small fw-semibold text-uppercase mb-1">Last Salary Generated</span>
                <strong className="fs-6 text-dark d-block text-truncate">
                  {lastGeneratedDate ? formatDate(lastGeneratedDate) : "No record yet"}
                </strong>
              </div>
            </Col>
          </Row>

          <hr className="my-4 text-muted opacity-25" />

          <h5 className="fw-bold text-dark mb-3">Recent Salary Statements</h5>
          
          <div className="table-responsive">
            {isLoading ? (
              <div className="d-flex justify-content-center align-items-center py-5">
                <Spinner animation="border" variant="primary" role="status">
                  <span className="visually-hidden">Loading Statements...</span>
                </Spinner>
              </div>
            ) : payrolls.length === 0 ? (
              <div className="text-center py-5 text-secondary border rounded bg-light-subtle">
                No salary statements have been generated for your profile yet.
              </div>
            ) : (
              <Table hover responsive className="align-middle text-nowrap mb-0" style={{ minWidth: "720px" }}>
                <thead className="table-light">
                  <tr>
                    <th>Payroll Period</th>
                    <th>Monthly Salary</th>
                    <th>Allowances</th>
                    <th>Deductions</th>
                    <th>Net Payout</th>
                    <th>Status</th>
                    <th className="text-end">Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-semibold text-dark">
                        {p.month_name} {p.year}
                      </td>
                      <td>{formatCurrency(p.basic_salary)}</td>
                      <td>{formatCurrency(p.allowances)}</td>
                      <td className="text-danger">
                        -{formatCurrency(p.deductions)}
                        <Button
                          type="button"
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
                        <div className="fw-bold text-success">{formatCurrency(p.payable_salary ?? p.net_salary)}</div>
                        <small className="text-secondary d-block">Paid leave: {formatDays(leaveTotal(p.attendance_summary, "paid"))} day(s)</small>
                        <small className="text-danger">Unpaid days: {formatDays(p.attendance_summary?.unpaid_days)}</small>
                      </td>
                      <td>
                        <Badge bg={p.status === "PAID" ? "success" : "warning"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="text-end">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => {
                            setPayslipData(p);
                            setShowPayslipModal(true);
                          }}
                          className="d-flex align-items-center gap-1 ms-auto border px-3 py-1"
                        >
                          <IconDownload size={14} /> Payslip
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      </div>

      {/* Printable Payslip Modal */}
      <Modal show={showPayslipModal} onHide={() => setShowPayslipModal(false)} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">My Payslip Voucher</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-light-subtle">
          {payslipData && <PayslipPreview payroll={payslipData} title="My Payslip Voucher" />}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowPayslipModal(false)}>
            Close
          </Button>
          <Button variant="outline-primary" onClick={handleDownloadPdf} className="d-flex align-items-center gap-2">
            <IconDownload size={18} /> Download PDF
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
                  {deductionData.month_name} {deductionData.year}
                </strong>
                .
              </p>
              {deductionData.attendance_summary?.leave_breakdown && (
                <Alert variant="info" className="small">
                  <strong>Approved leave included in payroll:</strong>{" "}
                  {Object.entries(deductionData.attendance_summary.leave_breakdown).map(([type, values]: [string, any]) => (
                    <span key={type} className="me-3 text-capitalize">
                      {type}: {formatDays(values.paid)} paid / {formatDays(values.unpaid)} unpaid
                    </span>
                  ))}
                </Alert>
              )}
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
                        <td>{reason}</td>
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

      {/* Employee Increment Growth Timeline */}
      <EmployeeIncrementWidget />
    </Fragment>
  );
};

export default MySalaryClient;