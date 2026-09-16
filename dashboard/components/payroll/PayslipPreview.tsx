"use client";

import { useEffect, useState } from "react";
import { useBranding } from "context/BrandingContext";
import { getPayslipLogoDisplayUrl } from "./logoUrl";

type PayslipPreviewProps = {
  payroll: any;
  title?: string;
};

const formatCurrency = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return value || "-";
  }
};

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

const dash = (value?: string | number | null) =>
  value === null || value === undefined || String(value).trim() === "" ? "-" : String(value);

const maskAadhaar = (val?: string | null) => {
  if (!val || val.length < 4) return dash(val);
  return `XXXX-XXXX-${val.slice(-4)}`;
};

const maskAccount = (val?: string | null) => {
  if (!val || val.length < 4) return dash(val);
  return `XXXX-XXXX-${val.slice(-4)}`;
};

const buildPayslipNo = (payroll: any) => {
  const employeeId = payroll.employee_details?.employee_id || "EMP";
  const month = String(payroll.month || "").padStart(2, "0");
  return `PS-${payroll.year || "YYYY"}${month}-${employeeId}`;
};

const numberToIndianWords = (amount: number): string => {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const underHundred = (n: number) =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;

  const underThousand = (n: number) =>
    `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? " " : ""}` : ""}${underHundred(n % 100)}`;

  let rupees = Math.floor(Math.abs(Number(amount || 0)));
  const paise = Math.round((Math.abs(Number(amount || 0)) - rupees) * 100);

  if (rupees === 0) return "Zero Rupees Only";
  if (rupees > 999999999) return "Amount exceeds supported limit";

  const parts: string[] = [];
  const groups: [number, string][] = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ];

  groups.forEach(([divisor, name]) => {
    const count = Math.floor(rupees / divisor);
    if (count) {
      parts.push(`${underThousand(count)} ${name}`);
      rupees %= divisor;
    }
  });

  if (rupees) parts.push(underThousand(rupees));

  return `Indian Rupees ${parts.join(" ")}${paise ? ` and ${underHundred(paise)} Paise` : ""} Only`;
};

const PayslipPreview = ({ payroll }: PayslipPreviewProps) => {
  const branding = useBranding();
  const [logoFailed, setLogoFailed] = useState(false);

  // Merge company details from backend payroll object and BrandingContext
  const companyDetails = payroll.company_details || {};
  const companyName = companyDetails.company_name || branding.companyName || "AttendStack";
  const companyAddress = companyDetails.company_address || branding.companyAddress || "";
  const companyEmail = companyDetails.company_email || branding.companyEmail || "";
  const companyPhone = companyDetails.company_phone || branding.companyPhone || "";
  const companyWebsite = companyDetails.company_website || branding.companyWebsite || "";
  const taxId = companyDetails.tax_id || branding.taxId || "";
  const registrationNumber = companyDetails.registration_number || branding.registrationNumber || "";
  const rawLogo = companyDetails.company_logo || branding.companyLogo;
  const logoUrl = getPayslipLogoDisplayUrl(rawLogo);

  const employee = payroll.employee_details || {};
  const deductionRows = Object.entries(payroll.deduction_details || {});
  const basicSalary = Number(payroll.basic_salary || 0);
  const allowances = Number(payroll.allowances || 0);
  const grossEarnings = basicSalary + allowances;
  const totalDeductions = Number(payroll.deductions || 0);
  const netPay = Number(payroll.payable_salary ?? payroll.net_salary ?? 0);
  const status = (payroll.status || "PENDING").toUpperCase();
  const period = `${payroll.month_name || payroll.month || ""} ${payroll.year || ""}`.trim();
  const payslipNo = buildPayslipNo(payroll);

  const attendance = payroll.attendance_summary || {};
  const daysInMonth = attendance.days_in_month || 30;
  const unpaidDays = attendance.unpaid_days || 0;
  const paidDays = Math.max(0, daysInMonth - unpaidDays);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  // Construct earnings list for side-by-side table
  const earningsList: { label: string; amount: number }[] = [
    { label: "Basic Salary", amount: basicSalary },
    { label: "House Rent Allowance (HRA) & Allowances", amount: allowances },
  ];

  // Construct deductions list
  const deductionsList: { label: string; amount: number }[] = [];
  if (deductionRows.length > 0) {
    deductionRows.forEach(([reason, amount]) => {
      deductionsList.push({ label: titleCase(reason), amount: Number(amount || 0) });
    });
  } else {
    deductionsList.push({ label: "Loss of Pay / Standard Deductions", amount: totalDeductions });
  }

  // Balance rows count so earnings & deductions rows match visually
  const maxRows = Math.max(earningsList.length, deductionsList.length, 3);
  while (earningsList.length < maxRows) {
    earningsList.push({ label: "-", amount: 0 });
  }
  while (deductionsList.length < maxRows) {
    deductionsList.push({ label: "-", amount: 0 });
  }

  return (
    <div id="payslip-print-area" className="formal-payslip">
      {/* ─── 1. CORPORATE LETTERHEAD ─── */}
      <div className="payslip-header-box">
        <div className="header-left">
          {logoUrl && !logoFailed ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="formal-logo-img"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="formal-logo-placeholder">
              {(companyName || "A").slice(0, 1)}
            </div>
          )}
          <div className="company-details">
            <h1 className="formal-company-title">{companyName}</h1>
            {companyAddress && <p className="formal-company-address">{companyAddress}</p>}
            <div className="formal-statutory-row">
              {taxId && <span><strong>GSTIN:</strong> {taxId}</span>}
              {registrationNumber && <span><strong>CIN:</strong> {registrationNumber}</span>}
              {companyEmail && <span><strong>Email:</strong> {companyEmail}</span>}
              {companyPhone && <span><strong>Phone:</strong> {companyPhone}</span>}
              {companyWebsite && <span><strong>Website:</strong> {companyWebsite}</span>}
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="document-heading">PAYSLIP</div>
          <div className="document-subheading">{period.toUpperCase()}</div>
          <div className="document-meta-item">
            <span>Payslip No:</span>
            <strong>{payslipNo}</strong>
          </div>
          <div className="document-meta-item">
            <span>Status:</span>
            <strong className={status === "PAID" ? "text-paid" : "text-pending"}>{status}</strong>
          </div>
        </div>
      </div>

      {/* ─── 2. TITLE BAR ─── */}
      <div className="formal-title-bar">
        <span>SALARY SLIP FOR THE MONTH OF {period.toUpperCase()}</span>
      </div>

      {/* ─── 3. EMPLOYEE & BANK DETAILS GRID (STANDARD CORPORATE MATRIX) ─── */}
      <table className="formal-grid-table">
        <tbody>
          <tr>
            <td className="grid-label">Employee Name</td>
            <td className="grid-val fw-bold">{dash(employee.full_name)}</td>
            <td className="grid-label">Employee ID</td>
            <td className="grid-val font-mono">{dash(employee.employee_id)}</td>
          </tr>
          <tr>
            <td className="grid-label">Designation</td>
            <td className="grid-val">{dash(employee.designation)}</td>
            <td className="grid-label">Department</td>
            <td className="grid-val">{dash(employee.department)}</td>
          </tr>
          <tr>
            <td className="grid-label">Date of Joining</td>
            <td className="grid-val">{formatDate(employee.joining_date)}</td>
            <td className="grid-label">Employment Type</td>
            <td className="grid-val">{dash(employee.employment_type_display || employee.employment_type)}</td>
          </tr>
          <tr>
            <td className="grid-label">Bank Name</td>
            <td className="grid-val">{dash(employee.bank_name)}</td>
            <td className="grid-label">Bank Account No.</td>
            <td className="grid-val font-mono">{maskAccount(employee.bank_account_number)}</td>
          </tr>
          <tr>
            <td className="grid-label">IFSC Code</td>
            <td className="grid-val font-mono">{dash(employee.ifsc_code)}</td>
            <td className="grid-label">PAN Number</td>
            <td className="grid-val font-mono">{dash(employee.pan_number || employee.tax_id)}</td>
          </tr>
          <tr>
            <td className="grid-label">P.F. A/C Number</td>
            <td className="grid-val font-mono">{dash(employee.pf_number)}</td>
            <td className="grid-label">UAN Number</td>
            <td className="grid-val font-mono">{dash(employee.uan_number)}</td>
          </tr>
          <tr>
            <td className="grid-label">Aadhaar / ID No.</td>
            <td className="grid-val font-mono">{maskAadhaar(employee.aadhaar_number)}</td>
            <td className="grid-label">Paid / LOP Days</td>
            <td className="grid-val">
              {paidDays} / {daysInMonth} Days {unpaidDays > 0 ? `(${unpaidDays} LOP)` : ""}
            </td>
          </tr>
          <tr>
            <td className="grid-label">Payment Date</td>
            <td className="grid-val">{payroll.paid_on ? formatDate(payroll.paid_on) : "Pending"}</td>
            <td className="grid-label">Disbursement Mode</td>
            <td className="grid-val">{employee.bank_name ? "Bank Transfer (NEFT/IMPS)" : "Standard Payroll"}</td>
          </tr>
        </tbody>
      </table>

      {/* ─── 4. SALARY COMPUTATION TABLE (JOINT LEDGER) ─── */}
      <div className="ledger-table-wrap">
        <table className="formal-ledger-table">
          <thead>
            <tr>
              <th className="th-earning">EARNINGS</th>
              <th className="th-amount text-end">AMOUNT (₹)</th>
              <th className="th-deduction">DEDUCTIONS</th>
              <th className="th-amount text-end">AMOUNT (₹)</th>
            </tr>
          </thead>
          <tbody>
            {earningsList.map((earn, idx) => {
              const ded = deductionsList[idx];
              return (
                <tr key={idx}>
                  <td className="td-desc">{earn.label}</td>
                  <td className="td-num text-end">
                    {earn.label === "-" ? "-" : formatCurrency(earn.amount)}
                  </td>
                  <td className="td-desc">{ded?.label || "-"}</td>
                  <td className="td-num text-end">
                    {!ded || ded.label === "-" ? "-" : formatCurrency(ded.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td className="fw-bold">Total Gross Earnings</td>
              <td className="text-end fw-bold">{formatCurrency(grossEarnings)}</td>
              <td className="fw-bold">Total Deductions</td>
              <td className="text-end fw-bold">{formatCurrency(totalDeductions)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ─── 5. NET SALARY SUMMARY BOX ─── */}
      <div className="net-pay-box">
        <div className="net-pay-row">
          <div className="net-pay-left">
            <span className="net-pay-caption">NET TAKE-HOME SALARY</span>
            <div className="net-pay-figure">{formatCurrency(netPay)}</div>
          </div>
          <div className="net-pay-right">
            <div className="calc-item">
              <span>Gross Earnings:</span>
              <strong>{formatCurrency(grossEarnings)}</strong>
            </div>
            <div className="calc-item">
              <span>Total Deductions:</span>
              <strong>- {formatCurrency(totalDeductions)}</strong>
            </div>
            <div className="calc-item total-line">
              <span>Net Payable:</span>
              <strong>{formatCurrency(netPay)}</strong>
            </div>
          </div>
        </div>
        <div className="net-words-row">
          <strong>Amount in Words:</strong> <span>{numberToIndianWords(netPay)}</span>
        </div>
      </div>

      {/* ─── 6. SIGNATURES & AUTHORIZATION ─── */}
      <div className="formal-signatures-box">
        <div className="signature-col">
          <div className="sig-line" />
          <div className="sig-name">{dash(employee.full_name)}</div>
          <div className="sig-designation">Employee Signature</div>
        </div>

        <div className="signature-col text-end">
          <div className="sig-line" />
          <div className="sig-name">For {companyName}</div>
          <div className="sig-designation">Authorized Signatory</div>
        </div>
      </div>

      {/* ─── 7. STATUTORY DISCLAIMER FOOTER ─── */}
      <div className="formal-footer">
        {payroll.is_modified_after_payment && payroll.modification_reason && (
          <p className="footer-note" style={{ color: "#b45309", fontWeight: 600 }}>
            * Post-Disbursement Audit Remark: {payroll.modification_reason}
          </p>
        )}
        <p className="footer-note">
          * Note: This document is an official electronically generated salary voucher issued by {companyName}. It is valid for all statutory, banking, visa, and income tax declaration purposes.
        </p>
        <div className="footer-bottom-line">
          <span>{companyEmail ? `Contact: ${companyEmail}` : "HR & Payroll Department"}</span>
          <span>Confidential Document</span>
          <span>Generated via AttendStack</span>
        </div>
      </div>

      {/* ─── FORMAL CORPORATE CSS STYLING ─── */}
      <style jsx global>{`
        .formal-payslip {
          background: #ffffff;
          border: 1px solid #d1d5db;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
          color: #111827;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 11px;
          line-height: 1.4;
          margin: 0 auto;
          max-width: 100%;
          min-height: 297mm;
          padding: 24px 28px;
          position: relative;
          width: 210mm;
          box-sizing: border-box;
        }

        /* 1. Header Box */
        .payslip-header-box {
          border-bottom: 2px solid #1e293b;
          display: flex;
          justify-content: space-between;
          padding-bottom: 14px;
          gap: 16px;
        }

        .header-left {
          display: flex;
          gap: 14px;
          flex: 1;
          min-width: 0;
        }

        .formal-logo-img {
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          height: 52px;
          width: 52px;
          object-fit: contain;
          padding: 3px;
          background: #ffffff;
          flex-shrink: 0;
        }

        .formal-logo-placeholder {
          background: #1e293b;
          color: #ffffff;
          border-radius: 4px;
          font-size: 22px;
          font-weight: 800;
          height: 52px;
          width: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .company-details {
          min-width: 0;
        }

        .formal-company-title {
          color: #0f172a;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.2px;
          margin: 0 0 2px;
          line-height: 1.2;
        }

        .formal-company-address {
          color: #4b5563;
          font-size: 9.5px;
          margin: 0 0 4px;
          line-height: 1.35;
          max-width: 380px;
        }

        .formal-statutory-row {
          color: #4b5563;
          display: flex;
          flex-wrap: wrap;
          font-size: 9px;
          gap: 4px 10px;
        }

        .formal-statutory-row strong {
          color: #111827;
        }

        .header-right {
          text-align: right;
          flex-shrink: 0;
        }

        .document-heading {
          color: #0f172a;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.5px;
          line-height: 1;
        }

        .document-subheading {
          color: #4b5563;
          font-size: 10px;
          font-weight: 700;
          margin: 2px 0 6px;
        }

        .document-meta-item {
          font-size: 9.5px;
          color: #4b5563;
          margin-top: 1px;
        }

        .document-meta-item span {
          margin-right: 4px;
        }

        .document-meta-item strong {
          color: #111827;
        }

        .text-paid {
          color: #15803d !important;
          font-weight: 800;
        }

        .text-pending {
          color: #b45309 !important;
          font-weight: 800;
        }

        /* 2. Title Bar */
        .formal-title-bar {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-top: none;
          color: #0f172a;
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.5px;
          padding: 6px 10px;
          text-align: center;
          margin-bottom: 12px;
        }

        /* 3. Employee Grid Table */
        .formal-grid-table {
          border: 1px solid #cbd5e1;
          border-collapse: collapse;
          margin-bottom: 14px;
          width: 100%;
        }

        .formal-grid-table td {
          border: 1px solid #cbd5e1;
          padding: 5px 8px;
          vertical-align: middle;
        }

        .grid-label {
          background: #f8fafc;
          color: #475569;
          font-size: 9.5px;
          font-weight: 700;
          width: 20%;
        }

        .grid-val {
          color: #0f172a;
          font-size: 10px;
          width: 30%;
        }

        .font-mono {
          font-family: Consolas, Monaco, monospace;
        }

        /* 4. Ledger Table */
        .ledger-table-wrap {
          margin-bottom: 14px;
        }

        .formal-ledger-table {
          border: 1px solid #cbd5e1;
          border-collapse: collapse;
          width: 100%;
        }

        .formal-ledger-table th {
          background: #e2e8f0;
          border: 1px solid #cbd5e1;
          color: #0f172a;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.4px;
          padding: 6px 8px;
        }

        .th-earning,
        .th-deduction {
          width: 35%;
          text-align: left;
        }

        .th-amount {
          width: 15%;
        }

        .formal-ledger-table td {
          border: 1px solid #e2e8f0;
          padding: 5.5px 8px;
          font-size: 10px;
        }

        .td-desc {
          color: #334155;
        }

        .td-num {
          color: #0f172a;
          font-weight: 600;
        }

        .total-row td {
          background: #f8fafc;
          border-top: 2px solid #cbd5e1;
          color: #0f172a;
          font-size: 10.5px;
          padding: 7px 8px;
        }

        /* 5. Net Salary Box */
        .net-pay-box {
          background: #f8fafc;
          border: 1.5px solid #cbd5e1;
          border-radius: 4px;
          padding: 10px 14px;
          margin-bottom: 24px;
        }

        .net-pay-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 8px;
        }

        .net-pay-caption {
          color: #475569;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.5px;
          display: block;
        }

        .net-pay-figure {
          color: #0f172a;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.3px;
          margin-top: 1px;
        }

        .net-pay-right {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 220px;
        }

        .calc-item {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          color: #4b5563;
        }

        .calc-item strong {
          color: #0f172a;
        }

        .calc-item.total-line {
          border-top: 1px dashed #cbd5e1;
          padding-top: 3px;
          margin-top: 2px;
          font-weight: 800;
        }

        .calc-item.total-line strong {
          color: #15803d;
          font-size: 10.5px;
        }

        .net-words-row {
          padding-top: 6px;
          font-size: 9.5px;
          color: #334155;
        }

        .net-words-row strong {
          color: #0f172a;
        }

        /* 6. Signatures */
        .formal-signatures-box {
          display: flex;
          justify-content: space-between;
          margin-top: 32px;
          padding: 0 8px;
        }

        .signature-col {
          min-width: 180px;
        }

        .sig-line {
          border-top: 1px solid #64748b;
          margin-bottom: 6px;
        }

        .sig-name {
          color: #0f172a;
          font-size: 10px;
          font-weight: 700;
        }

        .sig-designation {
          color: #64748b;
          font-size: 9px;
        }

        /* 7. Footer */
        .formal-footer {
          border-top: 1px solid #cbd5e1;
          margin-top: 24px;
          padding-top: 8px;
        }

        .footer-note {
          color: #64748b;
          font-size: 8.5px;
          font-style: italic;
          margin: 0 0 6px;
          line-height: 1.35;
        }

        .footer-bottom-line {
          display: flex;
          justify-content: space-between;
          font-size: 8.5px;
          color: #94a3b8;
          font-weight: 600;
        }

        /* ─── A4 PRINT PERFECTION ─── */
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          html,
          body {
            background: #ffffff !important;
            height: 100%;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #payslip-print-area,
          #payslip-print-area * {
            visibility: visible !important;
          }
          #payslip-print-area {
            border: none !important;
            box-shadow: none !important;
            height: 297mm !important;
            left: 0 !important;
            margin: 0 !important;
            max-height: 297mm !important;
            max-width: 210mm !important;
            min-height: 297mm !important;
            overflow: hidden !important;
            padding: 20mm 15mm !important;
            position: absolute !important;
            top: 0 !important;
            width: 210mm !important;
          }
          .modal-header,
          .modal-footer,
          .btn-close {
            display: none !important;
          }
          .modal-content,
          .modal-dialog,
          .modal {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            overflow: visible !important;
          }
          .formal-title-bar,
          .grid-label,
          .formal-ledger-table th,
          .total-row td,
          .net-pay-box {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PayslipPreview;
