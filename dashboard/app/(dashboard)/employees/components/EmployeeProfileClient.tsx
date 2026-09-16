"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal, Button, Form, Spinner, Row, Col } from "react-bootstrap";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBriefcase,
  IconBuildingBank,
  IconCalendar,
  IconEye,
  IconFileText,
  IconId,
  IconMail,
  IconMapPin,
  IconPhone,
  IconShieldCheck,
  IconUser,
  IconUsers,
  IconWallet,
  IconCalendarStats,
  IconEdit,
  IconCamera,
  IconUpload,
  IconCheck,
} from "@tabler/icons-react";

type Employee = {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  aadhaar_number: string;
  address: string;
  profile_photo_url: string | null;
  aadhaar_document_url: string | null;
  pan_card_document_url: string | null;
  cv_document_url: string | null;
  account_exists: boolean;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  joining_date: string;
  department: string;
  designation: string;
  employment_type: string;
  employment_type_label: string;
  reporting_manager: string;
  status: "ACTIVE" | "PROVISION" | "INACTIVE" | "ON_LEAVE" | "NOTICE_PERIOD" | "TERMINATED";
  status_label: string;
  status_end_date?: string | null;
  auto_transition_status?: string | null;
  auto_transition_status_label?: string | null;
  annual_salary: string;
  pay_frequency: string;
  pay_frequency_label: string;
  bank_name: string;
  bank_account_number: string;
  ifsc_code: string;
  tax_id: string;
  pan_number?: string;
  pf_number?: string;
  uan_number?: string;
  esic_number?: string;
  created_at: string;
  updated_at: string;
};

type SectionItem = {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
};

type EmployeeProfileClientProps = {
  employeeId?: string;
  employee?: {
    id?: string;
    avatar?: string;
  };
};

