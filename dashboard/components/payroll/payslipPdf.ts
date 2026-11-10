import { getPayslipLogoDisplayUrl } from "./logoUrl";

type PdfOptions = {
  companyName?: string | null;
  companyLogo?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyWebsite?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
};

const COLORS = {
  navy: [15, 23, 42] as [number, number, number],
  charcoal: [30, 41, 59] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  borderLight: [226, 232, 240] as [number, number, number],
  panelHeader: [226, 232, 240] as [number, number, number],
  labelBg: [248, 250, 252] as [number, number, number],
  green: [21, 128, 61] as [number, number, number],
  amber: [180, 83, 9] as [number, number, number],
};

const formatCurrencyPdf = (value: number | string | null | undefined) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const safeText = (value: unknown, fallback = "-") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const maskString = (val?: string | null) => {
  if (!val || val.length < 4) return safeText(val);
  return `XXXX-XXXX-${val.slice(-4)}`;
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

async function loadLogo(logoUrl?: string | null): Promise<string | null> {
  if (!logoUrl || typeof window === "undefined") return null;
  const resolved = getPayslipLogoDisplayUrl(logoUrl);
  if (!resolved) return null;

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(image, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = resolved;
  });
}

export const payslipFileName = (payroll: any) => {
  const employeeId = safeText(payroll.employee_details?.employee_id, "EMP").replace(/\s+/g, "-");
  const month = safeText(payroll.month_name || payroll.month, "payroll").replace(/\s+/g, "-");
  const year = safeText(payroll.year, "YYYY");
  return `Payslip-${employeeId}-${month}-${year}.pdf`;
};

