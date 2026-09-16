"use client";

import { EmployeeFormData } from "../EmployeeFormWizard";

const ReviewItem = ({ label, value }: { label: string; value: string | undefined }) => (
  <div className="row py-2">
    <div className="col-sm-5 text-muted">{label}</div>
    <div className="col-sm-7">
      <span className="fw-bold">{value || "Not Provided"}</span>
    </div>
  </div>
);

const humanize = (value: string) => {
  const labels: Record<string, string> = {
    FULL_TIME: "Full-time",
    PART_TIME: "Part-time",
    CONTRACT: "Contract",
    INTERN: "Intern",
    MONTHLY: "Monthly",
    WEEKLY: "Weekly",
    BI_WEEKLY: "Bi-Weekly",
  };
  return labels[value] || value;
};

const Step4_ReviewAndSubmit = ({ data }: { data: Partial<EmployeeFormData> }) => {
  return (
    <div>
      <h4 className="mb-4 text-center">Review Your Information</h4>
      <div className="card">
        <div className="card-body p-4">
          <h5 className="mb-3">Personal Information</h5>
          <ReviewItem label="Full Name" value={data.fullName} />
          <ReviewItem label="Email Address" value={data.email} />
          <ReviewItem label="Phone Number" value={data.phone} />
          <ReviewItem label="Date of Birth" value={data.dateOfBirth} />
          <ReviewItem label="Aadhaar Number" value={data.aadhaarNumber} />
          <ReviewItem label="Address" value={data.address} />
          <ReviewItem label="Profile Photo" value={data.profilePhoto?.name} />
          <ReviewItem label="Aadhaar Document" value={data.aadhaarDocument?.name} />
          <ReviewItem label="PAN Card" value={data.panCardDocument?.name || (data.panCardDocumentUrl ? "Current document" : undefined)} />
          <ReviewItem label="CV / Resume" value={data.cvDocument?.name || (data.cvDocumentUrl ? "Current document" : undefined)} />

          <hr className="my-4" />

          <h5 className="mb-3">Emergency Contact</h5>
          <ReviewItem label="Contact Name" value={data.emergencyContactName} />
          <ReviewItem label="Relationship" value={data.emergencyContactRelationship} />
          <ReviewItem label="Contact Phone" value={data.emergencyContactPhone} />

          <hr className="my-4" />

          <h5 className="mb-3">Employment Details</h5>
          <ReviewItem label="Employee ID" value={data.employeeId || "Auto-Generated on save"} />
          <ReviewItem label="Joining Date" value={data.joiningDate} />
          <ReviewItem label="Department" value={data.department} />
          <ReviewItem label="Designation" value={data.designation} />
          <ReviewItem label="Employment Type" value={humanize(data.employmentType || "")} />
          <ReviewItem label="Reporting Manager" value={data.reportingManager} />

          <hr className="my-4" />

          <h5 className="mb-3">Salary & Bank Details</h5>
          <ReviewItem label="Annual Salary" value={data.annualSalary ? `Rs. ${data.annualSalary}` : undefined} />
          <ReviewItem label="Pay Frequency" value={humanize(data.payFrequency || "")} />
          <ReviewItem label="Bank Name" value={data.bankName} />
          <ReviewItem label="Account Number" value={data.bankAccountNumber} />
          <ReviewItem label="IFSC Code" value={data.ifscCode} />
          <ReviewItem label="Tax ID / PAN" value={data.taxId} />
        </div>
      </div>

      <div className="alert alert-info mt-4">
        Please review all the information carefully before submitting.
      </div>
    </div>
  );
};

export default Step4_ReviewAndSubmit;