type LeavePolicy = {
  year: number;
  joining_date: string;
  is_prorated: boolean;
  eligible_months: number;
  casual_leave_days_override: string | null;
  sick_leave_days_override: string | null;
  company_casual_leave_days: number;
  company_sick_leave_days: number;
  balances: Array<{ leave_type: string; label: string; entitlement: number; used: number; remaining: number }>;
  leave_requests: Array<{
    id: number; leave_type_label: string; start_date: string; end_date: string;
    is_half_day: boolean; reason: string; status: string; status_label: string;
  }>;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/`;

const statusBadgeClass: Record<Employee["status"], string> = {
  ACTIVE: "bg-success-subtle text-success",
  PROVISION: "bg-info-subtle text-info",
  ON_LEAVE: "bg-warning-subtle text-warning",
  NOTICE_PERIOD: "bg-warning-subtle text-danger",
  INACTIVE: "bg-secondary-subtle text-secondary",
  TERMINATED: "bg-danger-subtle text-danger",
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatCurrency = (value?: string | null) => {
  if (!value) return "Not provided";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
};

const displayValue = (value?: string | null) => {
  return value && String(value).trim() ? value : "Not provided";
};

const InfoItem = ({ label, value, icon }: SectionItem) => (
  <div className="employee-info-item">
    <div className="employee-info-icon">{icon || <IconFileText size={18} />}</div>
    <div>
      <div className="employee-info-label">{label}</div>
      <div className="employee-info-value">{displayValue(value)}</div>
    </div>
  </div>
);

const InfoSection = ({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: SectionItem[];
}) => (
  <section className="employee-profile-section">
    <div className="mb-4">
      <h5 className="mb-1">{title}</h5>
      {subtitle && <p className="text-secondary mb-0">{subtitle}</p>}
    </div>
    <div className="row g-3">
      {items.map((item) => (
        <div className="col-md-6 col-xl-4" key={item.label}>
          <InfoItem {...item} />
        </div>
      ))}
    </div>
  </section>
);

const EmployeeProfileClient = ({ employeeId, employee: legacyEmployee }: EmployeeProfileClientProps) => {
  const resolvedEmployeeId = employeeId || legacyEmployee?.id || "";
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [leavePolicy, setLeavePolicy] = useState<LeavePolicy | null>(null);
  const [isEditingLeavePolicy, setIsEditingLeavePolicy] = useState(false);
  const [casualOverride, setCasualOverride] = useState("");
  const [sickOverride, setSickOverride] = useState("");
  const [isSavingLeavePolicy, setIsSavingLeavePolicy] = useState(false);
  const [leavePolicyError, setLeavePolicyError] = useState("");

  const isMe = resolvedEmployeeId === "me";
  const backUrl = isMe ? "/employee-dashboard" : "/employees";
  const backLabel = isMe ? "Back to Dashboard" : "Back to Employees";

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    address: "",
    aadhaar_number: "",
    tax_id: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
  });
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [aadhaarDocFile, setAadhaarDocFile] = useState<File | null>(null);
  const [panDocFile, setPanDocFile] = useState<File | null>(null);
  const [cvDocFile, setCvDocFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");

  useEffect(() => {
    const loadEmployee = async () => {
      setIsLoading(true);
      setError("");

      try {
        if (!resolvedEmployeeId) {
          throw new Error("Employee ID is missing from the profile route.");
        }

        const token = localStorage.getItem("authToken");
        const response = await fetch(`${API_URL}${resolvedEmployeeId}/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (response.status === 404) {
          throw new Error("Employee profile was not found.");
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error("You are not authorized to view this employee profile.");
        }
        if (!response.ok) {
          throw new Error("Unable to load employee profile.");
        }

        setEmployee((await response.json()) as Employee);
        const leaveResponse = await fetch(`${API_URL}${resolvedEmployeeId}/leave-policy/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (leaveResponse.ok) {
          const policy = (await leaveResponse.json()) as LeavePolicy;
          setLeavePolicy(policy);
          setCasualOverride(policy.casual_leave_days_override ?? "");
          setSickOverride(policy.sick_leave_days_override ?? "");
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load employee profile.");
      } finally {
        setIsLoading(false);
      }
    };

    loadEmployee();
  }, [resolvedEmployeeId]);

  useEffect(() => {
    if (!profilePhotoFile) {
      setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(profilePhotoFile);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profilePhotoFile]);

  const openEditModal = () => {
    if (!employee) return;
    setPersonalForm({
      full_name: employee.full_name || "",
      phone: employee.phone || "",
      date_of_birth: employee.date_of_birth || "",
      address: employee.address || "",
      aadhaar_number: employee.aadhaar_number || "",
      tax_id: employee.tax_id || "",
      emergency_contact_name: employee.emergency_contact_name || "",
      emergency_contact_relationship: employee.emergency_contact_relationship || "",
      emergency_contact_phone: employee.emergency_contact_phone || "",
    });
    setProfilePhotoFile(null);
    setAadhaarDocFile(null);
    setPanDocFile(null);
    setCvDocFile(null);
    setPhotoPreview(null);
    setProfileSaveError("");
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    if (isSavingProfile) return;
    setIsEditOpen(false);
    setProfilePhotoFile(null);
    setAadhaarDocFile(null);
    setPanDocFile(null);
    setCvDocFile(null);
    setPhotoPreview(null);
    setProfileSaveError("");
  };

  const updatePersonalField = (field: string, value: string) => {
    setPersonalForm((prev) => ({ ...prev, [field]: value }));
    setProfileSaveError("");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveError("");

    if (!personalForm.full_name.trim()) {
      setProfileSaveError("Full name is required.");
      return;
    }

    if (personalForm.phone && !/^\+?[0-9]{10,15}$/.test(personalForm.phone.trim())) {
      setProfileSaveError("Enter a valid phone number (10-15 digits).");
      return;
    }

    if (personalForm.aadhaar_number && !/^[0-9]{12}$/.test(personalForm.aadhaar_number.trim())) {
      setProfileSaveError("Enter a valid 12-digit Aadhaar number.");
      return;
    }

    if (personalForm.tax_id && personalForm.tax_id.trim().length < 6) {
      setProfileSaveError("Enter a valid PAN / Tax ID.");
      return;
    }

    if (
      personalForm.emergency_contact_phone &&
      !/^\+?[0-9]{10,15}$/.test(personalForm.emergency_contact_phone.trim())
    ) {
      setProfileSaveError("Enter a valid emergency contact phone number.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append("full_name", personalForm.full_name.trim());
      formData.append("phone", personalForm.phone.trim());
      if (personalForm.date_of_birth) formData.append("date_of_birth", personalForm.date_of_birth);
      formData.append("address", personalForm.address.trim());
      formData.append("aadhaar_number", personalForm.aadhaar_number.trim());
      formData.append("tax_id", personalForm.tax_id.trim().toUpperCase());
      formData.append("emergency_contact_name", personalForm.emergency_contact_name.trim());
      formData.append("emergency_contact_relationship", personalForm.emergency_contact_relationship.trim());
      formData.append("emergency_contact_phone", personalForm.emergency_contact_phone.trim());

      if (profilePhotoFile instanceof File) {
        formData.append("profile_photo", profilePhotoFile);
      }
      if (aadhaarDocFile instanceof File) {
        formData.append("aadhaar_document", aadhaarDocFile);
      }
      if (panDocFile instanceof File) {
        formData.append("pan_card_document", panDocFile);
      }
      if (cvDocFile instanceof File) {
        formData.append("cv_document", cvDocFile);
      }

      const response = await fetch(`${API_URL}${resolvedEmployeeId}/`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        let errorMsg = "Unable to update profile.";
        if (errorData) {
          if (typeof errorData.detail === "string") errorMsg = errorData.detail;
          else {
            errorMsg = Object.entries(errorData)
              .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(" ") : val}`)
              .join("\n");
          }
        }
        throw new Error(errorMsg);
      }

      const updatedData = await response.json();
      setEmployee((prev) => (prev ? { ...prev, ...updatedData } : updatedData));
      setIsEditOpen(false);
    } catch (saveError: any) {
      setProfileSaveError(saveError?.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveLeavePolicy = async () => {
    setIsSavingLeavePolicy(true);
    setLeavePolicyError("");
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}${resolvedEmployeeId}/leave-policy/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          casual_leave_days_override: casualOverride === "" ? null : Number(casualOverride),
          sick_leave_days_override: sickOverride === "" ? null : Number(sickOverride),
        }),
      });
      if (!response.ok) throw new Error("Unable to update employee leave entitlement.");
      const policy = (await response.json()) as LeavePolicy;
      setLeavePolicy(policy);
      setCasualOverride(policy.casual_leave_days_override ?? "");
      setSickOverride(policy.sick_leave_days_override ?? "");
      setIsEditingLeavePolicy(false);
    } catch (saveError) {
      setLeavePolicyError(saveError instanceof Error ? saveError.message : "Unable to update leave entitlement.");
    } finally {
      setIsSavingLeavePolicy(false);
    }
  };

  const sections = useMemo(() => {
    if (!employee) return [];

    return [
      {
        title: "Personal Information",
        subtitle: "Identity and contact details captured from the employee form.",
        items: [
          { label: "Full Name", value: employee.full_name, icon: <IconUser size={18} /> },
          { label: "Email Address", value: employee.email, icon: <IconMail size={18} /> },
          { label: "Phone Number", value: employee.phone, icon: <IconPhone size={18} /> },
          { label: "Date of Birth", value: formatDate(employee.date_of_birth), icon: <IconCalendar size={18} /> },
          { label: "Aadhaar Number", value: employee.aadhaar_number, icon: <IconId size={18} /> },
          { label: "Address", value: employee.address, icon: <IconMapPin size={18} /> },
        ],
      },
      {
        title: "Emergency Contact",
        subtitle: "People to contact if urgent assistance is needed.",
        items: [
          { label: "Contact Name", value: employee.emergency_contact_name, icon: <IconUsers size={18} /> },
          { label: "Relationship", value: employee.emergency_contact_relationship, icon: <IconShieldCheck size={18} /> },
          { label: "Contact Phone", value: employee.emergency_contact_phone, icon: <IconPhone size={18} /> },
        ],
      },
      {
        title: "Employment Details",
        subtitle: "Role, department, manager, and employment status.",
        items: [
          { label: "Employee ID", value: employee.employee_id, icon: <IconId size={18} /> },
          { label: "Joining Date", value: formatDate(employee.joining_date), icon: <IconCalendar size={18} /> },
          { label: "Department", value: employee.department, icon: <IconBriefcase size={18} /> },
          { label: "Designation", value: employee.designation, icon: <IconBriefcase size={18} /> },
          { label: "Company", value: "Bhatt Square Pvt Ltd", icon: <IconBriefcase size={18} /> },
          { label: "Employment Type", value: employee.employment_type_label || employee.employment_type, icon: <IconUsers size={18} /> },
          { label: "Reporting Manager", value: employee.reporting_manager, icon: <IconUser size={18} /> },
          { label: "Login Account", value: employee.account_exists ? "Created" : "Not created", icon: <IconShieldCheck size={18} /> },
          ...(employee.status_end_date ? [
            { label: "Status End Date", value: formatDate(employee.status_end_date), icon: <IconCalendar size={18} /> },
            { label: "Next Auto Transition", value: employee.auto_transition_status_label || employee.auto_transition_status || "-", icon: <IconShieldCheck size={18} /> },
          ] : []),
        ],
      },
      {
        title: "Salary & Bank",
        subtitle: "Payroll and bank details saved for this employee.",
        items: [
          { label: "Annual Salary", value: formatCurrency(employee.annual_salary), icon: <IconWallet size={18} /> },
          { label: "Pay Frequency", value: employee.pay_frequency_label || employee.pay_frequency, icon: <IconCalendar size={18} /> },
          { label: "Bank Name", value: employee.bank_name, icon: <IconBuildingBank size={18} /> },
          { label: "Bank Account Number", value: employee.bank_account_number, icon: <IconId size={18} /> },
          { label: "IFSC Code", value: employee.ifsc_code, icon: <IconBuildingBank size={18} /> },
          { label: "PAN Number", value: employee.pan_number || employee.tax_id, icon: <IconFileText size={18} /> },
          { label: "P.F. A/C Number", value: employee.pf_number, icon: <IconId size={18} /> },
          { label: "UAN Number", value: employee.uan_number, icon: <IconId size={18} /> },
        ],
      },
      {
        title: "System Details",
        subtitle: "Record timestamps from AttendStack.",
        items: [
          { label: "Created At", value: formatDateTime(employee.created_at), icon: <IconCalendar size={18} /> },
          { label: "Last Updated", value: formatDateTime(employee.updated_at), icon: <IconCalendar size={18} /> },
        ],
      },
    ];
  }, [employee]);

  if (isLoading) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body py-5 text-center text-secondary">Loading employee profile...</div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <div className="alert alert-danger d-flex align-items-center gap-2 mb-4">
            <IconAlertCircle size={20} />
            <span>{error || "Employee profile could not be loaded."}</span>
          </div>
          <Link href={backUrl} className="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
            <IconArrowLeft size={18} /> {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-profile">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <Link href={backUrl} className="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
          <IconArrowLeft size={18} /> {backLabel}
        </Link>
      </div>

      <div className="employee-profile-header mb-4">
        <div className="d-flex flex-column flex-md-row align-items-md-center gap-4 justify-content-between">
          <div className="d-flex flex-column flex-md-row align-items-md-center gap-4">
            <div className="position-relative d-inline-block">
              <img
                src={employee.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                alt={employee.full_name}
                className="employee-profile-avatar"
              />
              <button
                type="button"
                className="btn btn-primary btn-sm rounded-circle p-1 position-absolute bottom-0 end-0 border border-2 border-white shadow-sm d-flex align-items-center justify-content-center"
                style={{ width: "32px", height: "32px" }}
                onClick={openEditModal}
                title="Change Photo / Edit Profile"
              >
                <IconCamera size={16} />
              </button>
            </div>
            <div>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <h2 className="mb-0">{employee.full_name}</h2>
                <span className={`badge ${statusBadgeClass[employee.status] || "bg-secondary-subtle text-secondary"}`}>
                  {employee.status_label}
                </span>
              </div>
              <p className="text-secondary mb-2">{employee.designation} - {employee.department}</p>
              <div className="d-flex flex-wrap gap-3 text-secondary small">
                <span className="d-inline-flex align-items-center gap-1"><IconId size={16} /> {employee.employee_id}</span>
                <span className="d-inline-flex align-items-center gap-1"><IconMail size={16} /> {employee.email}</span>
                <span className="d-inline-flex align-items-center gap-1"><IconPhone size={16} /> {employee.phone}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline-primary d-inline-flex align-items-center gap-2 align-self-start align-self-md-center mt-2 mt-md-0"
            onClick={openEditModal}
          >
            <IconEdit size={16} /> Edit Profile
          </button>
        </div>
      </div>

      <section className="employee-profile-section">
        <div className="mb-4">
          <h5 className="mb-1">Documents</h5>
          <p className="text-secondary mb-0">Uploaded files attached during employee onboarding.</p>
        </div>
        <div className="row g-3">
          <div className="col-md-6">
            <div className="employee-document-tile">
              <div>
                <div className="employee-info-label">Profile Photo</div>
                <div className="employee-info-value">{employee.profile_photo_url ? "Uploaded" : "Not uploaded"}</div>
              </div>
              {employee.profile_photo_url && (
                <a href={employee.profile_photo_url} target="_blank" rel="noreferrer" className="btn btn-light btn-sm d-inline-flex align-items-center gap-2">
                  <IconEye size={16} /> Preview
                </a>
              )}
            </div>
          </div>
          <div className="col-md-6">
            <div className="employee-document-tile">
              <div>
                <div className="employee-info-label">PAN Card</div>
                <div className="employee-info-value">{employee.pan_card_document_url ? "Uploaded" : "Not uploaded"}</div>
              </div>
              {employee.pan_card_document_url && (
                <a href={employee.pan_card_document_url} target="_blank" rel="noreferrer" className="btn btn-light btn-sm d-inline-flex align-items-center gap-2">
                  <IconEye size={16} /> Preview
                </a>
              )}
            </div>
          </div>
          <div className="col-md-6">
            <div className="employee-document-tile">
              <div>
                <div className="employee-info-label">CV / Resume</div>
                <div className="employee-info-value">{employee.cv_document_url ? "Uploaded" : "Not uploaded"}</div>
              </div>
              {employee.cv_document_url && (
                <a href={employee.cv_document_url} target="_blank" rel="noreferrer" className="btn btn-light btn-sm d-inline-flex align-items-center gap-2">
                  <IconEye size={16} /> Preview
                </a>
              )}
            </div>
          </div>
          <div className="col-md-6">
            <div className="employee-document-tile">
              <div>
                <div className="employee-info-label">Aadhaar Document</div>
                <div className="employee-info-value">{employee.aadhaar_document_url ? "Uploaded" : "Not uploaded"}</div>
              </div>
              {employee.aadhaar_document_url && (
                <a href={employee.aadhaar_document_url} target="_blank" rel="noreferrer" className="btn btn-light btn-sm d-inline-flex align-items-center gap-2">
                  <IconEye size={16} /> Preview
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <InfoSection key={section.title} {...section} />
      ))}

      {leavePolicy && (
        <section className="employee-profile-section" id="leave-entitlement">
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">Paid Leave Entitlement</h5>
              <p className="text-secondary mb-0">
                {leavePolicy.year} balances based on company policy
                {leavePolicy.is_prorated ? `, prorated across ${leavePolicy.eligible_months} eligible months from the joining month.` : "."}
              </p>
            </div>
            {!isMe && (
              <button className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2" onClick={() => setIsEditingLeavePolicy(!isEditingLeavePolicy)}>
                <IconEdit size={16} /> {isEditingLeavePolicy ? "Cancel" : "Edit Entitlement"}
              </button>
            )}
          </div>

          {isEditingLeavePolicy && (
            <div className="row g-3 align-items-end border-bottom pb-4 mb-4">
              {leavePolicyError && <div className="col-12"><div className="alert alert-danger mb-0">{leavePolicyError}</div></div>}
              <div className="col-md-5">
                <label className="form-label small fw-semibold">Annual Casual / PL Override</label>
                <input type="number" min="0" max="365" step="0.5" className="form-control" value={casualOverride} onChange={(event) => setCasualOverride(event.target.value)} placeholder={`Company default: ${leavePolicy.company_casual_leave_days}`} />
                <div className="form-text">Leave blank to follow company policy.</div>
              </div>
              <div className="col-md-5">
                <label className="form-label small fw-semibold">Annual Sick Leave Override</label>
                <input type="number" min="0" max="365" step="0.5" className="form-control" value={sickOverride} onChange={(event) => setSickOverride(event.target.value)} placeholder={`Company default: ${leavePolicy.company_sick_leave_days}`} />
                <div className="form-text">Leave blank to follow company policy.</div>
              </div>
              <div className="col-md-2">
                <button className="btn btn-primary w-100" onClick={saveLeavePolicy} disabled={isSavingLeavePolicy}>
                  {isSavingLeavePolicy ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          <div className="row g-3 mb-4">
            {leavePolicy.balances.map((balance) => (
              <div className="col-sm-6 col-xl-4" key={balance.leave_type}>
                <div className="employee-info-item">
                  <div className="employee-info-icon"><IconCalendarStats size={18} /></div>
                  <div>
                    <div className="employee-info-label">{balance.label}</div>
                    <div className="employee-info-value">{balance.remaining} of {balance.entitlement} days remaining</div>
                    <div className="small text-secondary">{balance.used} days used</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h6 className="mb-3">Leave Applications</h6>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light"><tr><th>Type</th><th>Period</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {leavePolicy.leave_requests.length ? leavePolicy.leave_requests.map((leave) => (
                  <tr key={leave.id}>
                    <td>{leave.leave_type_label}{leave.is_half_day ? " (Half day)" : ""}</td>
                    <td>{formatDate(leave.start_date)} - {formatDate(leave.end_date)}</td>
                    <td className="text-break" style={{ maxWidth: 360 }}>{leave.reason}</td>
                    <td><span className={`badge ${leave.status === "APPROVED" ? "bg-success-subtle text-success" : leave.status === "REJECTED" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"}`}>{leave.status_label}</span></td>
                  </tr>
                )) : <tr><td colSpan={4} className="text-center text-secondary py-4">No leave applications found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Edit Profile Modal */}
      <Modal show={isEditOpen} onHide={closeEditModal} size="lg" centered backdrop="static">
        <Form onSubmit={handleSaveProfile}>
          <Modal.Header closeButton className="border-bottom-0 pb-0 pt-4 px-4">
            <div className="d-flex align-items-center gap-2">
              <div className="p-2 rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center">
                <IconEdit size={22} />
              </div>
              <div>
                <Modal.Title className="h5 mb-0 fw-bold">Edit Profile</Modal.Title>
                <small className="text-muted">Update personal information, emergency contacts, and documents</small>
              </div>
            </div>
          </Modal.Header>

          <Modal.Body className="p-4">
            {profileSaveError && (
              <div className="alert alert-danger d-flex align-items-center gap-2 mb-4">
                <IconAlertCircle size={18} />
                <span className="small">{profileSaveError}</span>
              </div>
            )}

            {/* Profile Photo Section */}
            <div className="p-3 mb-4 rounded-3 border bg-light d-flex align-items-center gap-4 flex-wrap">
              <img
                src={photoPreview || employee?.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                alt="Profile Preview"
                style={{ width: "72px", height: "72px", objectFit: "cover" }}
                className="rounded-circle border border-2 border-white shadow-sm"
              />
              <div className="flex-grow-1">
                <Form.Label className="fw-semibold mb-1">Profile Photo</Form.Label>
                <Form.Control
                  type="file"
                  size="sm"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0] || null;
                    setProfilePhotoFile(file);
                  }}
                />
                <Form.Text className="text-muted small">
                  Supports JPG, PNG, WEBP up to 10MB.
                </Form.Text>
              </div>
            </div>

            <h6 className="fw-bold mb-3 text-uppercase text-secondary small letter-spacing-1">Personal Details</h6>
            <Row className="g-3 mb-4">
              <Col xs={12} md={6}>
                <Form.Group controlId="editFullName">
                  <Form.Label className="fw-semibold small">Full Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.full_name}
                    onChange={(e) => updatePersonalField("full_name", e.target.value)}
                    placeholder="Enter full name"
                    required
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editPhone">
                  <Form.Label className="fw-semibold small">Phone Number</Form.Label>
                  <Form.Control
                    type="tel"
                    value={personalForm.phone}
                    onChange={(e) => updatePersonalField("phone", e.target.value)}
                    placeholder="10-digit mobile number"
                    maxLength={15}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editDateOfBirth">
                  <Form.Label className="fw-semibold small">Date of Birth</Form.Label>
                  <Form.Control
                    type="date"
                    value={personalForm.date_of_birth || ""}
                    onChange={(e) => updatePersonalField("date_of_birth", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editAadhaarNumber">
                  <Form.Label className="fw-semibold small">Aadhaar Number</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.aadhaar_number}
                    onChange={(e) => updatePersonalField("aadhaar_number", e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder="12-digit Aadhaar number"
                    maxLength={12}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editTaxId">
                  <Form.Label className="fw-semibold small">Tax ID / PAN Number</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.tax_id}
                    onChange={(e) => updatePersonalField("tax_id", e.target.value.toUpperCase())}
                    placeholder="e.g. ABCDE1234F"
                    maxLength={20}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editAddress">
                  <Form.Label className="fw-semibold small">Residential Address</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={personalForm.address}
                    onChange={(e) => updatePersonalField("address", e.target.value)}
                    placeholder="Enter full address"
                  />
                </Form.Group>
              </Col>
            </Row>

            <h6 className="fw-bold mb-3 text-uppercase text-secondary small letter-spacing-1">Emergency Contact</h6>
            <Row className="g-3 mb-4">
              <Col xs={12} md={4}>
                <Form.Group controlId="editEmergencyName">
                  <Form.Label className="fw-semibold small">Contact Person Name</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.emergency_contact_name}
                    onChange={(e) => updatePersonalField("emergency_contact_name", e.target.value)}
                    placeholder="e.g. Spouse / Parent"
                    maxLength={150}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={4}>
                <Form.Group controlId="editEmergencyRelationship">
                  <Form.Label className="fw-semibold small">Relationship</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.emergency_contact_relationship}
                    onChange={(e) => updatePersonalField("emergency_contact_relationship", e.target.value)}
                    placeholder="e.g. Father, Mother, Spouse"
                    maxLength={80}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={4}>
                <Form.Group controlId="editEmergencyPhone">
                  <Form.Label className="fw-semibold small">Contact Phone Number</Form.Label>
                  <Form.Control
                    type="tel"
                    value={personalForm.emergency_contact_phone}
                    onChange={(e) => updatePersonalField("emergency_contact_phone", e.target.value)}
                    placeholder="Emergency phone number"
                    maxLength={15}
                  />
                </Form.Group>
              </Col>
            </Row>

            <h6 className="fw-bold mb-3 text-uppercase text-secondary small letter-spacing-1">Documents Upload</h6>
            <Row className="g-3">
              <Col xs={12} md={4}>
                <Form.Group controlId="editAadhaarDoc">
                  <Form.Label className="fw-semibold small">Aadhaar Card File</Form.Label>
                  <Form.Control
                    type="file"
                    size="sm"
                    accept=".pdf,image/jpeg,image/png,image/webp,image/jpg"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setAadhaarDocFile(e.target.files?.[0] || null);
                    }}
                  />
                  <Form.Text className="text-muted small">
                    {employee?.aadhaar_document_url ? "Currently uploaded. Select new file to replace." : "PDF or Image up to 10MB."}
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col xs={12} md={4}>
                <Form.Group controlId="editPanDoc">
                  <Form.Label className="fw-semibold small">PAN Card File</Form.Label>
                  <Form.Control
                    type="file"
                    size="sm"
                    accept=".pdf,image/jpeg,image/png,image/webp,image/jpg"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setPanDocFile(e.target.files?.[0] || null);
                    }}
                  />
                  <Form.Text className="text-muted small">
                    {employee?.pan_card_document_url ? "Currently uploaded. Select new file to replace." : "PDF or Image up to 10MB."}
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col xs={12} md={4}>
                <Form.Group controlId="editCvDoc">
                  <Form.Label className="fw-semibold small">Resume / CV File</Form.Label>
                  <Form.Control
                    type="file"
                    size="sm"
                    accept=".pdf,.doc,.docx"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setCvDocFile(e.target.files?.[0] || null);
                    }}
                  />
                  <Form.Text className="text-muted small">
                    {employee?.cv_document_url ? "Currently uploaded. Select new file to replace." : "PDF, DOC, DOCX up to 10MB."}
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>

          <Modal.Footer className="border-top-0 pt-0 pb-4 px-4">
            <Button variant="outline-secondary" onClick={closeEditModal} disabled={isSavingProfile}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSavingProfile} className="d-inline-flex align-items-center gap-2">
              {isSavingProfile ? (
                <>
                  <Spinner size="sm" animation="border" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <IconCheck size={18} />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <style jsx global>{`
        .employee-profile-header,
        .employee-profile-section {
          background: #fff;
          border: 1px solid #edf1f5;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(16, 24, 40, 0.04);
          padding: 24px;
        }

        .employee-profile-section {
          margin-bottom: 24px;
        }

        .employee-profile-avatar {
          width: 112px;
          height: 112px;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid #f3f7fa;
          background: #f8fafc;
        }

        .employee-info-item,
        .employee-document-tile {
          min-height: 86px;
          height: 100%;
          border: 1px solid #edf1f5;
          border-radius: 8px;
          padding: 14px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          background: #fbfcfe;
        }

        .employee-document-tile {
          align-items: center;
          justify-content: space-between;
        }

        .employee-info-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          color: #0ea66b;
          background: #eaf8f1;
        }

        .employee-info-label {
          color: #6b7a8c;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          margin-bottom: 4px;
        }

        .employee-info-value {
          color: #0f172a;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
      `}</style>
    </div>
  );
};

export default EmployeeProfileClient;
