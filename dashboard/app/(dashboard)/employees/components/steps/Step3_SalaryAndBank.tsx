"use client";

import { EmployeeFormData, EmployeeFormErrors } from "../EmployeeFormWizard";

type StepProps = {
  data: Partial<EmployeeFormData>;
  errors: EmployeeFormErrors;
  onChange: <TKey extends keyof EmployeeFormData>(field: TKey, value: EmployeeFormData[TKey]) => void;
};

const Step3_SalaryAndBank = ({ data, errors, onChange }: StepProps) => {
  return (
    <div>
      <div className="row g-3">
        <div className="col-md-6">
          <label htmlFor="salary" className="form-label">Annual Salary</label>
          <input type="number" min="0" className={`form-control ${errors.annualSalary ? "is-invalid" : ""}`} id="salary" placeholder="Enter annual salary" value={data.annualSalary} onChange={(event) => onChange("annualSalary", event.target.value)} />
          {errors.annualSalary && <div className="invalid-feedback">{errors.annualSalary}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="payFrequency" className="form-label">Pay Frequency</label>
          <select className={`form-select ${errors.payFrequency ? "is-invalid" : ""}`} id="payFrequency" value={data.payFrequency} onChange={(event) => onChange("payFrequency", event.target.value)}>
            <option value="">Select Frequency</option>
            <option value="MONTHLY">Monthly</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BI_WEEKLY">Bi-Weekly</option>
          </select>
          {errors.payFrequency && <div className="invalid-feedback">{errors.payFrequency}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="bankName" className="form-label">Bank Name</label>
          <input type="text" className={`form-control ${errors.bankName ? "is-invalid" : ""}`} id="bankName" placeholder="Enter bank name" value={data.bankName} onChange={(event) => onChange("bankName", event.target.value)} />
          {errors.bankName && <div className="invalid-feedback">{errors.bankName}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="accountNumber" className="form-label">Bank Account Number</label>
          <input type="text" className={`form-control ${errors.bankAccountNumber ? "is-invalid" : ""}`} id="accountNumber" placeholder="Enter account number" value={data.bankAccountNumber} onChange={(event) => onChange("bankAccountNumber", event.target.value)} />
          {errors.bankAccountNumber && <div className="invalid-feedback">{errors.bankAccountNumber}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="ifscCode" className="form-label">IFSC Code</label>
          <input type="text" className={`form-control text-uppercase ${errors.ifscCode ? "is-invalid" : ""}`} id="ifscCode" placeholder="e.g., HDFC0001234" maxLength={11} value={data.ifscCode || ""} onChange={(event) => onChange("ifscCode", event.target.value.toUpperCase().replace(/\s/g, ""))} />
          {errors.ifscCode && <div className="invalid-feedback">{errors.ifscCode}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="taxId" className="form-label">Tax ID / PAN Number</label>
          <input type="text" className={`form-control text-uppercase ${errors.taxId ? "is-invalid" : ""}`} id="taxId" placeholder="Enter Tax ID" value={data.taxId} onChange={(event) => onChange("taxId", event.target.value.toUpperCase())} />
          {errors.taxId && <div className="invalid-feedback">{errors.taxId}</div>}
        </div>

        <div className="col-12 mt-4">
          <div className="card border bg-light-subtle">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h6 className="fw-bold mb-0">Salary Increment Policy Settings</h6>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="overrideIncrement"
                    checked={data.overrideIncrementPolicy || false}
                    onChange={(e) => onChange("overrideIncrementPolicy", e.target.checked)}
                  />
                  <label className="form-check-label fw-semibold" htmlFor="overrideIncrement">
                    Override Company Default Policy
                  </label>
                </div>
              </div>

              {data.overrideIncrementPolicy ? (
                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Increment Interval</label>
                    <select
                      className="form-select form-select-sm"
                      value={data.customIncrementMonths || "12"}
                      onChange={(e) => onChange("customIncrementMonths", e.target.value)}
                    >
                      <option value="1">Every 1 Month</option>
                      <option value="3">Every 3 Months</option>
                      <option value="6">Every 6 Months</option>
                      <option value="9">Every 9 Months</option>
                      <option value="12">Every 12 Months (1 Year)</option>
                      <option value="18">Every 18 Months</option>
                      <option value="24">Every 24 Months (2 Years)</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Calculation Type</label>
                    <select
                      className="form-select form-select-sm"
                      value={data.customIncrementType || "PERCENTAGE"}
                      onChange={(e) => onChange("customIncrementType", e.target.value)}
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FLAT_AMOUNT">Flat Amount (₹)</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Increment Value</label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text">
                        {data.customIncrementType === "FLAT_AMOUNT" ? "₹" : "%"}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        placeholder="Value"
                        value={data.customIncrementValue || ""}
                        onChange={(e) => onChange("customIncrementValue", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="small text-muted">
                  This employee will follow the company global increment policy configured in Company Settings.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step3_SalaryAndBank;
