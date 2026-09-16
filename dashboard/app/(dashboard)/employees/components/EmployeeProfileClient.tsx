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
  IconClock,
  IconCopy,
  IconBuilding,
  IconPhoneCall,
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
  shift?: string | null;
  shift_name?: string | null;
  shift_details?: {
    id?: string | null;
    is_assigned: boolean;
    name: string;
    code: string;
    start_time: string;
    end_time: string;
    late_grace_minutes: number;
    early_checkout_grace_minutes: number;
    early_checkout_penalty: string;
    early_checkout_penalty_label: string;
    min_hours_half_day: number;
    min_hours_full_day: number;
  } | null;
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

type ShiftOption = {
  id: string;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  is_night_shift?: boolean;
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
    id: number;
    leave_type_label: string;
    start_date: string;
    end_date: string;
    is_half_day: boolean;
    reason: string;
    status: string;
    status_label: string;
  }>;
};

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/`;

const statusBadgeClass: Record<Employee["status"], string> = {
  ACTIVE: "bg-success-subtle text-success border border-success-subtle",
  PROVISION: "bg-info-subtle text-info border border-info-subtle",
  ON_LEAVE: "bg-warning-subtle text-warning border border-warning-subtle",
  NOTICE_PERIOD: "bg-warning-subtle text-danger border border-danger-subtle",
  INACTIVE: "bg-secondary-subtle text-secondary border border-secondary-subtle",
  TERMINATED: "bg-danger-subtle text-danger border border-danger-subtle",
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

const calculateTenure = (joiningDate?: string | null) => {
  if (!joiningDate) return null;
  const start = new Date(joiningDate);
  const now = new Date();
  if (isNaN(start.getTime())) return null;
  const diffMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (diffMonths <= 0) return "Joined recently";
  if (diffMonths < 12) return `${diffMonths} mo${diffMonths > 1 ? "s" : ""} tenure`;
  const years = Math.floor(diffMonths / 12);
  const rem = diffMonths % 12;
  return `${years} yr${years > 1 ? "s" : ""}${rem > 0 ? ` ${rem} mo${rem > 1 ? "s" : ""}` : ""} tenure`;
};

// Polished, color-accented Info Card
const ProfileInfoCard = ({
  label,
  value,
  icon,
  theme = "default",
  isCopyable = false,
  subtext,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  theme?: "indigo" | "emerald" | "amber" | "sky" | "rose" | "purple" | "default";
  isCopyable?: boolean;
  subtext?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (text?: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`profile-info-card theme-${theme}`}>
      <div className={`profile-info-icon icon-${theme}`}>{icon || <IconFileText size={18} />}</div>
      <div className="profile-info-content min-w-0 flex-grow-1">
        <div className="profile-info-label">{label}</div>
        <div className="d-flex align-items-center justify-content-between gap-2">
          <div className={`profile-info-value ${label.includes("Address") ? "text-break" : "text-truncate"}`} title={String(value || "")}>
            {displayValue(value)}
          </div>
          {isCopyable && value && value !== "Not provided" && (
            <button
              type="button"
              className="btn btn-sm p-0 text-muted copy-btn flex-shrink-0"
              onClick={() => handleCopy(value)}
              title="Copy to clipboard"
            >
              {copied ? <IconCheck size={14} className="text-success" /> : <IconCopy size={14} />}
            </button>
          )}
        </div>
        {subtext && <div className="profile-info-subtext">{subtext}</div>}
      </div>
    </div>
  );
};

const EmployeeProfileClient = ({ employeeId, employee: legacyEmployee }: EmployeeProfileClientProps) => {
  const resolvedEmployeeId = employeeId || legacyEmployee?.id || "";
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "personal" | "compensation" | "leave">("overview");

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

  // Shift Management State
  const [availableShifts, setAvailableShifts] = useState<ShiftOption[]>([]);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [shiftSuccessMessage, setShiftSuccessMessage] = useState("");
  const [shiftErrorMessage, setShiftErrorMessage] = useState("");

  // Hash change detection (for URL routing to #leave-entitlement)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleHash = () => {
        if (window.location.hash === "#leave-entitlement") {
          setActiveTab("leave");
        }
      };
      handleHash();
      window.addEventListener("hashchange", handleHash);
      return () => window.removeEventListener("hashchange", handleHash);
    }
  }, []);

  useEffect(() => {
    const loadShifts = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/attendance/shifts/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableShifts(Array.isArray(data) ? data : data.results || []);
        }
      } catch (err) {
        console.error("Failed to load shifts:", err);
      }
    };
    loadShifts();
  }, []);

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

        const data = (await response.json()) as Employee;
        setEmployee(data);

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

  const openShiftModal = () => {
    if (!employee) return;
    setSelectedShiftId(employee.shift || "");
    setShiftSuccessMessage("");
    setShiftErrorMessage("");
    setIsShiftModalOpen(true);
  };

  const closeShiftModal = () => {
    if (isSavingShift) return;
    setIsShiftModalOpen(false);
    setShiftSuccessMessage("");
    setShiftErrorMessage("");
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setIsSavingShift(true);
    setShiftSuccessMessage("");
    setShiftErrorMessage("");

    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${API_URL}${employee.id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ shift: selectedShiftId || null }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || "Failed to update work shift.");
      }

      const updated = (await res.json()) as Employee;
      setEmployee(updated);
      setShiftSuccessMessage("Work shift updated successfully!");
      setTimeout(() => {
        setIsShiftModalOpen(false);
      }, 700);
    } catch (err) {
      setShiftErrorMessage(err instanceof Error ? err.message : "Unable to update work shift.");
    } finally {
      setIsSavingShift(false);
    }
  };

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

  if (isLoading) {
    return (
      <div className="card border-0 shadow-sm rounded-4 p-5 text-center">
        <div className="spinner-border text-primary mx-auto mb-3" role="status" />
        <div className="text-secondary fw-medium">Loading executive employee profile...</div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="card border-0 shadow-sm rounded-4 p-4">
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-4">
          <IconAlertCircle size={20} />
          <span>{error || "Employee profile could not be loaded."}</span>
        </div>
        <Link href={backUrl} className="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
          <IconArrowLeft size={18} /> {backLabel}
        </Link>
      </div>
    );
  }

  const tenure = calculateTenure(employee.joining_date);
  const shift = employee.shift_details;
  const isShiftCustom = Boolean(employee.shift);

  return (
    <div className="employee-profile-wrapper">
      {/* Top Breadcrumb Navigation */}
      <div className="profile-topbar d-flex align-items-center justify-content-between mb-3">
        <Link href={backUrl} className="btn btn-sm btn-light border d-inline-flex align-items-center gap-2 text-secondary fw-semibold shadow-2xs profile-back-btn">
          <IconArrowLeft size={16} /> {backLabel}
        </Link>
        <div className="d-flex align-items-center gap-1.5 profile-topbar-meta">
          <span className="badge bg-white text-secondary border px-2.5 py-1.5 fw-medium">{employee.department || "Directory"}</span>
          <span className="badge bg-dark text-white px-2.5 py-1.5 fw-semibold">ID: {employee.employee_id}</span>
        </div>
      </div>

      {/* Executive Hero Header Card */}
      <div className="executive-profile-header mb-4">
        <div className="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-4">
          <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-4">
            <div className="position-relative flex-shrink-0">
              <img
                src={employee.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                alt={employee.full_name}
                className="profile-hero-avatar"
              />
              <button
                type="button"
                className="avatar-edit-fab"
                onClick={openEditModal}
                title="Update photo / edit profile"
              >
                <IconCamera size={15} />
              </button>
            </div>

            <div>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1.5">
                <h2 className="profile-hero-name mb-0">{employee.full_name}</h2>
                <span className={`badge ${statusBadgeClass[employee.status] || "bg-secondary-subtle text-secondary"}`}>
                  <span className="status-indicator-dot" />
                  {employee.status_label}
                </span>
              </div>

              {/* Badges / Quick Pills */}
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2.5">
                <span className="profile-hero-pill pill-indigo">
                  <IconClock size={13} />
                  {shift?.name || employee.shift_name || "General Shift"}
                  <span className="opacity-75 ms-1">({shift?.start_time || "10:00"} - {shift?.end_time || "18:00"})</span>
                </span>
                <span className="profile-hero-pill pill-slate">
                  <IconBriefcase size={13} />
                  {employee.designation || "Designation Not Set"} • {employee.department || "General"}
                </span>
                {tenure && (
                  <span className="profile-hero-pill pill-emerald">
                    <IconCalendar size={13} />
                    {tenure}
                  </span>
                )}
                <span className="profile-hero-pill pill-light">
                  <IconBuilding size={13} />
                  Bhatt Square Pvt Ltd
                </span>
              </div>

              {/* Contact metadata strip */}
              <div className="d-flex flex-wrap align-items-center gap-3 text-secondary small">
                {employee.email && (
                  <a href={`mailto:${employee.email}`} className="text-decoration-none text-secondary d-inline-flex align-items-center gap-1 hover-primary">
                    <IconMail size={15} className="text-primary" /> {employee.email}
                  </a>
                )}
                {employee.phone && (
                  <a href={`tel:${employee.phone}`} className="text-decoration-none text-secondary d-inline-flex align-items-center gap-1 hover-primary">
                    <IconPhone size={15} className="text-primary" /> {employee.phone}
                  </a>
                )}
                <span className="d-inline-flex align-items-center gap-1 text-muted">
                  <IconCalendar size={15} /> Joined {formatDate(employee.joining_date)}
                </span>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="d-flex align-items-center gap-2 align-self-stretch align-self-lg-center justify-content-end flex-wrap header-actions-group">
            {!isMe && (
              <button
                type="button"
                className="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2 fw-semibold px-3 py-2 shadow-xs"
                onClick={openShiftModal}
              >
                <IconClock size={17} /> Change Shift
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center gap-2 fw-semibold px-3 py-2"
              onClick={openEditModal}
            >
              <IconEdit size={17} /> Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Modern Tab Navigation */}
      <div className="profile-tabs-nav mb-4">
        <button
          type="button"
          className={`profile-tab-button ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <IconBriefcase size={17} />
          <span>Work & Shift</span>
        </button>
        <button
          type="button"
          className={`profile-tab-button ${activeTab === "personal" ? "is-active" : ""}`}
          onClick={() => setActiveTab("personal")}
        >
          <IconUser size={17} />
          <span>
            <span className="d-none d-sm-inline">Personal & Documents</span>
            <span className="d-sm-none">Personal & Docs</span>
          </span>
        </button>
        <button
          type="button"
          className={`profile-tab-button ${activeTab === "compensation" ? "is-active" : ""}`}
          onClick={() => setActiveTab("compensation")}
        >
          <IconWallet size={17} />
          <span>Salary & Bank</span>
        </button>
        <button
          type="button"
          className={`profile-tab-button ${activeTab === "leave" ? "is-active" : ""}`}
          onClick={() => setActiveTab("leave")}
        >
          <IconCalendarStats size={17} />
          <span>
            <span className="d-none d-sm-inline">Leave Entitlement</span>
            <span className="d-sm-none">Leaves</span>
          </span>
        </button>
      </div>

      {/* Tab 1: Work & Shift Overview */}
      {activeTab === "overview" && (
        <div className="tab-fade-in">
          {/* Work Shift & Schedule Hero Card */}
          <div className="profile-section-card border-indigo-subtle mb-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
              <div>
                <div className="d-flex align-items-center gap-2">
                  <div className="icon-box-indigo">
                    <IconClock size={20} />
                  </div>
                  <div>
                    <h5 className="mb-0 fw-bold">Work Shift & Schedule</h5>
                    <div className="d-flex align-items-center gap-2 mt-0.5">
                      <span className={`badge ${isShiftCustom ? "bg-primary-subtle text-primary" : "bg-secondary-subtle text-secondary"}`}>
                        {isShiftCustom ? "Custom Assigned Shift" : "Company Default Shift"}
                      </span>
                      {shift?.code && <span className="badge bg-light text-dark border">Code: {shift.code}</span>}
                    </div>
                  </div>
                </div>
              </div>
              {!isMe && (
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1.5 fw-semibold"
                  onClick={openShiftModal}
                >
                  <IconClock size={15} /> Reassign Shift
                </button>
              )}
            </div>

            {/* Visual Shift Schedule Timeline */}
            <div className="shift-timeline-bar mb-4 p-3 rounded-3 bg-light border">
              <div className="d-flex justify-content-between align-items-center text-xs text-muted mb-1.5 fw-semibold text-uppercase timeline-milestones">
                <span>Start: {shift?.start_time || "10:00"}</span>
                <span>Grace Ends: +{shift?.late_grace_minutes ?? 15}m</span>
                <span>Early Cutoff: -{shift?.early_checkout_grace_minutes ?? 15}m</span>
                <span>End: {shift?.end_time || "18:00"}</span>
              </div>
              <div className="progress" style={{ height: "8px" }}>
                <div className="progress-bar bg-success" style={{ width: "20%" }} title="Normal arrival window" />
                <div className="progress-bar bg-primary" style={{ width: "55%" }} title="Core working hours" />
                <div className="progress-bar bg-warning" style={{ width: "15%" }} title="Early departure grace threshold" />
                <div className="progress-bar bg-info" style={{ width: "10%" }} title="Shift completion" />
              </div>
              <div className="d-flex justify-content-between text-muted mt-1.5 timeline-subtext" style={{ fontSize: "11px" }}>
                <span>Punch in window</span>
                <span>Standard full work duration</span>
                <span>End threshold</span>
              </div>
            </div>

            {/* Shift Rules Grid */}
            <div className="row g-3">
              <div className="col-sm-6 col-lg-3">
                <ProfileInfoCard
                  theme="indigo"
                  icon={<IconClock size={18} />}
                  label="Daily Working Hours"
                  value={`${shift?.start_time || "10:00"} - ${shift?.end_time || "18:00"}`}
                  subtext="Expected daily office hours"
                />
              </div>
              <div className="col-sm-6 col-lg-3">
                <ProfileInfoCard
                  theme="amber"
                  icon={<IconClock size={18} />}
                  label="Late Arrival Grace"
                  value={`${shift?.late_grace_minutes ?? 15} Minutes`}
                  subtext="Grace before marked Late"
                />
              </div>
              <div className="col-sm-6 col-lg-3">
                <ProfileInfoCard
                  theme="rose"
                  icon={<IconAlertCircle size={18} />}
                  label="Early Checkout Rule"
                  value={`${shift?.early_checkout_grace_minutes ?? 15} Mins Grace`}
                  subtext={`Penalty: ${shift?.early_checkout_penalty_label || (shift?.early_checkout_penalty === "PRO_RATED" ? "Pro-Rated Deduction" : "Half Day Deduction")}`}
                />
              </div>
              <div className="col-sm-6 col-lg-3">
                <ProfileInfoCard
                  theme="emerald"
                  icon={<IconFileText size={18} />}
                  label="Attendance Credit Hours"
                  value={`Half: ${shift?.min_hours_half_day ?? 4}h • Full: ${shift?.min_hours_full_day ?? 8}h`}
                  subtext="Required hours threshold"
                />
              </div>
            </div>
          </div>

          {/* Two-Column Grid: Employment Details & Quick Metadata */}
          <div className="row g-4">
            <div className="col-lg-8">
              <div className="profile-section-card h-100">
                <div className="section-header-row mb-3">
                  <div>
                    <h5 className="mb-0 fw-bold">Employment Details</h5>
                    <p className="text-muted small mb-0">Role, department, organizational alignment, and account status.</p>
                  </div>
                  <span className="badge bg-light text-secondary border">Official Record</span>
                </div>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="sky"
                      icon={<IconId size={18} />}
                      label="Employee ID"
                      value={employee.employee_id}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="sky"
                      icon={<IconCalendar size={18} />}
                      label="Joining Date"
                      value={formatDate(employee.joining_date)}
                      subtext={tenure || undefined}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconBriefcase size={18} />}
                      label="Department"
                      value={employee.department}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconBriefcase size={18} />}
                      label="Designation"
                      value={employee.designation}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="default"
                      icon={<IconBuilding size={18} />}
                      label="Company"
                      value="Bhatt Square Pvt Ltd"
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="default"
                      icon={<IconUsers size={18} />}
                      label="Employment Type"
                      value={employee.employment_type_label || employee.employment_type}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconClock size={18} />}
                      label="Assigned Work Shift"
                      value={shift?.name || employee.shift_name || "General Shift"}
                      subtext={isShiftCustom ? "Custom assigned" : "Company default"}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme={employee.status === "ACTIVE" ? "emerald" : employee.status === "INACTIVE" || employee.status === "TERMINATED" ? "rose" : "amber"}
                      icon={<IconShieldCheck size={18} />}
                      label="Employment Status"
                      value={employee.status_label || employee.status}
                      subtext={employee.status_end_date ? `Effective until ${formatDate(employee.status_end_date)}` : "Current standing status"}
                    />
                  </div>

                  {employee.status_end_date && (
                    <>
                      <div className="col-sm-6">
                        <ProfileInfoCard
                          theme="amber"
                          icon={<IconCalendar size={18} />}
                          label="Status Effective End Date"
                          value={formatDate(employee.status_end_date)}
                        />
                      </div>
                      <div className="col-sm-6">
                        <ProfileInfoCard
                          theme="amber"
                          icon={<IconShieldCheck size={18} />}
                          label="Next Auto Transition"
                          value={employee.auto_transition_status_label || employee.auto_transition_status || "-"}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Column: Reporting Line & System Audit */}
            <div className="col-lg-4">
              <div className="d-flex flex-column gap-3">
                {/* Reporting Line Card */}
                <div className="profile-section-card">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <div className="icon-box-purple">
                      <IconUser size={18} />
                    </div>
                    <div>
                      <h6 className="mb-0 fw-bold">Reporting Manager</h6>
                      <small className="text-muted">Direct supervisory line</small>
                    </div>
                  </div>
                  <div className="p-3 bg-light rounded-3 border">
                    <div className="fw-semibold text-dark fs-6">{employee.reporting_manager || "Direct to Organization Head"}</div>
                    <small className="text-muted d-block mt-0.5">Primary approver for leaves & attendance requests</small>
                  </div>
                </div>

                {/* Emergency Contact Card */}
                <div className="profile-section-card">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <div className="icon-box-rose">
                      <IconPhoneCall size={18} />
                    </div>
                    <div>
                      <h6 className="mb-0 fw-bold">Emergency Contact</h6>
                      <small className="text-muted">Emergency phone & family</small>
                    </div>
                  </div>
                  <div className="p-3 bg-light rounded-3 border">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <span className="fw-semibold text-dark">{displayValue(employee.emergency_contact_name)}</span>
                      {employee.emergency_contact_relationship && (
                        <span className="badge bg-white text-secondary border">
                          {employee.emergency_contact_relationship}
                        </span>
                      )}
                    </div>
                    {employee.emergency_contact_phone ? (
                      <a href={`tel:${employee.emergency_contact_phone}`} className="btn btn-sm btn-outline-danger w-100 mt-2 d-inline-flex align-items-center justify-content-center gap-1.5">
                        <IconPhone size={14} /> Call {employee.emergency_contact_phone}
                      </a>
                    ) : (
                      <span className="text-muted small">No emergency number provided</span>
                    )}
                  </div>
                </div>


              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Personal & Documents */}
      {activeTab === "personal" && (
        <div className="tab-fade-in">
          <div className="row g-4 mb-4">
            {/* Personal Details */}
            <div className="col-lg-8">
              <div className="profile-section-card h-100">
                <div className="section-header-row mb-3">
                  <div>
                    <h5 className="mb-0 fw-bold">Personal Information</h5>
                    <p className="text-muted small mb-0">Identity and contact details captured from onboarding form.</p>
                  </div>
                  <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1.5" onClick={openEditModal}>
                    <IconEdit size={14} /> Edit Details
                  </button>
                </div>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="emerald"
                      icon={<IconUser size={18} />}
                      label="Full Legal Name"
                      value={employee.full_name}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="emerald"
                      icon={<IconMail size={18} />}
                      label="Primary Email"
                      value={employee.email}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="emerald"
                      icon={<IconPhone size={18} />}
                      label="Phone Number"
                      value={employee.phone}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="emerald"
                      icon={<IconCalendar size={18} />}
                      label="Date of Birth"
                      value={formatDate(employee.date_of_birth)}
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconId size={18} />}
                      label="Aadhaar Number"
                      value={employee.aadhaar_number}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconMapPin size={18} />}
                      label="Residential Address"
                      value={employee.address}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contact Card */}
            <div className="col-lg-4">
              <div className="profile-section-card h-100">
                <div className="section-header-row mb-3">
                  <div>
                    <h5 className="mb-0 fw-bold">Emergency Contact</h5>
                    <p className="text-muted small mb-0">Urgent notifications</p>
                  </div>
                </div>

                <div className="d-flex flex-column gap-3">
                  <ProfileInfoCard
                    theme="rose"
                    icon={<IconUsers size={18} />}
                    label="Contact Name"
                    value={employee.emergency_contact_name}
                  />
                  <ProfileInfoCard
                    theme="rose"
                    icon={<IconShieldCheck size={18} />}
                    label="Relationship"
                    value={employee.emergency_contact_relationship}
                  />
                  <ProfileInfoCard
                    theme="rose"
                    icon={<IconPhone size={18} />}
                    label="Contact Phone Number"
                    value={employee.emergency_contact_phone}
                    isCopyable
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Documents Section */}
          <div className="profile-section-card">
            <div className="section-header-row mb-3">
              <div>
                <h5 className="mb-0 fw-bold">Verified Onboarding Documents</h5>
                <p className="text-muted small mb-0">Official identity proof and credentials uploaded during onboarding.</p>
              </div>
              <span className="badge bg-light text-secondary border">Document Repository</span>
            </div>

            <div className="row g-3">
              {[
                { label: "Profile Photo", url: employee.profile_photo_url, type: "Identity Avatar Image", icon: <IconUser size={22} className="text-primary" /> },
                { label: "PAN Card Document", url: employee.pan_card_document_url, type: "Tax Identification Card", icon: <IconFileText size={22} className="text-info" /> },
                { label: "Aadhaar Card Document", url: employee.aadhaar_document_url, type: "Government ID Card", icon: <IconId size={22} className="text-success" /> },
                { label: "CV / Resume", url: employee.cv_document_url, type: "Professional Resume", icon: <IconBriefcase size={22} className="text-purple" /> },
              ].map((doc) => (
                <div className="col-md-6 col-xl-3" key={doc.label}>
                  <div className="document-preview-card p-3 rounded-3 border bg-white h-100 d-flex flex-column justify-content-between shadow-xs">
                    <div className="d-flex align-items-start gap-3 mb-3">
                      <div className="p-2.5 rounded-3 bg-light border shadow-2xs flex-shrink-0">
                        {doc.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="fw-semibold text-dark text-truncate" title={doc.label}>{doc.label}</div>
                        <div className="text-muted small mt-0.5" style={{ fontSize: "12px" }}>{doc.type}</div>
                      </div>
                    </div>

                    <div className="d-flex align-items-center justify-content-between pt-2.5 mt-2 border-top flex-wrap gap-2">
                      <span className={`badge ${doc.url ? "bg-success-subtle text-success border border-success-subtle" : "bg-secondary-subtle text-secondary border border-secondary-subtle"}`}>
                        {doc.url ? "Uploaded & Verified" : "Not Uploaded"}
                      </span>
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 py-1 px-2.5 fw-semibold"
                        >
                          <IconEye size={14} /> Preview
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={openEditModal}
                          className="btn btn-sm btn-light border text-secondary d-inline-flex align-items-center gap-1 py-1 px-2.5"
                          title="Upload this document"
                        >
                          <IconUpload size={13} /> Upload
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Salary & Bank */}
      {activeTab === "compensation" && (
        <div className="tab-fade-in">
          {/* Compensation Banner */}
          <div className="compensation-banner mb-4 p-4 rounded-3 border">
            <div className="row g-3 align-items-center">
              <div className="col-md-4 compensation-col border-md-end">
                <div className="text-uppercase small fw-bold text-muted letter-spacing-1">Annual CTC Salary</div>
                <div className="h2 compensation-figure mb-0 fw-bold text-success mt-1">{formatCurrency(employee.annual_salary)}</div>
                <small className="text-muted">Total annual compensation package</small>
              </div>
              <div className="col-md-4 compensation-col border-md-end">
                <div className="text-uppercase small fw-bold text-muted letter-spacing-1">Estimated Monthly Gross</div>
                <div className="h3 compensation-figure mb-0 fw-bold text-dark mt-1">
                  {employee.annual_salary ? formatCurrency(String(Number(employee.annual_salary) / 12)) : "Not set"}
                </div>
                <small className="text-muted">Calculated on 12 month basis</small>
              </div>
              <div className="col-md-4 compensation-col">
                <div className="text-uppercase small fw-bold text-muted letter-spacing-1">Pay Frequency</div>
                <div className="h4 compensation-figure mb-0 fw-bold text-primary mt-1">{employee.pay_frequency_label || employee.pay_frequency || "Monthly"}</div>
                <small className="text-muted">Company disbursement cycle</small>
              </div>
            </div>
          </div>

          <div className="row g-4">
            {/* Bank Account Details */}
            <div className="col-lg-6">
              <div className="profile-section-card h-100">
                <div className="section-header-row mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <div className="icon-box-emerald">
                      <IconBuildingBank size={20} />
                    </div>
                    <div>
                      <h5 className="mb-0 fw-bold">Bank Account Details</h5>
                      <small className="text-muted">Account information for salary direct deposit</small>
                    </div>
                  </div>
                </div>

                <div className="d-flex flex-column gap-3">
                  <ProfileInfoCard
                    theme="emerald"
                    icon={<IconBuildingBank size={18} />}
                    label="Bank Name"
                    value={employee.bank_name}
                  />
                  <ProfileInfoCard
                    theme="emerald"
                    icon={<IconId size={18} />}
                    label="Bank Account Number"
                    value={employee.bank_account_number}
                    isCopyable
                  />
                  <ProfileInfoCard
                    theme="emerald"
                    icon={<IconBuildingBank size={18} />}
                    label="IFSC Code"
                    value={employee.ifsc_code}
                    isCopyable
                  />
                </div>
              </div>
            </div>

            {/* Statutory & Tax IDs */}
            <div className="col-lg-6">
              <div className="profile-section-card h-100">
                <div className="section-header-row mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <div className="icon-box-indigo">
                      <IconFileText size={20} />
                    </div>
                    <div>
                      <h5 className="mb-0 fw-bold">Statutory & Tax Registrations</h5>
                      <small className="text-muted">Government IDs for payroll deductions & PF compliance</small>
                    </div>
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconFileText size={18} />}
                      label="PAN Number / Tax ID"
                      value={employee.pan_number || employee.tax_id}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconId size={18} />}
                      label="P.F. Account Number"
                      value={employee.pf_number}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconId size={18} />}
                      label="Universal Account No. (UAN)"
                      value={employee.uan_number}
                      isCopyable
                    />
                  </div>
                  <div className="col-sm-6">
                    <ProfileInfoCard
                      theme="indigo"
                      icon={<IconShieldCheck size={18} />}
                      label="ESIC Number"
                      value={employee.esic_number}
                      isCopyable
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Leave Entitlement */}
      {activeTab === "leave" && (
        <div className="tab-fade-in">
          {leavePolicy ? (
            <div className="profile-section-card" id="leave-entitlement">
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
                <div>
                  <h5 className="mb-1 fw-bold">Paid Leave Entitlement ({leavePolicy.year})</h5>
                  <p className="text-secondary mb-0 small">
                    Balances based on company policy
                    {leavePolicy.is_prorated ? `, prorated across ${leavePolicy.eligible_months} eligible months from the joining month.` : "."}
                  </p>
                </div>
                {!isMe && (
                  <button
                    className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1.5 fw-semibold"
                    onClick={() => setIsEditingLeavePolicy(!isEditingLeavePolicy)}
                  >
                    <IconEdit size={16} /> {isEditingLeavePolicy ? "Cancel" : "Edit Entitlement Overrides"}
                  </button>
                )}
              </div>

              {isEditingLeavePolicy && (
                <div className="p-3 bg-light rounded-3 border mb-4">
                  <h6 className="fw-bold mb-2">Override Annual Entitlement Days</h6>
                  {leavePolicyError && <div className="alert alert-danger py-2 small mb-3">{leavePolicyError}</div>}
                  <div className="row g-3 align-items-end">
                    <div className="col-md-5">
                      <label className="form-label small fw-semibold">Annual Casual / PL Override</label>
                      <input
                        type="number"
                        min="0"
                        max="365"
                        step="0.5"
                        className="form-control"
                        value={casualOverride}
                        onChange={(e) => setCasualOverride(e.target.value)}
                        placeholder={`Company default: ${leavePolicy.company_casual_leave_days}`}
                      />
                      <div className="form-text small">Leave blank to follow default policy.</div>
                    </div>
                    <div className="col-md-5">
                      <label className="form-label small fw-semibold">Annual Sick Leave Override</label>
                      <input
                        type="number"
                        min="0"
                        max="365"
                        step="0.5"
                        className="form-control"
                        value={sickOverride}
                        onChange={(e) => setSickOverride(e.target.value)}
                        placeholder={`Company default: ${leavePolicy.company_sick_leave_days}`}
                      />
                      <div className="form-text small">Leave blank to follow default policy.</div>
                    </div>
                    <div className="col-md-2">
                      <button className="btn btn-primary w-100" onClick={saveLeavePolicy} disabled={isSavingLeavePolicy}>
                        {isSavingLeavePolicy ? "Saving..." : "Save Override"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Balances Grid with Visual Progress */}
              <div className="row g-3 mb-4">
                {leavePolicy.balances.map((balance) => {
                  const percentUsed = balance.entitlement > 0 ? Math.min(100, Math.round((balance.used / balance.entitlement) * 100)) : 0;
                  return (
                    <div className="col-sm-6 col-xl-4" key={balance.leave_type}>
                      <div className="leave-balance-card p-3 rounded-3 border bg-white h-100 shadow-xs">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <span className="fw-semibold text-dark">{balance.label}</span>
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            {balance.remaining} Left
                          </span>
                        </div>
                        <div className="d-flex align-items-baseline gap-1 mb-2">
                          <span className="h4 mb-0 fw-bold text-dark">{balance.remaining}</span>
                          <span className="text-muted small">of {balance.entitlement} days entitlement</span>
                        </div>
                        <div className="progress mb-2" style={{ height: "6px" }}>
                          <div
                            className="progress-bar bg-success"
                            style={{ width: `${100 - percentUsed}%` }}
                            title={`${balance.remaining} days remaining`}
                          />
                        </div>
                        <div className="d-flex justify-content-between text-muted" style={{ fontSize: "11px" }}>
                          <span>{balance.used} days used</span>
                          <span>{balance.entitlement} total assigned</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leave Applications Table */}
              <h6 className="fw-bold mb-3">Leave Applications History</h6>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ minWidth: "520px" }}>
                  <thead className="table-light">
                    <tr>
                      <th>Leave Type</th>
                      <th>Duration Period</th>
                      <th>Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leavePolicy.leave_requests.length ? (
                      leavePolicy.leave_requests.map((leave) => (
                        <tr key={leave.id}>
                          <td className="fw-semibold text-dark">
                            {leave.leave_type_label}
                            {leave.is_half_day && <span className="badge bg-light text-secondary ms-1.5 border">Half Day</span>}
                          </td>
                          <td>
                            {formatDate(leave.start_date)} - {formatDate(leave.end_date)}
                          </td>
                          <td className="text-break" style={{ maxWidth: 360 }}>
                            {leave.reason}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                leave.status === "APPROVED"
                                  ? "bg-success-subtle text-success border border-success-subtle"
                                  : leave.status === "REJECTED"
                                  ? "bg-danger-subtle text-danger border border-danger-subtle"
                                  : "bg-warning-subtle text-warning border border-warning-subtle"
                              }`}
                            >
                              {leave.status_label}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="text-center text-secondary py-4">
                          No leave applications recorded for this employee.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card border-0 shadow-sm p-4 text-center text-muted">
              Leave policy data is not configured for this employee.
            </div>
          )}
        </div>
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
                <Modal.Title className="h5 mb-0 fw-bold">Edit Employee Profile</Modal.Title>
                <small className="text-muted">Update personal information, emergency contacts, and document attachments</small>
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

            {/* Profile Photo Upload */}
            <div className="p-3 mb-4 rounded-3 border bg-light d-flex align-items-center gap-4 flex-wrap">
              <img
                src={photoPreview || employee.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                alt={employee.full_name}
                className="rounded-circle border border-2 border-white shadow-sm"
                style={{ width: "72px", height: "72px", objectFit: "cover" }}
              />
              <div className="flex-grow-1">
                <label className="form-label fw-semibold mb-1">Profile Photo</label>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="form-control form-control-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setProfilePhotoFile(file);
                  }}
                />
                <div className="form-text small">Accepted formats: JPG, PNG, WEBP. Max 10MB.</div>
              </div>
            </div>

            <h6 className="fw-bold mb-3 text-uppercase text-secondary small letter-spacing-1">Personal Information</h6>
            <Row className="g-3 mb-4">
              <Col xs={12} md={6}>
                <Form.Group controlId="editFullName">
                  <Form.Label className="fw-semibold small">Full Name *</Form.Label>
                  <Form.Control
                    type="text"
                    required
                    value={personalForm.full_name}
                    onChange={(e) => updatePersonalField("full_name", e.target.value)}
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
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editDob">
                  <Form.Label className="fw-semibold small">Date of Birth</Form.Label>
                  <Form.Control
                    type="date"
                    value={personalForm.date_of_birth}
                    onChange={(e) => updatePersonalField("date_of_birth", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editAadhaar">
                  <Form.Label className="fw-semibold small">Aadhaar Number (12 Digits)</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.aadhaar_number}
                    onChange={(e) => updatePersonalField("aadhaar_number", e.target.value)}
                    maxLength={12}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editTaxId">
                  <Form.Label className="fw-semibold small">PAN / Tax ID</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.tax_id}
                    onChange={(e) => updatePersonalField("tax_id", e.target.value)}
                    maxLength={20}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={6}>
                <Form.Group controlId="editAddress">
                  <Form.Label className="fw-semibold small">Residential Address</Form.Label>
                  <Form.Control
                    type="text"
                    value={personalForm.address}
                    onChange={(e) => updatePersonalField("address", e.target.value)}
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
                  />
                </Form.Group>
              </Col>
            </Row>

            <h6 className="fw-bold mb-3 text-uppercase text-secondary small letter-spacing-1">Document Attachments</h6>
            <Row className="g-3">
              <Col xs={12} md={4}>
                <Form.Group controlId="editAadhaarDoc">
                  <Form.Label className="fw-semibold small">Aadhaar Card File</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e: any) => setAadhaarDocFile(e.target.files?.[0] || null)}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={4}>
                <Form.Group controlId="editPanDoc">
                  <Form.Label className="fw-semibold small">PAN Card File</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e: any) => setPanDocFile(e.target.files?.[0] || null)}
                  />
                </Form.Group>
              </Col>
              <Col xs={12} md={4}>
                <Form.Group controlId="editCvDoc">
                  <Form.Label className="fw-semibold small">CV / Resume File</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e: any) => setCvDocFile(e.target.files?.[0] || null)}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>

          <Modal.Footer className="border-top-0 pt-0 pb-4 px-4">
            <Button variant="outline-secondary" onClick={closeEditModal} disabled={isSavingProfile}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSavingProfile} className="d-inline-flex align-items-center gap-2 fw-semibold">
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

      {/* Assign Work Shift Modal */}
      <Modal show={isShiftModalOpen} onHide={closeShiftModal} centered>
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center gap-2">
            <IconClock size={20} className="text-primary" />
            Assign Work Shift
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSaveShift}>
          <Modal.Body>
            {shiftErrorMessage && (
              <div className="alert alert-danger mb-3 py-2 small">{shiftErrorMessage}</div>
            )}
            {shiftSuccessMessage && (
              <div className="alert alert-success mb-3 py-2 small">{shiftSuccessMessage}</div>
            )}

            <div className="d-flex align-items-center gap-3 p-3 bg-light rounded-3 mb-3 border">
              <img
                src={employee?.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                alt={employee?.full_name || "Employee"}
                className="rounded-circle flex-shrink-0"
                style={{ width: "42px", height: "42px", objectFit: "cover" }}
              />
              <div className="min-w-0">
                <div className="fw-semibold text-dark">{employee?.full_name}</div>
                <div className="text-muted small">{employee?.employee_id} • {employee?.designation || employee?.department || "Employee"}</div>
              </div>
            </div>

            <Form.Group className="mb-3" controlId="profileWorkShiftSelect">
              <Form.Label className="fw-semibold">Select Work Shift</Form.Label>
              <Form.Select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
              >
                <option value="">Default Company Shift (Standard Hours)</option>
                {availableShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                    {s.is_night_shift ? " 🌙 Night Shift" : ""}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted small mt-1.5 d-block">
                Assigned shift determines expected check-in/check-out times, grace period, and early departure salary deduction rules.
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeShiftModal} disabled={isSavingShift}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSavingShift} className="d-flex align-items-center gap-2 fw-semibold">
              {isSavingShift ? (
                <>
                  <Spinner size="sm" />
                  Saving...
                </>
              ) : (
                "Save Shift Assignment"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modern Executive Styling */}
      <style jsx global>{`
        .employee-profile-wrapper {
          max-width: 1300px;
          margin: 0 auto;
        }

        .executive-profile-header {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
          padding: 24px 28px;
          position: relative;
        }

        .profile-hero-avatar {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #f8fafc;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          background: #f1f5f9;
        }

        .avatar-edit-fab {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #0ea66b;
          color: #ffffff;
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }

        .avatar-edit-fab:hover {
          background: #0b8a57;
          transform: scale(1.08);
        }

        .profile-hero-name {
          font-size: 1.55rem;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.02em;
        }

        .status-indicator-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          margin-right: 6px;
          animation: pulseDot 2s infinite ease-in-out;
        }

        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }

        .profile-hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .pill-indigo {
          background: #eef2ff;
          color: #4338ca;
          border: 1px solid #e0e7ff;
        }

        .pill-slate {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #e2e8f0;
        }

        .pill-emerald {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #d1fae5;
        }

        .pill-light {
          background: #ffffff;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }

        /* Modern Tabs */
        .profile-tabs-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          padding: 6px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
        }

        .profile-tabs-nav::-webkit-scrollbar {
          display: none;
        }

        .profile-tab-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 18px;
          border: none;
          background: transparent;
          color: #64748b;
          font-size: 13.5px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .profile-tab-button:hover {
          color: #0f172a;
          background: rgba(255, 255, 255, 0.6);
        }

        .profile-tab-button.is-active {
          background: #ffffff;
          color: #0ea66b;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
        }

        .tab-counter-badge {
          background: #eaf8f1;
          color: #0ea66b;
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 10px;
          font-weight: 700;
        }

        /* Section Cards */
        .profile-section-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 22px 24px;
          box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03);
          transition: border-color 0.15s ease;
        }

        .border-indigo-subtle {
          border-color: #e0e7ff;
        }

        .section-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        /* Info Item Cards */
        .profile-info-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 13px 15px;
          border-radius: 10px;
          border: 1px solid #eef2f6;
          background: #fbfcfe;
          height: 100%;
          transition: all 0.15s ease;
        }

        .profile-info-card:hover {
          border-color: #cbd5e1;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
        }

        .profile-info-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .icon-default, .icon-sky { background: #e0f2fe; color: #0284c7; }
        .icon-emerald { background: #eaf8f1; color: #0ea66b; }
        .icon-indigo { background: #eef2ff; color: #4f46e5; }
        .icon-amber { background: #fef3c7; color: #d97706; }
        .icon-rose { background: #ffe4e6; color: #e11d48; }
        .icon-purple { background: #f3e8ff; color: #9333ea; }
        .icon-slate { background: #f1f5f9; color: #475569; }

        .icon-box-indigo {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: #eef2ff;
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-box-emerald {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: #eaf8f1;
          color: #0ea66b;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-box-purple {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: #f3e8ff;
          color: #9333ea;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-box-rose {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: #ffe4e6;
          color: #e11d48;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-box-slate {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: #f1f5f9;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .profile-info-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 2px;
        }

        .profile-info-value {
          font-size: 13.5px;
          font-weight: 600;
          color: #0f172a;
          line-height: 1.35;
        }

        .profile-info-subtext {
          font-size: 11px;
          color: #94a3b8;
          margin-top: 2px;
        }

        .copy-btn {
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.15s ease;
        }

        .copy-btn:hover {
          opacity: 1;
        }

        .compensation-banner {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        }

        .hover-primary:hover {
          color: #0ea66b !important;
        }

        .tab-fade-in {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Responsive Breakpoints for Tablet & Mobile */
        @media (min-width: 768px) {
          .compensation-col.border-md-end {
            border-right: 1px solid #e2e8f0;
          }
        }

        @media (max-width: 767.98px) {
          .executive-profile-header {
            padding: 20px 18px;
          }

          .compensation-banner {
            padding: 18px 16px !important;
          }

          .compensation-col:not(:last-child) {
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 14px;
          }

          .compensation-figure {
            font-size: 1.45rem !important;
          }
        }

        @media (max-width: 575.98px) {
          .executive-profile-header {
            padding: 16px 14px;
            border-radius: 12px;
          }

          .profile-hero-avatar {
            width: 76px;
            height: 76px;
          }

          .avatar-edit-fab {
            width: 26px;
            height: 26px;
          }

          .profile-hero-name {
            font-size: 1.3rem;
          }

          .profile-hero-pill {
            font-size: 11px;
            padding: 3px 8px;
          }

          .header-actions-group {
            width: 100%;
            display: flex !important;
            gap: 8px;
          }

          .header-actions-group .btn {
            flex: 1 1 0;
            font-size: 13.5px;
            padding: 9px 8px;
            white-space: nowrap;
          }

          .profile-topbar {
            margin-bottom: 12px !important;
          }

          .profile-back-btn {
            font-size: 12.5px;
            padding: 6px 10px;
          }

          .profile-section-card {
            padding: 16px 14px;
            border-radius: 12px;
          }

          .profile-info-card {
            padding: 10px 12px;
          }

          .profile-info-icon {
            width: 32px;
            height: 32px;
          }

          .profile-info-value {
            font-size: 13px;
          }

          .shift-timeline-bar {
            padding: 12px !important;
          }

          .timeline-milestones {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 6px 8px;
            font-size: 11px !important;
            margin-bottom: 8px !important;
          }

          .timeline-subtext {
            font-size: 10px !important;
          }

          .timeline-subtext span:nth-child(2) {
            display: none;
          }
        }

        /* Mobile Segmented 2x2 Tab Grid (< 640px) */
        @media (max-width: 640px) {
          .profile-tabs-nav {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            background: #ffffff !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 14px !important;
            padding: 8px !important;
            box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04) !important;
            overflow-x: visible !important;
          }

          .profile-tab-button {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 7px !important;
            padding: 10px 8px !important;
            font-size: 12.5px !important;
            font-weight: 600 !important;
            border-radius: 10px !important;
            border: 1px solid #f1f5f9 !important;
            background: #f8fafc !important;
            color: #475569 !important;
            white-space: nowrap !important;
            min-height: 44px !important;
            transition: all 0.15s ease !important;
          }

          .profile-tab-button:hover {
            background: #f1f5f9 !important;
            color: #0f172a !important;
          }

          .profile-tab-button.is-active {
            background: #ecfdf5 !important;
            color: #065f46 !important;
            border: 1.5px solid #a7f3d0 !important;
            box-shadow: 0 2px 8px rgba(14, 166, 107, 0.12) !important;
            font-weight: 700 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default EmployeeProfileClient;
