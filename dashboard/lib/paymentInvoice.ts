import { jsPDF } from "jspdf";

const COLORS = {
  navy: [15, 23, 42] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  panel: [248, 250, 252] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
  blueSoft: [239, 246, 255] as [number, number, number],
  green: [21, 128, 61] as [number, number, number],
  greenSoft: [240, 253, 244] as [number, number, number],
};

function amount(value: number | string, currency = "INR") {
  return `${currency} ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function safeText(value: any, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function formattedDate(value: any, includeTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(
    "en-IN",
    includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }
  );
}

function providerName(value: any) {
  const provider = safeText(value, "Razorpay");
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function numberToIndianWords(value: number | string) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const underHundred = (number: number) =>
    number < 20 ? ones[number] : `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ""}`;
  const underThousand = (number: number) =>
    `${number >= 100 ? `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? " " : ""}` : ""}${underHundred(
      number % 100
    )}`;
  let rupees = Math.floor(Math.abs(Number(value || 0)));
  const paise = Math.round((Math.abs(Number(value || 0)) - rupees) * 100);
  if (rupees > 999999999) return "Amount exceeds supported range";
  const parts: string[] = [];
  const groups = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ] as const;
  groups.forEach(([divisor, name]) => {
    const group = Math.floor(rupees / divisor);
    if (group) {
      parts.push(`${underThousand(group)} ${name}`);
      rupees %= divisor;
    }
  });
  if (rupees) parts.push(underThousand(rupees));
  if (!parts.length) parts.push("Zero");
  return `Indian Rupees ${parts.join(" ")}${paise ? ` and ${underHundred(paise)} Paise` : ""} Only`;
}

function taxComponents(payment: any, issuerStateCode: string) {
  const gst = Number(payment.gst_amount || 0);
  const customerStateCode = safeText(payment.billing_state_code, "");
  if (!gst) return { cgst: 0, sgst: 0, igst: 0, unclassified: 0, customerStateCode };
  if (!issuerStateCode || !customerStateCode) {
    return { cgst: 0, sgst: 0, igst: 0, unclassified: gst, customerStateCode };
  }
  if (issuerStateCode && customerStateCode && issuerStateCode === customerStateCode) {
    const cgst = Math.round((gst / 2) * 100) / 100;
    return { cgst, sgst: Math.round((gst - cgst) * 100) / 100, igst: 0, unclassified: 0, customerStateCode };
  }
  return { cgst: 0, sgst: 0, igst: gst, unclassified: 0, customerStateCode };
}

async function loadLogo(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
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
    };
    image.onerror = () => resolve(null);
    image.src = "/favicon.png";
  });
}

export async function downloadPaymentInvoice(payment: any, organization?: any) {
  if (!payment) {
    throw new Error("An invoice is available only after payment is verified.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const logo = await loadLogo();

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;
  const invoiceDate = payment.paid_at || payment.created_at || new Date();
  const invoiceNumber =
    payment.invoice_number || `ASTK-${new Date(invoiceDate).getFullYear()}-${String(payment.id || 8821).padStart(6, "0")}`;

  const issuer = {
    name: "Bhatt Square Private Limited",
    tradeName: "AttendStack",
    address: "B-1/4, VISHESH KHAND, GOMTI NAGAR, Gomtinagar, Lucknow, Uttar Pradesh 226010",
    email: "support@attendstack.com",
    taxId: "09AALCB7260P1ZX",
    cin: "U68100UP2023PTC184782",
    state: "Uttar Pradesh",
    stateCode: "09",
    sac: "998314",
    website: "https://attendance.nextgenapplication.com/",
    // supportDetails: "Billing support: support@attendstack.com",
    termsText: "Subscription access is governed by AttendStack Terms. Refund eligibility is subject to https://attendance.nextgenapplication.com/refund-policy. Billing support: support@attendstack.com.",
  };

  const customer = {
    name: payment.billing_name || organization?.name || "BHATT SQUARE PVT LTD",
    billing_address: payment.billing_address || organization?.location || "1/4, Vishesh Khand 2, Gomti Nagar, Lucknow, Uttar Pradesh 226010",
    gstin: payment.gstin || "09AALCB7260P1ZX",
    email: payment.email || organization?.owner_email || "hr@bhattsquare.com",
    phone: payment.contact_phone || organization?.phone || "+91 9205983996",
    state: payment.billing_state || "Uttar Pradesh",
    state_code: payment.billing_state_code || "09",
  };

  const subtotal = Number(payment.taxable_amount || payment.amount || 500);
  const discount = Number(payment.discount || 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  const gstRate = 18;
  const gstAmount = Number(payment.gst_amount || (taxableAmount * 0.18));
  const grandTotal = taxableAmount + gstAmount;

  const taxes = taxComponents(
    { ...payment, gst_amount: gstAmount, billing_state_code: customer.state_code },
    issuer.stateCode
  );
  const hasDiscount = discount > 0;

  const setText = (color: [number, number, number], style = "normal", size = 9) => {
    doc.setTextColor(...color);
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };

  const label = (text: string, x: number, y: number) => {
    setText(COLORS.muted, "bold", 7.5);
    doc.text(text.toUpperCase(), x, y);
  };

  const brandAccent = COLORS.blue;
  const charcoal: [number, number, number] = [48, 50, 58];
  const lightGray: [number, number, number] = [242, 242, 242];

  // 1. Registered supplier and statutory identity
  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, 11.5, 20, 20);
    } catch {
      // Ignore
    }
  }
  const supplierX = logo ? margin + 24 : margin;
  setText(COLORS.navy, "bold", 14);
  doc.text(`${issuer.tradeName} Payments`, supplierX, 18.5);
  setText(COLORS.blue, "bold", 7.2);
  doc.text(`Owned and operated by ${issuer.name}`, supplierX, 23);
  setText(COLORS.muted, "normal", 6.6);
  doc.text(`Legal supplier: ${issuer.name}`, supplierX, 27);
  const registeredAddress = doc.splitTextToSize(`Registered address: ${safeText(issuer.address)}`, 82)[0];
  doc.text(registeredAddress, supplierX, 30.5);
  doc.text(`GSTIN: ${safeText(issuer.taxId)}  |  CIN: ${safeText(issuer.cin)}`, supplierX, 34);
  doc.text(`${issuer.email}  |  ${issuer.website}`, supplierX, 37.5);

  // 2. Right side compact payment summary
  const summaryX = 142;
  doc.setDrawColor(...COLORS.line);
  doc.line(summaryX - 7, 14, summaryX - 7, 35.5);
  setText(COLORS.blue, "bold", 7);
  doc.text("ATTENDSTACK PAYMENT", summaryX, 17);
  setText(COLORS.navy, "bold", 7);
  doc.text("Invoice No.", summaryX, 22);
  setText(COLORS.slate, "normal", 7);
  doc.text(invoiceNumber, right, 22, { align: "right" });
  setText(COLORS.navy, "bold", 7);
  doc.text("Invoice Date", summaryX, 27);
  setText(COLORS.slate, "normal", 7);
  doc.text(formattedDate(invoiceDate), right, 27, { align: "right" });
  doc.setFillColor(...COLORS.greenSoft);
  doc.roundedRect(summaryX, 30, 22, 5.5, 2.5, 2.5, "F");
  setText(COLORS.green, "bold", 6.8);
  doc.text("PAID", summaryX + 11, 33.8, { align: "center" });

  // 3. Signature Title Band in SimplyJob Brand Style
  doc.setFillColor(...brandAccent);
  doc.rect(0, 41, pageWidth, 11, "F");
  doc.setFillColor(255, 255, 255);
  doc.rect(112, 37.5, 62, 18, "F");
  setText(charcoal, "normal", 25);
  doc.text("TAX INVOICE", 143, 50.5, { align: "center" });

  // 4. Customer and invoice metadata
  const infoTop = 64;
  label("Bill to", margin, infoTop);
  setText(COLORS.navy, "bold", 11);
  doc.text(safeText(customer.name), margin, infoTop + 8);
  setText(COLORS.slate, "normal", 8.2);
  const billingAddressLines = doc
    .splitTextToSize(safeText(customer.billing_address, "Billing address not provided"), 82)
    .slice(0, 2);
  doc.text(billingAddressLines, margin, infoTop + 14);
  const billingAddressBottom = infoTop + 14 + (billingAddressLines.length - 1) * 4;
  doc.text(`GSTIN: ${safeText(customer.gstin, "Not provided")}`, margin, billingAddressBottom + 6);
  const customerEmail = doc.splitTextToSize(`Email: ${safeText(customer.email)}`, 82)[0];
  doc.text(customerEmail, margin, billingAddressBottom + 12);
  doc.text(`Phone: ${safeText(customer.phone, "Not provided")}`, margin, billingAddressBottom + 18);

  const metaX = 112;
  const metaValueX = 151;
  label("Subscription details", metaX, infoTop);
  const metadataRows = [
    ["Plan", safeText(payment.plan_name || organization?.plan_name || "Growth Pro Plan")],
    [
      "Billing Cycle",
      payment.service_period_start && payment.service_period_end
        ? `${formattedDate(payment.service_period_start)} - ${formattedDate(payment.service_period_end)}`
        : `${formattedDate(new Date())} - ${formattedDate(new Date(Date.now() + 30 * 86400000))}`,
    ],
    ["Subscription ID", safeText(payment.subscription_id || organization?.id || "13")],
  ];
  metadataRows.forEach(([key, value], index) => {
    const y = infoTop + 8 + index * 9;
    setText(COLORS.navy, "bold", 8.2);
    doc.text(key, metaX, y);
    setText(COLORS.slate, "normal", 8.2);
    const valueLines = doc.splitTextToSize(String(value), right - metaValueX).slice(0, 2);
    doc.text(valueLines, metaValueX, y);
  });

  // 5. Structured Line-Item Table
  const tableTop = 105;
  const tableBottom = 143;
  doc.setDrawColor(180, 185, 195);
  doc.rect(margin, tableTop, contentWidth, tableBottom - tableTop, "S");
  doc.setFillColor(...charcoal);
  doc.rect(margin, tableTop, contentWidth, 12, "F");
  setText([255, 255, 255], "bold", 8);
  doc.text("DESCRIPTION", margin + 4, tableTop + 7.8);
  doc.text("SAC", hasDiscount ? 91 : 100, tableTop + 7.8, { align: "center" });
  doc.text("QTY", hasDiscount ? 111 : 122, tableTop + 7.8, { align: "center" });
  doc.text("RATE", hasDiscount ? 136 : 154, tableTop + 7.8, { align: "right" });
  if (hasDiscount) doc.text("DISCOUNT", 161, tableTop + 7.8, { align: "right" });
  doc.text("TAXABLE", right - 3, tableTop + 7.8, { align: "right" });

  doc.setFillColor(...lightGray);
  doc.rect(margin, tableTop + 12, contentWidth, 19, "F");
  setText(COLORS.navy, "normal", 8.5);
  doc.text(safeText(payment.plan_name || "Growth Pro Plan"), margin + 4, tableTop + 20);
  setText(COLORS.muted, "normal", 6.8);
  doc.text("Digital subscription service", margin + 4, tableTop + 25.5);
  setText(COLORS.navy, "normal", 8.2);
  doc.text(safeText(issuer.sac), hasDiscount ? 91 : 100, tableTop + 23, { align: "center" });
  doc.text("1", hasDiscount ? 111 : 122, tableTop + 23, { align: "center" });
  doc.text(amount(subtotal, "INR"), hasDiscount ? 136 : 154, tableTop + 23, { align: "right" });
  if (hasDiscount) doc.text(amount(discount, "INR"), 161, tableTop + 23, { align: "right" });
  doc.text(amount(taxableAmount, "INR"), right - 3, tableTop + 23, { align: "right" });

  // 6. Note and Totals
  const totalsTop = 151;
  setText(COLORS.navy, "bold", 8.5);
  doc.text("Thank you for your business", margin, totalsTop);
  setText(COLORS.muted, "normal", 7.2);
  doc.text(`Place of supply: ${safeText(customer.state, "Uttar Pradesh")}`, margin, totalsTop + 6);
  doc.text("Reverse charge: No", margin, totalsTop + 12);

  const totalsLabelX = 133;
  const taxRows = taxes.unclassified
    ? [[`GST (${gstRate}%):`, amount(taxes.unclassified, "INR")]]
    : [
      [`CGST (9%):`, amount(taxes.cgst || gstAmount / 2, "INR")],
      [`SGST (9%):`, amount(taxes.sgst || gstAmount / 2, "INR")],
      [`IGST (0%):`, amount(taxes.igst || 0, "INR")],
    ];

  const totalRows = [
    ["Subtotal:", amount(subtotal, "INR")],
    ...(hasDiscount ? [["Discount:", `- ${amount(discount, "INR")}`]] : []),
    ["Taxable Value:", amount(taxableAmount, "INR")],
    ...taxRows,
  ];

  totalRows.forEach(([key, value], index) => {
    setText(COLORS.navy, index === 0 ? "bold" : "normal", 8.5);
    doc.text(key, totalsLabelX, totalsTop + index * 8);
    doc.text(value, right, totalsTop + index * 8, { align: "right" });
  });

  const totalCardX = 112;
  const totalCardY = totalsTop + totalRows.length * 8 + 1;
  doc.setFillColor(...brandAccent);
  doc.rect(totalCardX, totalCardY, right - totalCardX, 16, "F");
  setText([255, 255, 255], "bold", 12);
  doc.text("Grand Total:", totalCardX + 5, totalCardY + 10.5);
  doc.text(amount(grandTotal, "INR"), right - 6, totalCardY + 10.5, { align: "right" });
  setText(COLORS.navy, "bold", 7.5);
  doc.text("Amount in words", margin, totalCardY + 7);
  setText(COLORS.slate, "normal", 7);
  doc.text(doc.splitTextToSize(numberToIndianWords(grandTotal), 85), margin, totalCardY + 13);

  // 7. Terms & Conditions and Payment Details
  const lowerTop = 229;
  label("Terms & conditions", margin, lowerTop);
  setText(COLORS.muted, "normal", 6.8);
  const termsCopy =
    issuer.termsText ||
    `Subscription access is governed by AttendStack Terms. Refund eligibility is subject to the published Refund Policy. Billing support: ${issuer.email}.`;
  const terms = doc.splitTextToSize(termsCopy, 82);
  doc.text(terms, margin, lowerTop + 7);

  label("Payment details", margin, lowerTop + 23);
  setText(COLORS.slate, "normal", 7.2);
  doc.text(`Method: ${providerName(payment.provider)}`, margin, lowerTop + 30);
  doc.text(`Payment date: ${formattedDate(payment.paid_at || new Date(), true)}`, margin, lowerTop + 36);
  doc.text(
    `Razorpay payment ID: ${safeText(payment.provider_payment_id || "pay_TRa39fwdvMtbOp")}`,
    margin,
    lowerTop + 42
  );
  doc.text(
    `Razorpay order ID: ${safeText(payment.provider_order_id || "order_TRa2mALbLAbc5B")}`,
    margin,
    lowerTop + 48
  );

  // 8. Electronic Issue Mark
  doc.setDrawColor(150, 155, 165);
  doc.line(132, lowerTop + 35, 178, lowerTop + 35);
  setText(COLORS.navy, "bold", 7.5);
  doc.text("Computer-generated invoice", 155, lowerTop + 42, { align: "center" });
  setText(COLORS.muted, "normal", 6.5);
  doc.text("No physical signature required", 155, lowerTop + 47, { align: "center" });

  // 9. Footer Stripe & Page Number
  doc.setFillColor(...brandAccent);
  doc.rect(0, pageHeight - 10, 128, 1.2, "F");
  doc.rect(181, pageHeight - 10, pageWidth - 181, 1.2, "F");
  setText(COLORS.navy, "bold", 7.3);
  doc.text(`${issuer.email}   |   ${issuer.website}`, margin, pageHeight - 4.5);
  doc.text("Page 1 of 1", right, pageHeight - 4.5, { align: "right" });

  doc.setProperties({
    title: `Invoice ${invoiceNumber}`,
    subject: `AttendStack payment invoice for ${payment.plan_name}`,
    author: issuer.name,
    creator: "AttendStack Billing",
  });

  doc.save(`AttendStack-Invoice-${invoiceNumber}.pdf`);
}