export const downloadPayslipPdf = async (payroll: any, options: PdfOptions = {}) => {
  const [{ jsPDF }, logo] = await Promise.all([
    import("jspdf"),
    loadLogo(options.companyLogo || payroll.company_details?.company_logo),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;

  const companyDetails = payroll.company_details || {};
  const companyName = safeText(companyDetails.company_name || options.companyName, "ZuperHR");
  const companyAddress = safeText(companyDetails.company_address || options.companyAddress, "");
  const companyEmail = safeText(companyDetails.company_email || options.companyEmail, "");
  const companyPhone = safeText(companyDetails.company_phone || options.companyPhone, "");
  const companyWebsite = safeText(companyDetails.company_website || options.companyWebsite, "");
  const taxId = safeText(companyDetails.tax_id || options.taxId, "");
  const registrationNumber = safeText(companyDetails.registration_number || options.registrationNumber, "");

  const employee = payroll.employee_details || {};
  const basicSalary = Number(payroll.basic_salary || 0);
  const allowances = Number(payroll.allowances || 0);
  const grossEarnings = basicSalary + allowances;
  const totalDeductions = Number(payroll.deductions || 0);
  const netPay = Number(payroll.payable_salary ?? payroll.net_salary ?? 0);
  const status = (payroll.status || "PENDING").toUpperCase();
  const period = `${payroll.month_name || payroll.month || ""} ${payroll.year || ""}`.trim();
  const payslipNo = `PS-${payroll.year || "YYYY"}${String(payroll.month || "").padStart(2, "0")}-${safeText(employee.employee_id, "EMP")}`;

  const attendance = payroll.attendance_summary || {};
  const daysInMonth = attendance.days_in_month || 30;
  const unpaidDays = attendance.unpaid_days || 0;
  const paidDays = Math.max(0, daysInMonth - unpaidDays);
  const deductionRows = Object.entries(payroll.deduction_details || {});

  // Statutory deductions from payroll record
  const tds = Number(payroll.tds || 0);
  const epfEmployee = Number(payroll.epf_employee || 0);
  const epfEmployer = Number(payroll.epf_employer || 0);
  const esiEmployee = Number(payroll.esi_employee || 0);
  const esiEmployer = Number(payroll.esi_employer || 0);
  const professionalTax = Number(payroll.professional_tax || 0);
  const totalStatutory = Number(payroll.total_statutory_deduction || 0);
  const annualSalary = Number(employee.annual_salary || 0);
  const hasStatutory = totalStatutory > 0 || annualSalary > 0;

  // Tax computation from annual salary (New Regime FY 2026-27)
  const stdDeduction = Math.min(75000, annualSalary);
  const taxableIncome = Math.max(0, annualSalary - stdDeduction);
  const taxSlabs = [
    { from: 0, to: 400000, rate: 0, label: "0 - 4L" },
    { from: 400000, to: 800000, rate: 5, label: "4L - 8L" },
    { from: 800000, to: 1200000, rate: 10, label: "8L - 12L" },
    { from: 1200000, to: 1600000, rate: 15, label: "12L - 16L" },
    { from: 1600000, to: 2000000, rate: 20, label: "16L - 20L" },
    { from: 2000000, to: 2400000, rate: 25, label: "20L - 24L" },
    { from: 2400000, to: Infinity, rate: 30, label: "Above 24L" },
  ];
  let baseTax = 0;
  const slabDetails: { label: string; rate: string; amount: number }[] = [];
  for (const s of taxSlabs) {
    if (taxableIncome <= s.from) {
      slabDetails.push({ label: s.label, rate: `${s.rate}%`, amount: 0 });
      continue;
    }
    const upper = s.to === Infinity ? taxableIncome : s.to;
    const taxableInSlab = Math.min(taxableIncome, upper) - s.from;
    const taxInSlab = Math.max(0, taxableInSlab) * s.rate / 100;
    baseTax += taxInSlab;
    slabDetails.push({ label: s.label, rate: `${s.rate}%`, amount: Math.round(taxInSlab * 100) / 100 });
  }
  baseTax = Math.round(baseTax * 100) / 100;
  const rebate87a = (taxableIncome <= 1200000) ? Math.min(baseTax, 60000) : 0;
  const taxAfterRebate = Math.max(0, baseTax - rebate87a);
  const cess = Math.round(taxAfterRebate * 4) / 100;
  const totalAnnualTax = Math.round((taxAfterRebate + cess) * 100) / 100;

  const setTextColor = (color: [number, number, number]) => doc.setTextColor(...color);
  const setDrawColor = (color: [number, number, number]) => doc.setDrawColor(...color);
  const setFillColor = (color: [number, number, number]) => doc.setFillColor(...color);

  // ─── 1. CORPORATE LETTERHEAD ───
  const headerTop = 14;
  let textLeft = margin;

  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, headerTop, 16, 16);
      textLeft = margin + 19;
    } catch {
      textLeft = margin;
    }
  }

  // Company Name
  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(companyName, textLeft, headerTop + 4.5);

  // Address
  let currY = headerTop + 8.5;
  if (companyAddress) {
    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const addrLines = doc.splitTextToSize(companyAddress, 100).slice(0, 2);
    doc.text(addrLines, textLeft, currY);
    currY += addrLines.length * 3.4;
  }

  // Statutory line
  setTextColor(COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  const statItems = [];
  if (taxId) statItems.push(`GSTIN: ${taxId}`);
  if (registrationNumber) statItems.push(`CIN: ${registrationNumber}`);
  if (companyEmail) statItems.push(companyEmail);
  if (companyPhone) statItems.push(companyPhone);
  if (statItems.length > 0) {
    doc.text(statItems.join("  |  "), textLeft, currY);
  }

  // Right Side Header Box
  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PAYSLIP", right, headerTop + 4.5, { align: "right" });

  setTextColor(COLORS.slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(period.toUpperCase(), right, headerTop + 9, { align: "right" });

  setTextColor(COLORS.slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Payslip No: ${payslipNo}`, right, headerTop + 13, { align: "right" });

  setTextColor(status === "PAID" ? COLORS.green : COLORS.amber);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text(`Status: ${status}`, right, headerTop + 17, { align: "right" });

  // Divider line
  setDrawColor(COLORS.navy);
  doc.setLineWidth(0.5);
  doc.line(margin, headerTop + 20, right, headerTop + 20);
  doc.setLineWidth(0.2);

  // ─── 2. FORMAL TITLE BAR ───
  const titleY = headerTop + 22.5;
  setFillColor([241, 245, 249]);
  setDrawColor(COLORS.border);
  doc.rect(margin, titleY, contentWidth, 6, "FD");

  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.text(
    `SALARY SLIP FOR THE MONTH OF ${period.toUpperCase()}`,
    pageWidth / 2,
    titleY + 4.2,
    { align: "center" }
  );

  // ─── 3. EMPLOYEE & BANK DETAILS MATRIX TABLE ───
  const matrixTop = titleY + 7.5;
  const col1W = 38;
  const col2W = 53;
  const col3W = 38;
  const col4W = contentWidth - col1W - col2W - col3W; // ~53mm
  const rowH = 5.2;

  const matrixRows = [
    ["Employee Name", safeText(employee.full_name), "Employee ID", safeText(employee.employee_id)],
    ["Designation", safeText(employee.designation), "Department", safeText(employee.department)],
    ["Date of Joining", formatDate(employee.joining_date), "Employment Type", safeText(employee.employment_type_display || employee.employment_type)],
    ["Bank Name", safeText(employee.bank_name), "Bank Account No.", maskString(employee.bank_account_number)],
    ["IFSC Code", safeText(employee.ifsc_code), "PAN Number", safeText(employee.pan_number || employee.tax_id)],
    ["P.F. A/C Number", safeText(employee.pf_number), "UAN Number", safeText(employee.uan_number)],
    ["Aadhaar / ID No.", maskString(employee.aadhaar_number), "Paid / LOP Days", `${paidDays} / ${daysInMonth} Paid${unpaidDays > 0 ? ` (${unpaidDays} LOP)` : ""}`],
    ["Payment Date", payroll.paid_on ? formatDate(payroll.paid_on) : "Pending", "Disbursement Mode", employee.bank_name ? "Bank Transfer" : "Standard Payroll"],
  ];

  matrixRows.forEach((r, idx) => {
    const y = matrixTop + idx * rowH;

    // Col 1 (Label)
    setFillColor(COLORS.labelBg);
    setDrawColor(COLORS.border);
    doc.rect(margin, y, col1W, rowH, "FD");
    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(r[0], margin + 2.5, y + 3.6);

    // Col 2 (Value)
    setFillColor([255, 255, 255]);
    doc.rect(margin + col1W, y, col2W, rowH, "FD");
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", idx === 0 ? "bold" : "normal");
    doc.setFontSize(7);
    doc.text(r[1], margin + col1W + 2.5, y + 3.6);

    // Col 3 (Label)
    setFillColor(COLORS.labelBg);
    doc.rect(margin + col1W + col2W, y, col3W, rowH, "FD");
    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(r[2], margin + col1W + col2W + 2.5, y + 3.6);

    // Col 4 (Value)
    setFillColor([255, 255, 255]);
    doc.rect(margin + col1W + col2W + col3W, y, col4W, rowH, "FD");
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(r[3], margin + col1W + col2W + col3W + 2.5, y + 3.6);
  });

  // ─── 4. SALARY COMPUTATION 4-COLUMN TABLE ───
  const ledgerTop = matrixTop + matrixRows.length * rowH + 4;
  const leadColW = (contentWidth / 2) - 25; // ~66mm
  const leadAmtW = 25; // 25mm

  // Header Row
  setFillColor(COLORS.panelHeader);
  setDrawColor(COLORS.border);
  doc.rect(margin, ledgerTop, leadColW, 6.5, "FD");
  doc.rect(margin + leadColW, ledgerTop, leadAmtW, 6.5, "FD");
  doc.rect(margin + leadColW + leadAmtW, ledgerTop, leadColW, 6.5, "FD");
  doc.rect(margin + leadColW * 2 + leadAmtW, ledgerTop, leadAmtW, 6.5, "FD");

  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("EARNINGS", margin + 3, ledgerTop + 4.5);
  doc.text("AMOUNT (Rs.)", margin + leadColW + leadAmtW - 3, ledgerTop + 4.5, { align: "right" });
  doc.text("DEDUCTIONS", margin + leadColW + leadAmtW + 3, ledgerTop + 4.5);
  doc.text("AMOUNT (Rs.)", right - 3, ledgerTop + 4.5, { align: "right" });

  // Build items rows
  const earnItems = [
    ["Basic Salary", formatCurrencyPdf(basicSalary)],
    ["House Rent Allowance (HRA) & Allowances", formatCurrencyPdf(allowances)],
  ];

  const dedItems: [string, string][] = [];
  if (deductionRows.length > 0) {
    deductionRows.forEach(([reason, amt]) => {
      dedItems.push([titleCase(reason), formatCurrencyPdf(amt as number)]);
    });
  } else {
    dedItems.push(["Loss of Pay / Standard Deductions", formatCurrencyPdf(totalDeductions)]);
  }

  const maxTableRows = Math.max(earnItems.length, dedItems.length, 3);
  while (earnItems.length < maxTableRows) earnItems.push(["-", "-"]);
  while (dedItems.length < maxTableRows) dedItems.push(["-", "-"]);

  const itemRowH = 5.5;
  earnItems.forEach((earn, idx) => {
    const ded = dedItems[idx];
    const y = ledgerTop + 6.5 + idx * itemRowH;

    setFillColor([255, 255, 255]);
    setDrawColor(COLORS.borderLight);
    doc.rect(margin, y, leadColW, itemRowH, "FD");
    doc.rect(margin + leadColW, y, leadAmtW, itemRowH, "FD");
    doc.rect(margin + leadColW + leadAmtW, y, leadColW, itemRowH, "FD");
    doc.rect(margin + leadColW * 2 + leadAmtW, y, leadAmtW, itemRowH, "FD");

    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(earn[0], margin + 3, y + 3.8);

    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(earn[1], margin + leadColW + leadAmtW - 3, y + 3.8, { align: "right" });

    setTextColor(COLORS.slate);
    doc.text(ded[0], margin + leadColW + leadAmtW + 3, y + 3.8);

    setTextColor(COLORS.navy);
    doc.text(ded[1], right - 3, y + 3.8, { align: "right" });
  });

  // Total Row
  const totalY = ledgerTop + 6.5 + maxTableRows * itemRowH;
  setFillColor(COLORS.labelBg);
  setDrawColor(COLORS.border);
  doc.rect(margin, totalY, leadColW, 6.5, "FD");
  doc.rect(margin + leadColW, totalY, leadAmtW, 6.5, "FD");
  doc.rect(margin + leadColW + leadAmtW, totalY, leadColW, 6.5, "FD");
  doc.rect(margin + leadColW * 2 + leadAmtW, totalY, leadAmtW, 6.5, "FD");

  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Total Gross Earnings", margin + 3, totalY + 4.5);
  doc.text(formatCurrencyPdf(grossEarnings), margin + leadColW + leadAmtW - 3, totalY + 4.5, { align: "right" });
  doc.text("Total Deductions", margin + leadColW + leadAmtW + 3, totalY + 4.5);
  doc.text(formatCurrencyPdf(totalDeductions), right - 3, totalY + 4.5, { align: "right" });

  // ─── 4B. STATUTORY DEDUCTIONS & TAX COMPUTATION ───
  const statSectionTop = totalY + 4;
  const halfW = contentWidth / 2;
  const statRowH = 4.8;

  if (hasStatutory) {
    // Section header bar
    setFillColor([241, 245, 249]);
    setDrawColor(COLORS.border);
    doc.rect(margin, statSectionTop, contentWidth, 6, "FD");
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("STATUTORY DEDUCTIONS & TAX COMPUTATION", pageWidth / 2, statSectionTop + 4.2, { align: "center" });

    const bodyTop = statSectionTop + 7;

    // ── LEFT: Statutory Deductions ──
    const leftX = margin;
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Monthly Statutory Deductions", leftX + 2, bodyTop + 3);
    setDrawColor(COLORS.borderLight);
    doc.line(leftX, bodyTop + 4.5, leftX + halfW - 2, bodyTop + 4.5);

    const statItems2: [string, string][] = [
      ["TDS (Income Tax)", formatCurrencyPdf(tds)],
      ["EPF (Employee 12%)", formatCurrencyPdf(epfEmployee)],
      ["ESI (Employee 0.75%)", formatCurrencyPdf(esiEmployee)],
      ["Professional Tax", formatCurrencyPdf(professionalTax)],
    ];

    let sy = bodyTop + 7;
    doc.setFontSize(6.8);
    statItems2.forEach(([label, val]) => {
      setTextColor(COLORS.slate);
      doc.setFont("helvetica", "normal");
      doc.text(label, leftX + 3, sy);
      setTextColor(COLORS.navy);
      doc.text(val, leftX + halfW - 5, sy, { align: "right" });
      sy += statRowH;
    });

    // Total statutory line
    setDrawColor(COLORS.border);
    doc.line(leftX + 2, sy - 1, leftX + halfW - 4, sy - 1);
    sy += 1.5;
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Total Employee Statutory", leftX + 3, sy);
    doc.text(formatCurrencyPdf(totalStatutory), leftX + halfW - 5, sy, { align: "right" });
    sy += statRowH + 1;

    // Employer contributions
    setTextColor(COLORS.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.text("Employer Contributions (not deducted from salary):", leftX + 3, sy);
    sy += statRowH;
    doc.setFont("helvetica", "normal");
    doc.text(`EPF Employer: ${formatCurrencyPdf(epfEmployer)}`, leftX + 3, sy);
    doc.text(`ESI Employer: ${formatCurrencyPdf(esiEmployer)}`, leftX + 50, sy);

    // ── RIGHT: Tax Computation ──
    const rightX = margin + halfW + 2;
    const rightColEnd = right;
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Annual Tax Computation (New Regime)", rightX + 2, bodyTop + 3);
    setDrawColor(COLORS.borderLight);
    doc.line(rightX, bodyTop + 4.5, rightColEnd, bodyTop + 4.5);

    let ty = bodyTop + 7;
    doc.setFontSize(6.8);

    // Gross salary
    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "normal");
    doc.text("Gross Annual Salary", rightX + 2, ty);
    setTextColor(COLORS.navy);
    doc.text(formatCurrencyPdf(annualSalary), rightColEnd - 2, ty, { align: "right" });
    ty += statRowH;

    // Standard deduction
    setTextColor(COLORS.slate);
    doc.text("Less: Standard Deduction (Sec 16(ia))", rightX + 2, ty);
    setTextColor(COLORS.navy);
    doc.text(`- ${formatCurrencyPdf(stdDeduction)}`, rightColEnd - 2, ty, { align: "right" });
    ty += statRowH;

    // Taxable income
    setDrawColor(COLORS.borderLight);
    doc.line(rightX + 2, ty - 1, rightColEnd - 2, ty - 1);
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.text("Taxable Income", rightX + 2, ty + 1);
    doc.text(formatCurrencyPdf(taxableIncome), rightColEnd - 2, ty + 1, { align: "right" });
    ty += statRowH + 1;

    // Slab breakdown (compact)
    setTextColor(COLORS.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.2);
    doc.text("Tax Slab Rates:", rightX + 2, ty);
    ty += 3.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    for (const s of slabDetails) {
      if (s.amount > 0) {
        setTextColor(COLORS.slate);
        doc.text(`${s.label} @ ${s.rate}`, rightX + 4, ty);
        setTextColor(COLORS.navy);
        doc.text(formatCurrencyPdf(s.amount), rightColEnd - 2, ty, { align: "right" });
        ty += 3.2;
      }
    }

    // Base tax
    doc.setFontSize(6.8);
    setDrawColor(COLORS.borderLight);
    doc.line(rightX + 2, ty, rightColEnd - 2, ty);
    ty += 2;
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.text("Tax on Slabs", rightX + 2, ty);
    doc.text(formatCurrencyPdf(baseTax), rightColEnd - 2, ty, { align: "right" });
    ty += statRowH;

    // Rebate
    if (rebate87a > 0) {
      setTextColor(COLORS.green);
      doc.setFont("helvetica", "normal");
      doc.text("Less: Section 87A Rebate", rightX + 2, ty);
      doc.text(`- ${formatCurrencyPdf(rebate87a)}`, rightColEnd - 2, ty, { align: "right" });
      ty += statRowH;
    } else if (taxableIncome > 1200000) {
      setTextColor(COLORS.muted);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.text("87A Rebate: Not applicable (taxable > 12L)", rightX + 2, ty);
      doc.setFontSize(6.8);
      ty += statRowH;
    }

    // Cess
    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "normal");
    doc.text("Health & Education Cess (4%)", rightX + 2, ty);
    setTextColor(COLORS.navy);
    doc.text(formatCurrencyPdf(cess), rightColEnd - 2, ty, { align: "right" });
    ty += statRowH;

    // Total annual tax
    setDrawColor(COLORS.border);
    doc.line(rightX + 2, ty - 1, rightColEnd - 2, ty - 1);
    ty += 1;
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Total Annual Tax", rightX + 2, ty);
    doc.text(formatCurrencyPdf(totalAnnualTax), rightColEnd - 2, ty, { align: "right" });
    ty += statRowH + 1;

    // Monthly TDS
    setTextColor(COLORS.slate);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text("Monthly TDS (Sec 192)", rightX + 2, ty);
    setTextColor(COLORS.navy);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrencyPdf(tds), rightColEnd - 2, ty, { align: "right" });
  }

  // Dynamic height of section 4B
  const statSectionH = hasStatutory ? 72 : 0;

  // ─── 5. NET SALARY SUMMARY BOX ───
  const netBoxTop = totalY + 4 + statSectionH + 4;
  const netBoxH = 26;
  setFillColor(COLORS.labelBg);
  setDrawColor(COLORS.border);
  doc.rect(margin, netBoxTop, contentWidth, netBoxH, "FD");

  // Left Net amount
  setTextColor(COLORS.slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("NET TAKE-HOME SALARY", margin + 4, netBoxTop + 5);

  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(formatCurrencyPdf(netPay), margin + 4, netBoxTop + 12);

  // In Words
  setTextColor(COLORS.charcoal);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(`In Words: ${numberToIndianWords(netPay)}`, margin + 4, netBoxTop + 20);

  // Right Breakdown (now with statutory line)
  const rightCalcX = right - 65;
  setTextColor(COLORS.slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text("Gross Earnings:", rightCalcX, netBoxTop + 5);
  doc.text(formatCurrencyPdf(grossEarnings), right - 4, netBoxTop + 5, { align: "right" });

  doc.text("Attendance Deductions:", rightCalcX, netBoxTop + 9);
  doc.text(`- ${formatCurrencyPdf(totalDeductions)}`, right - 4, netBoxTop + 9, { align: "right" });

  doc.text("Statutory Deductions:", rightCalcX, netBoxTop + 13);
  doc.text(`- ${formatCurrencyPdf(totalStatutory)}`, right - 4, netBoxTop + 13, { align: "right" });

  setDrawColor(COLORS.border);
  doc.line(rightCalcX, netBoxTop + 15, right - 4, netBoxTop + 15);

  setTextColor(COLORS.green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Net Payable:", rightCalcX, netBoxTop + 19.5);
  doc.text(formatCurrencyPdf(netPay), right - 4, netBoxTop + 19.5, { align: "right" });

  // ─── 6. FORMAL SIGNATURES BLOCK ───
  const sigTop = netBoxTop + netBoxH + 18;
  const sigW = 55;

  setDrawColor(COLORS.charcoal);
  doc.setLineWidth(0.3);
  doc.line(margin + 4, sigTop, margin + 4 + sigW, sigTop);
  doc.line(right - 4 - sigW, sigTop, right - 4, sigTop);
  doc.setLineWidth(0.2);

  setTextColor(COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text(safeText(employee.full_name), margin + 4, sigTop + 4.5);
  doc.text(`For ${companyName}`, right - 4, sigTop + 4.5, { align: "right" });

  setTextColor(COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Employee Signature", margin + 4, sigTop + 8);
  doc.text("Authorized Signatory", right - 4, sigTop + 8, { align: "right" });

  // ─── 7. STATUTORY FOOTER ───
  const footerY = pageHeight - 12;
  setDrawColor(COLORS.border);
  doc.line(margin, footerY, right, footerY);

  setTextColor(COLORS.muted);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6);
  doc.text(
    `* Note: This document is an official electronically generated salary voucher issued by ${companyName} and does not require a physical signature.`,
    pageWidth / 2,
    footerY + 3.8,
    { align: "center" }
  );

  const footerLinks = [];
  if (companyEmail) footerLinks.push(`HR Support: ${companyEmail}`);
  if (companyWebsite) footerLinks.push(companyWebsite);
  footerLinks.push("Confidential - ZuperHR Payroll");

  doc.setFont("helvetica", "normal");
  doc.text(footerLinks.join("   |   "), margin, footerY + 7.5);
  doc.text("Page 1 of 1", right, footerY + 7.5, { align: "right" });

  // ─── 8. PDF METADATA & SAVE ───
  doc.setProperties({
    title: `Payslip - ${safeText(employee.full_name)} - ${period}`,
    subject: `Official Salary Voucher for ${period}`,
    author: companyName,
    creator: "ZuperHR Enterprise Payroll",
  });

  doc.save(payslipFileName(payroll));
};
