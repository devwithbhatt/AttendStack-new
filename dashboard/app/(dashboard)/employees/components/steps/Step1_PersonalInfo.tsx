"use client";

import { useEffect, useState } from "react";
import { EmployeeFormData, EmployeeFormErrors } from "../EmployeeFormWizard";

type StepProps = {
  data: Partial<EmployeeFormData>;
  errors: EmployeeFormErrors;
  onChange: <TKey extends keyof EmployeeFormData>(field: TKey, value: EmployeeFormData[TKey]) => void;
};

const Step1_PersonalInfo = ({ data, errors, onChange }: StepProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    // This effect should only handle File objects, not URL strings.
    if (data.profilePhoto && data.profilePhoto instanceof File) {
      const objectUrl = URL.createObjectURL(data.profilePhoto);
      setPreviewUrl(objectUrl);

      // Cleanup function to revoke the object URL
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      // If there's no new file, there's no object URL to manage.
      setPreviewUrl(null);
    }
  }, [data.profilePhoto]);

  return (
    <div>
      <div className="mb-4 text-center">
        <img
          src={previewUrl || data.profilePhotoUrl || "/images/avatar/avatar-fallback.jpg"}
          alt="Profile Preview"
          className="avatar avatar-xl rounded-circle mb-3"
        />
        <div>
          <label htmlFor="profilePhoto" className="btn btn-sm btn-secondary">
            Upload Photo
          </label>
          <input
            type="file"
            className="d-none"
            id="profilePhoto"
            accept="image/*"
            onChange={(event) => onChange("profilePhoto", event.target.files?.[0] || null)}
          />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <label htmlFor="fullName" className="form-label">Full Name</label>
          <input type="text" className={`form-control ${errors.fullName ? "is-invalid" : ""}`} id="fullName" placeholder="Enter full name" value={data.fullName || ""} onChange={(event) => onChange("fullName", event.target.value)} />
          {errors.fullName && <div className="invalid-feedback">{errors.fullName}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="email" className="form-label">Email Address</label>
          <input type="email" className={`form-control ${errors.email ? "is-invalid" : ""}`} id="email" placeholder="Enter email address" value={data.email || ""} onChange={(event) => onChange("email", event.target.value)} />
          {errors.email && <div className="invalid-feedback">{errors.email}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="phone" className="form-label">Phone Number</label>
          <input type="tel" className={`form-control ${errors.phone ? "is-invalid" : ""}`} id="phone" placeholder="Enter phone number" value={data.phone || ""} onChange={(event) => onChange("phone", event.target.value)} />
          {errors.phone && <div className="invalid-feedback">{errors.phone}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="dob" className="form-label">Date of Birth</label>
          <input type="date" className="form-control" id="dob" value={data.dateOfBirth || ""} onChange={(event) => onChange("dateOfBirth", event.target.value)} />
        </div>
        <div className="col-md-6">
          <label htmlFor="aadhaar" className="form-label">Aadhaar Number</label>
          <input type="text" className={`form-control ${errors.aadhaarNumber ? "is-invalid" : ""}`} id="aadhaar" placeholder="Enter 12-digit Aadhaar number" value={data.aadhaarNumber || ""} onChange={(event) => onChange("aadhaarNumber", event.target.value.replace(/\D/g, "").slice(0, 12))} />
          {errors.aadhaarNumber && <div className="invalid-feedback">{errors.aadhaarNumber}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="aadhaarUpload" className="form-label">Upload Aadhaar</label>
          <input className="form-control" type="file" id="aadhaarUpload" accept=".pdf,image/*" onChange={(event) => onChange("aadhaarDocument", event.target.files?.[0] || null)} />
          <small className="text-secondary">{data.aadhaarDocument?.name || (data.aadhaarDocumentUrl ? "Current Aadhaar document uploaded" : "PDF or image, maximum 10 MB")}</small>
        </div>
        <div className="col-md-6">
          <label htmlFor="panCardUpload" className="form-label">Upload PAN Card</label>
          <input className="form-control" type="file" id="panCardUpload" accept=".pdf,image/*" onChange={(event) => onChange("panCardDocument", event.target.files?.[0] || null)} />
          <small className="text-secondary">{data.panCardDocument?.name || (data.panCardDocumentUrl ? "Current PAN card uploaded" : "PDF or image, maximum 10 MB")}</small>
        </div>
        <div className="col-md-6">
          <label htmlFor="cvUpload" className="form-label">Upload CV / Resume</label>
          <input className="form-control" type="file" id="cvUpload" accept=".pdf,.doc,.docx" onChange={(event) => onChange("cvDocument", event.target.files?.[0] || null)} />
          <small className="text-secondary">{data.cvDocument?.name || (data.cvDocumentUrl ? "Current CV uploaded" : "PDF, DOC, or DOCX; maximum 10 MB")}</small>
        </div>
        <div className="col-12">
          <label htmlFor="address" className="form-label">Address</label>
          <textarea className="form-control" id="address" rows={3} placeholder="Enter full address" value={data.address || ""} onChange={(event) => onChange("address", event.target.value)} />
        </div>
      </div>

      <hr className="my-4" />
      <h5 className="mb-3">Emergency Contact Information</h5>
      <div className="row g-3">
        <div className="col-md-6">
          <label htmlFor="emergencyContactName" className="form-label">Contact Name</label>
          <input type="text" className="form-control" id="emergencyContactName" placeholder="Enter contact's full name" value={data.emergencyContactName || ""} onChange={(event) => onChange("emergencyContactName", event.target.value)} />
        </div>
        <div className="col-md-6">
          <label htmlFor="emergencyContactRelationship" className="form-label">Relationship</label>
          <input type="text" className="form-control" id="emergencyContactRelationship" placeholder="e.g., Spouse, Parent, Sibling" value={data.emergencyContactRelationship || ""} onChange={(event) => onChange("emergencyContactRelationship", event.target.value)} />
        </div>
        <div className="col-md-6">
          <label htmlFor="emergencyContactPhone" className="form-label">Contact Phone</label>
          <input type="tel" className="form-control" id="emergencyContactPhone" placeholder="Enter contact's phone number" value={data.emergencyContactPhone || ""} onChange={(event) => onChange("emergencyContactPhone", event.target.value)} />
        </div>
      </div>
    </div>
  );
};

export default Step1_PersonalInfo;
