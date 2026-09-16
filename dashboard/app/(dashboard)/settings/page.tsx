"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Col, Row, Button, Form, Alert, Tabs, Tab, Badge, Spinner } from "react-bootstrap";
import Swal from 'sweetalert2';
import {
  IconSettings,
  IconClock,
  IconBuildingBank,
  IconBell,
  IconShieldLock,
  IconMail,
  IconDeviceDesktop,
  IconCheck,
  IconX,
  IconDeviceFloppy,
  IconCopy,
  IconRefresh,
  IconCalendar,
  IconHeart,
  IconUsers,
  IconBriefcase,
  IconMapPin,
  IconWifi,
  IconCurrentLocation,
  IconAlertTriangle,
  IconTrendingUp,
  IconKey,
  IconLink,
  IconEye,
  IconEyeOff,
  IconCreditCard,
  IconInfoCircle,
  IconArrowUpRight,
  IconExternalLink,
} from "@tabler/icons-react";
import DasherBreadcrumb from "components/common/DasherBreadcrumb";

const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").replace(/\/$/, "");

// API utility to get auth headers
const authHeaders = () => {
  const token = localStorage.getItem("authToken");
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

import { useBranding } from "context/BrandingContext";

// Types for our settings
interface AttendanceSettings {
  shiftStartTime: string;
  lateCutoffTime: string;
  shiftEndTime: string;
  autoCheckoutEnabled: boolean;
  autoCheckoutTime: string;
  ipRestrictionEnabled: boolean;
  allowedIpRanges: string;
  geofencingEnabled: boolean;
  officeLatitude: string;
  officeLongitude: string;
  geofenceRadius: number;
}

interface NotificationSettings {
  emailNotifications: boolean;
  lateEntryAlert: boolean;
  leaveRequestAlert: boolean;
  salaryProcessedAlert: boolean;
  newEmployeeAlert: boolean;
  browserNotifications: boolean;
  weeklyReportEnabled: boolean;
  weeklyReportDay: string;
}

interface CompanySettings {
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  industry: string;
  companySize: string;
  registrationNumber: string;
  taxId: string;
  companyBankName: string;
  companyBankAccountNo: string;
  companyBankIfsc: string;
  companyBankBranch: string;
  companyUpiId: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  workingDays: string[];
}

interface OrganizationAccess {
  id: number;
  name: string;
  invite_code: string;
  api_key?: string;
  plan_name?: string;
  plan_expires_at?: string | null;
  plan_status?: string;
  plan_source?: string;
  days_until_plan_expiry?: number | null;
  is_plan_expiring_soon?: boolean;
  is_plan_expired?: boolean;
  max_employees?: number;
  external_company_id?: string;
  external_source?: string;
  is_simplyjob_linked?: boolean;
  can_manage_invite_code: boolean;
}

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState("company");
  const { companyLogo, setCompanyLogo, refreshBranding } = useBranding();
  const [logo, setLogo] = useState<{ file: File | null; preview: string | null }>({ file: null, preview: null });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingSimplyJob, setIsSyncingSimplyJob] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [myIpInfo, setMyIpInfo] = useState<{ client_ip: string; is_currently_allowed: boolean | null } | null>(null);
  const [isFetchingIp, setIsFetchingIp] = useState(false);
  const [detectedAccuracy, setDetectedAccuracy] = useState<number | null>(null);
  const [organizationAccess, setOrganizationAccess] = useState<OrganizationAccess | null>(null);
  const [isLoadingOrganizationAccess, setIsLoadingOrganizationAccess] = useState(true);
  const [isCreatingOrganizationAccess, setIsCreatingOrganizationAccess] = useState(false);
  const [isUpdatingOrganizationCode, setIsUpdatingOrganizationCode] = useState(false);
  const [organizationCodeNotice, setOrganizationCodeNotice] = useState("");
  const [organizationCodeError, setOrganizationCodeError] = useState("");

  // Detect admin's current GPS location for easy office coord setup
  const detectMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsDetectingLocation(true);
    setDetectedAccuracy(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAttendanceSettings((prev) => ({
          ...prev,
          officeLatitude: position.coords.latitude.toFixed(6),
          officeLongitude: position.coords.longitude.toFixed(6),
        }));
        if (position.coords.accuracy !== undefined) {
          setDetectedAccuracy(Math.round(position.coords.accuracy));
        }
        setIsDetectingLocation(false);
      },
      () => {
        alert("Could not detect your location. Please enable location access in your browser.");
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Fetch admin's detected IP from the backend
  const fetchMyIp = async () => {
    setIsFetchingIp(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${API_URL}/api/v1/attendance/my-ip/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyIpInfo(data);
        // Auto-append to allowed list if not already present
        if (data.client_ip && !attendanceSettings.allowedIpRanges.includes(data.client_ip)) {
          setAttendanceSettings((prev) => ({
            ...prev,
            allowedIpRanges: prev.allowedIpRanges
              ? `${prev.allowedIpRanges}, ${data.client_ip}`
              : data.client_ip,
          }));
        }
      }
    } catch {
      alert("Failed to fetch your IP address. Please try again.");
    } finally {
      setIsFetchingIp(false);
    }
  };

  // Sync / Extract Company Profile from SimplyJob
  const handleSyncFromSimplyJob = async (silent = false) => {
    setIsSyncingSimplyJob(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
      const res = await fetch(`${API_URL}/api/v1/settings/sync-simplyjob/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          const s = data.data;
          setCompanySettings((prev) => ({
            ...prev,
            companyName: s.company_name || prev.companyName,
            companyAddress: s.company_address || prev.companyAddress,
            companyEmail: s.company_email || prev.companyEmail,
            companyPhone: s.company_phone || prev.companyPhone,
            companyWebsite: s.company_website || prev.companyWebsite,
            industry: s.industry || prev.industry,
            companySize: s.company_size || prev.companySize,
            taxId: s.tax_id || prev.taxId,
            registrationNumber: s.registration_number || prev.registrationNumber,
            companyBankName: s.company_bank_name || prev.companyBankName,
            companyBankAccountNo: s.company_bank_account_no || prev.companyBankAccountNo,
            companyBankIfsc: s.company_bank_ifsc || prev.companyBankIfsc,
            companyBankBranch: s.company_bank_branch || prev.companyBankBranch,
            companyUpiId: s.company_upi_id || prev.companyUpiId,
          }));
        }
        if (refreshBranding) {
          await refreshBranding();
        }
        if (!silent) {
          Swal.fire({
            icon: "success",
            title: "Synced from SimplyJob!",
            text: data.message || "Company information extracted successfully.",
            timer: 2500,
            showConfirmButton: false,
          });
        }
      } else {
        if (!silent) {
          Swal.fire({
            icon: "info",
            title: "SimplyJob Sync",
            text: "No external SimplyJob profile data found to sync.",
          });
        }
      }
    } catch (err) {
      if (!silent) {
        Swal.fire({
          icon: "error",
          title: "Sync Failed",
          text: "Could not connect to SimplyJob database.",
        });
      }
    } finally {
      setIsSyncingSimplyJob(false);
    }
  };

  // Load settings from backend on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
        const response = await fetch(`${API_URL}/api/v1/settings/`, {
          headers: authHeaders(),
        });
        
        if (response.ok) {
          const data = await response.json();
            // Update all settings state with data from backend
           setAttendanceSettings({
                    shiftStartTime: data.shift_start_time,
                    lateCutoffTime: data.late_cutoff_time,
                    shiftEndTime: data.shift_end_time,
                    autoCheckoutEnabled: data.auto_checkout_enabled,
                    autoCheckoutTime: data.auto_checkout_time,
                    ipRestrictionEnabled: data.ip_restriction_enabled,
                    allowedIpRanges: data.allowed_ip_ranges || "",
                    geofencingEnabled: data.geofencing_enabled,
                    officeLatitude: data.office_latitude || "",
                    officeLongitude: data.office_longitude || "",
                    geofenceRadius: data.geofence_radius,
                  });

            // Load comprehensive leave settings from backend
            setLeaveSettings({
              sundayUnpaidRuleEnabled: data.sunday_unpaid_rule_enabled,
              burgerRuleEnabled: data.burger_rule_enabled,
              sickLeaveDays: data.sick_leave_days,
              casualLeaveDays: data.casual_leave_days,
              sickLeaveMonthlyLimit: data.sick_leave_monthly_limit ?? 7,
              casualLeaveMonthlyLimit: data.casual_leave_monthly_limit ?? 3,
              maternityLeaveDays: data.maternity_leave_days,
              paternityLeaveDays: data.paternity_leave_days,
              bereavementLeaveDays: data.bereavement_leave_days || 5,
              marriageLeaveDays: data.marriage_leave_days || 10,
              leaveEncashmentEnabled: data.leave_encashment_enabled !== undefined ? data.leave_encashment_enabled : true,
              maxEncashmentDays: data.max_encashment_days || 10,
              clubbingEnabled: data.clubbing_enabled !== undefined ? data.clubbing_enabled : true,
              minDaysBeforeApply: data.min_days_before_apply || 1,
              maxConsecutiveDays: data.max_consecutive_days || 30,
              autoApproveEnabled: data.auto_approve_enabled !== undefined ? data.auto_approve_enabled : false,
              approvalHierarchy: data.approval_hierarchy || "2level",
              requireMedicalCertificate: data.require_medical_certificate || 3,
              nationalHolidaysCount: data.national_holidays_count || 12,
              festivalHolidaysCount: data.festival_holidays_count || 6,
            });

            setNotificationSettings({
             emailNotifications: data.email_notifications,
             lateEntryAlert: data.late_entry_alert,
             leaveRequestAlert: data.leave_request_alert,
             salaryProcessedAlert: data.salary_processed_alert,
             newEmployeeAlert: data.new_employee_alert,
             browserNotifications: data.browser_notifications,
             weeklyReportEnabled: data.weekly_report_enabled,
             weeklyReportDay: data.weekly_report_day,
            });

             setCompanySettings({
              companyName: data.company_name,
              companyAddress: data.company_address,
              companyEmail: data.company_email,
              companyPhone: data.company_phone,
              companyWebsite: data.company_website || "",
              industry: data.industry || "",
              companySize: data.company_size || "",
              registrationNumber: data.registration_number || "",
              taxId: data.tax_id || "",
              companyBankName: data.company_bank_name || "",
              companyBankAccountNo: data.company_bank_account_no || "",
              companyBankIfsc: data.company_bank_ifsc || "",
              companyBankBranch: data.company_bank_branch || "",
              companyUpiId: data.company_upi_id || "",
              timezone: data.timezone,
              currency: data.currency,
              dateFormat: data.date_format,
              workingDays: data.working_days,
            });

            setIncrementSettings({
              incrementEnabled: data.increment_enabled !== undefined ? data.increment_enabled : true,
              defaultIncrementMonths: data.default_increment_months || 12,
              defaultIncrementType: data.default_increment_type || "PERCENTAGE",
              defaultIncrementValue: data.default_increment_value !== undefined ? parseFloat(data.default_increment_value) : 10.00,
            });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOrganizationAccess = async () => {
      try {
        let orgData: any = null;
        const response = await fetch(`${apiRoot}/api/v1/organizations/?scope=me`, { headers: authHeaders() });
        if (response.ok) {
          const data = await response.json();
          const list = Array.isArray(data) ? data : data.results || [];
          if (list.length > 0) orgData = list[0];
        }
        if (!orgData) {
          const fallbackRes = await fetch(`${apiRoot}/api/v1/organizations/`, { headers: authHeaders() });
          if (fallbackRes.ok) {
            const data = await fallbackRes.json();
            const list = Array.isArray(data) ? data : data.results || [];
            const storedUserStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
            const storedUser = storedUserStr ? JSON.parse(storedUserStr) : null;
            orgData = (storedUser?.email && list.find((o: any) => o.owner_email && o.owner_email.toLowerCase() === storedUser.email.toLowerCase())) || list[0];
          }
        }
        if (!orgData && !response.ok) {
          throw new Error(response.status === 401
            ? "Your session has expired. Please sign in again."
            : "Your company workspace could not be loaded. Refresh the page and try again.");
        }
        if (!cancelled) setOrganizationAccess(orgData || null);
      } catch (error) {
        if (!cancelled) {
          setOrganizationCodeError(error instanceof TypeError
            ? "Cannot reach the backend server. Start it, then refresh this page."
            : error instanceof Error ? error.message : "Your company workspace could not be loaded.");
        }
      } finally {
        if (!cancelled) setIsLoadingOrganizationAccess(false);
      }
    };

    loadOrganizationAccess();
    return () => { cancelled = true; };
  }, []);

  // Leave settings state - comprehensive for corporate startup
  const [leaveSettings, setLeaveSettings] = useState({
    // Core leave balances
    sickLeaveDays: 12,
    casualLeaveDays: 6,
    sickLeaveMonthlyLimit: 7,
    casualLeaveMonthlyLimit: 3,
    maternityLeaveDays: 180,
    paternityLeaveDays: 14,
    bereavementLeaveDays: 5,
    marriageLeaveDays: 10,
    
    // Leave policies
    leaveEncashmentEnabled: true,
    maxEncashmentDays: 10,
    sundayUnpaidRuleEnabled: false,
    burgerRuleEnabled: false,
    clubbingEnabled: true,
    minDaysBeforeApply: 1,
    maxConsecutiveDays: 30,
    
    // Approval workflows
    autoApproveEnabled: false,
    approvalHierarchy: "2level", // 1level, 2level
    requireMedicalCertificate: 3, // days after which medical certificate is required
    
    // Holiday settings
    nationalHolidaysCount: 12,
    festivalHolidaysCount: 6,
  });
  
  // Attendance settings state
  const [attendanceSettings, setAttendanceSettings] = useState({
          shiftStartTime: "10:00",
          lateCutoffTime: "10:15",
          shiftEndTime: "18:00",
          autoCheckoutEnabled: true,
          autoCheckoutTime: "20:00",
          ipRestrictionEnabled: false,
          allowedIpRanges: "",
          geofencingEnabled: false,
          officeLatitude: "",
          officeLongitude: "",
          geofenceRadius: 100,
        });

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    lateEntryAlert: true,
    leaveRequestAlert: true,
    salaryProcessedAlert: true,
    newEmployeeAlert: false,
    browserNotifications: true,
    weeklyReportEnabled: true,
    weeklyReportDay: "monday",
  });

  // Company settings state
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    companyName: "Bhatt Square Pvt. Ltd.",
    companyAddress: "123 Business Park, Mumbai, Maharashtra 400001",
    companyEmail: "admin@bhattsquare.com",
    companyPhone: "+91 98765 43210",
    companyWebsite: "",
    industry: "",
    companySize: "",
    registrationNumber: "",
    taxId: "",
    companyBankName: "",
    companyBankAccountNo: "",
    companyBankIfsc: "",
    companyBankBranch: "",
    companyUpiId: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
    dateFormat: "DD/MM/YYYY",
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  });

  // Increment Settings State
  const [incrementSettings, setIncrementSettings] = useState({
    incrementEnabled: true,
    defaultIncrementMonths: 12,
    defaultIncrementType: "PERCENTAGE",
    defaultIncrementValue: 10.00,
  });

  const workingDaysOptions = [
    { value: "monday", label: "Monday" },
    { value: "tuesday", label: "Tuesday" },
    { value: "wednesday", label: "Wednesday" },
    { value: "thursday", label: "Thursday" },
    { value: "friday", label: "Friday" },
    { value: "saturday", label: "Saturday" },
    { value: "sunday", label: "Sunday" },
  ];

  // Handle working day toggle
  const handleWorkingDayToggle = (day: string) => {
    setCompanySettings((prev) => {
      const workingDays = prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day];
      return { ...prev, workingDays };
    });
  };

  const copyOrganizationCode = async () => {
    if (!organizationAccess) return;
    try {
      await navigator.clipboard.writeText(organizationAccess.invite_code);
      setOrganizationCodeError("");
      setOrganizationCodeNotice("Employee onboarding code copied. Share it only with people who should join your company.");
    } catch {
      setOrganizationCodeNotice("");
      setOrganizationCodeError("The code could not be copied. Please select and copy it manually.");
    }
  };

  const createOrganizationAccess = async () => {
    const organizationName = companySettings.companyName.trim();
    if (!organizationName) {
      setOrganizationCodeError("Save a company name before creating an employee onboarding code.");
      return;
    }

    setIsCreatingOrganizationAccess(true);
    setOrganizationCodeError("");
    setOrganizationCodeNotice("");
    try {
      const response = await fetch(`${apiRoot}/api/v1/organizations/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: organizationName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === "string" ? data.detail : "Unable to create company workspace");
      }
      const organization = await response.json();
      setOrganizationAccess(organization);
      setOrganizationCodeNotice("Your employee onboarding code is ready. Share it only with people who should join your company.");
    } catch (error) {
      setOrganizationCodeError(error instanceof TypeError
        ? "Cannot reach the backend server. Start it, then try again."
        : error instanceof Error ? error.message : "The company workspace could not be created. Please try again.");
    } finally {
      setIsCreatingOrganizationAccess(false);
    }
  };

  const regenerateOrganizationCode = async () => {
    if (!organizationAccess || !organizationAccess.can_manage_invite_code) return;
    if (!window.confirm("Generate a new employee onboarding code? The current code will stop working immediately.")) return;

    setIsUpdatingOrganizationCode(true);
    setOrganizationCodeError("");
    setOrganizationCodeNotice("");
    try {
      const orgId = organizationAccess.id || "me";
      let response = await fetch(`${apiRoot}/api/v1/organizations/${orgId}/regenerate-invite-code/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (response.status === 404 && orgId !== "me") {
        response = await fetch(`${apiRoot}/api/v1/organizations/me/regenerate-invite-code/`, {
          method: "POST",
          headers: authHeaders(),
        });
      }
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || "The code could not be generated. Please try again.");
      }
      const organization = await response.json();
      setOrganizationAccess(organization);
      const newCode = organization.invite_code;
      setOrganizationCodeNotice(`New code generated: ${newCode}. Please update this new code in SimplyJob to keep employee onboarding active.`);

      Swal.fire({
        icon: "warning",
        title: "New Organization Code Generated",
        html: `
          <div style="text-align: left; font-size: 14px;">
            <p>Your new AttendStack Organization Code is: <strong style="font-family: monospace; font-size: 16px; color: #0d6efd;">${newCode}</strong></p>
            <p style="color: #dc3545; font-weight: 600;">⚠️ Previous codes are now expired and invalid.</p>
            <p><strong>Action Required:</strong> If your company is connected with <strong>SimplyJob</strong>, please copy this new code and update it in your SimplyJob <em>"Hired & AttendStack"</em> workspace so hired candidates can be onboarded.</p>
          </div>
        `,
        confirmButtonText: "I Understand & Will Update SimplyJob",
        confirmButtonColor: "#0d6efd",
      });
    } catch (err: any) {
      setOrganizationCodeError(err.message || "The code could not be generated. Please try again.");
    } finally {
      setIsUpdatingOrganizationCode(false);
    }
  };

  const [showApiKey, setShowApiKey] = useState(false);
  const [isUpdatingApiKey, setIsUpdatingApiKey] = useState(false);

  const copyApiKey = async () => {
    if (!organizationAccess?.api_key) return;
    try {
      await navigator.clipboard.writeText(organizationAccess.api_key);
      Swal.fire({
        icon: "success",
        title: "API Key Copied!",
        text: "Paste this API Key into SimplyJob to connect your AttendStack organization workspace.",
        timer: 2500,
        showConfirmButton: false,
      });
    } catch {
      alert("Could not copy API Key automatically. Please copy it manually.");
    }
  };

  const regenerateApiKey = async () => {
    if (!organizationAccess || !organizationAccess.can_manage_invite_code) return;

    const confirmResult = await Swal.fire({
      title: "Regenerate API Key?",
      text: "Any active external integrations (like SimplyJob) using this API key will stop syncing until you paste the new key.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      confirmButtonText: "Yes, regenerate key",
      cancelButtonText: "Cancel",
    });

    if (!confirmResult.isConfirmed) return;

    setIsUpdatingApiKey(true);
    try {
      const orgId = organizationAccess.id || "me";
      let response = await fetch(`${apiRoot}/api/v1/organizations/${orgId}/regenerate-api-key/`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (response.status === 404 && orgId !== "me") {
        response = await fetch(`${apiRoot}/api/v1/organizations/me/regenerate-api-key/`, {
          method: "POST",
          headers: authHeaders(),
        });
      }
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || "Failed to regenerate API Key.");
      }
      const data = await response.json();
      setOrganizationAccess(data);
      Swal.fire({
        icon: "success",
        title: "New API Key Generated!",
        html: `
          <div style="text-align: left; font-size: 14px;">
            <p>Your new API Key is: <strong style="font-family: monospace; font-size: 15px; color: #0d6efd;">${data.api_key}</strong></p>
            <p class="text-muted small">Please copy and update this key in your SimplyJob settings.</p>
          </div>
        `,
        showConfirmButton: true,
      });
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message || "Failed to generate new API Key.",
      });
    } finally {
      setIsUpdatingApiKey(false);
    }
  };


  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo({ file, preview: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveLogo = async () => {
    if (!logo.file) return;

    const formData = new FormData();
    formData.append('company_logo', logo.file);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}/api/v1/settings/`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload logo");
      }

      const data = await response.json();
      setCompanyLogo(data.company_logo);

      Swal.fire({
        icon: 'success',
        title: 'Logo Saved!',
        text: 'Your new company logo has been saved.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Failed to save logo. Please try again.',
      });
    }
  };

  // Save all settings
  const handleSaveSettings = async () => {
    setIsSaving(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT;
      
      // Prepare all settings to send to backend
      const payload = {
        // Attendance settings
        shift_start_time: attendanceSettings.shiftStartTime,
        late_cutoff_time: attendanceSettings.lateCutoffTime,
        shift_end_time: attendanceSettings.shiftEndTime,
        auto_checkout_enabled: attendanceSettings.autoCheckoutEnabled,
        auto_checkout_time: attendanceSettings.autoCheckoutTime,
        ip_restriction_enabled: attendanceSettings.ipRestrictionEnabled,
        allowed_ip_ranges: attendanceSettings.allowedIpRanges,
        geofencing_enabled: attendanceSettings.geofencingEnabled,
        office_latitude: attendanceSettings.officeLatitude,
        office_longitude: attendanceSettings.officeLongitude,
        geofence_radius: attendanceSettings.geofenceRadius,
        
        // Full leave settings (comprehensive for startup)
        sunday_unpaid_rule_enabled: leaveSettings.sundayUnpaidRuleEnabled,
        burger_rule_enabled: leaveSettings.burgerRuleEnabled,
        sick_leave_days: leaveSettings.sickLeaveDays,
        casual_leave_days: leaveSettings.casualLeaveDays,
        sick_leave_monthly_limit: leaveSettings.sickLeaveMonthlyLimit,
        casual_leave_monthly_limit: leaveSettings.casualLeaveMonthlyLimit,
        maternity_leave_days: leaveSettings.maternityLeaveDays,
        paternity_leave_days: leaveSettings.paternityLeaveDays,
        bereavement_leave_days: leaveSettings.bereavementLeaveDays,
        marriage_leave_days: leaveSettings.marriageLeaveDays,
        leave_encashment_enabled: leaveSettings.leaveEncashmentEnabled,
        max_encashment_days: leaveSettings.maxEncashmentDays,
        clubbing_enabled: leaveSettings.clubbingEnabled,
        min_days_before_apply: leaveSettings.minDaysBeforeApply,
        max_consecutive_days: leaveSettings.maxConsecutiveDays,
        auto_approve_enabled: leaveSettings.autoApproveEnabled,
        approval_hierarchy: leaveSettings.approvalHierarchy,
        require_medical_certificate: leaveSettings.requireMedicalCertificate,
        national_holidays_count: leaveSettings.nationalHolidaysCount,
        festival_holidays_count: leaveSettings.festivalHolidaysCount,
        
        // Notification settings
        email_notifications: notificationSettings.emailNotifications,
        late_entry_alert: notificationSettings.lateEntryAlert,
        leave_request_alert: notificationSettings.leaveRequestAlert,
        salary_processed_alert: notificationSettings.salaryProcessedAlert,
        new_employee_alert: notificationSettings.newEmployeeAlert,
        browser_notifications: notificationSettings.browserNotifications,
        weekly_report_enabled: notificationSettings.weeklyReportEnabled,
        weekly_report_day: notificationSettings.weeklyReportDay,
        
        // Company settings
        company_name: companySettings.companyName,
        company_address: companySettings.companyAddress,
        company_email: companySettings.companyEmail,
        company_phone: companySettings.companyPhone,
        company_website: companySettings.companyWebsite,
        industry: companySettings.industry,
        company_size: companySettings.companySize,
        registration_number: companySettings.registrationNumber,
        tax_id: companySettings.taxId,
        company_bank_name: companySettings.companyBankName,
        company_bank_account_no: companySettings.companyBankAccountNo,
        company_bank_ifsc: companySettings.companyBankIfsc,
        company_bank_branch: companySettings.companyBankBranch,
        company_upi_id: companySettings.companyUpiId,
        timezone: companySettings.timezone,
        currency: companySettings.currency,
        date_format: companySettings.dateFormat,
        working_days: companySettings.workingDays,

        // Increment settings
        increment_enabled: incrementSettings.incrementEnabled,
        default_increment_months: incrementSettings.defaultIncrementMonths,
        default_increment_type: incrementSettings.defaultIncrementType,
        default_increment_value: incrementSettings.defaultIncrementValue,
      };

      // Send PATCH request to update settings
      const response = await fetch(`${API_URL}/api/v1/settings/`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to update settings");
      }
      
      if (refreshBranding) {
        await refreshBranding();
      }

      Swal.fire({
        icon: 'success',
        title: 'Settings Saved!',
        text: 'Your changes have been applied successfully.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Failed to save settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleResetDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to default values?")) {
      setAttendanceSettings({
        shiftStartTime: "10:00",
        lateCutoffTime: "10:15",
        shiftEndTime: "18:00",
        autoCheckoutEnabled: true,
        autoCheckoutTime: "20:00",
        ipRestrictionEnabled: false,
        allowedIpRanges: "",
        geofencingEnabled: false,
        officeLatitude: "",
        officeLongitude: "",
        geofenceRadius: 100,
      });
    }
  };

  const regularLeaveDays =
    (leaveSettings.sickLeaveDays || 0) +
    (leaveSettings.casualLeaveDays || 0) +
    (leaveSettings.bereavementLeaveDays || 0) +
    (leaveSettings.marriageLeaveDays || 0);
  const parentalLeaveDays =
    (leaveSettings.maternityLeaveDays || 0) +
    (leaveSettings.paternityLeaveDays || 0);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <DasherBreadcrumb />
      <div className="mb-6">
        <h2 className="mb-0 fw-bold">System Settings</h2>
        <p className="text-secondary mb-0">Configure your organization's attendance rules, notifications, and company settings</p>
      </div>

      <Row className="g-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm">
            <Card.Body className="p-0">
              <Tabs
                activeKey={activeTab}
                onSelect={(k) => setActiveTab(k || "company")}
                className="border-0 p-0"
              >
                {/* 1. Company Profile & Identity Tab (FIRST TAB) */}
                <Tab
                  eventKey="company"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconBuildingBank size={18} />
                      Company Profile
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    {/* SimplyJob Integration / Auto-Extract Banner */}
                    <div className="p-3 mb-4 rounded-3 border bg-light d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1">
                            {organizationAccess?.is_simplyjob_linked ? "SimplyJob Connected" : "SimplyJob Ecosystem"}
                          </span>
                          <span className="fw-semibold text-dark">SimplyJob Company Sync</span>
                        </div>
                        <p className="text-muted small mb-0">
                          {organizationAccess?.is_simplyjob_linked
                            ? `Connected to SimplyJob Workspace (${organizationAccess.name || "Company"}). Automatically sync legal name, GSTIN, and company contact.`
                            : "Auto-extract company legal name, GSTIN, registered address, and official contact directly from SimplyJob."}
                        </p>
                      </div>
                      <div className="d-flex gap-2 align-items-center flex-shrink-0">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className="d-flex align-items-center gap-2"
                          onClick={() => handleSyncFromSimplyJob(false)}
                          disabled={isSyncingSimplyJob}
                        >
                          {isSyncingSimplyJob ? (
                            <>
                              <Spinner size="sm" animation="border" />
                              <span>Extracting...</span>
                            </>
                          ) : (
                            <>
                              <IconRefresh size={16} />
                              <span>Extract from SimplyJob</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <Row className="g-4">
                      {/* Left Column: Brand Identity & Legal Profile */}
                      <Col lg={7}>
                        <Card className="border shadow-sm h-100">
                          <Card.Header className="bg-transparent py-3">
                            <h5 className="fw-bold mb-0 text-dark">Brand Identity & Legal Profile</h5>
                            <small className="text-muted">Primary company information used across payslips, documents, and notifications.</small>
                          </Card.Header>
                          <Card.Body>
                            <Row className="g-3">
                              {/* Logo Upload */}
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Company Logo</Form.Label>
                                  <div className="d-flex align-items-center gap-3 p-3 rounded-2 border bg-light-subtle">
                                    {(logo.preview || companyLogo) ? (
                                      <img
                                        src={(logo.preview || companyLogo) ?? undefined}
                                        alt="Company Logo"
                                        style={{ width: "56px", height: "56px", objectFit: "contain", borderRadius: "6px", border: "1px solid #dee2e6", background: "#fff" }}
                                      />
                                    ) : (
                                      <div
                                        style={{ width: "56px", height: "56px", borderRadius: "6px", background: "#0f172a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "20px" }}
                                      >
                                        {(companySettings.companyName || "A").slice(0, 1)}
                                      </div>
                                    )}
                                    <div className="flex-grow-1">
                                      <Form.Control type="file" accept="image/*" size="sm" onChange={handleLogoChange} />
                                      <Form.Text className="text-muted">Recommended: Square PNG, JPG, or SVG (Max 2MB)</Form.Text>
                                    </div>
                                    <Button variant="primary" size="sm" onClick={handleSaveLogo} disabled={!logo.file}>
                                      Save Logo
                                    </Button>
                                  </div>
                                </Form.Group>
                              </Col>

                              {/* Legal Name */}
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Legal Company Name <span className="text-danger">*</span></Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. Bhatt Square Pvt. Ltd."
                                    value={companySettings.companyName}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyName: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              {/* Registered Address */}
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Registered Office Address <span className="text-danger">*</span></Form.Label>
                                  <Form.Control
                                    as="textarea"
                                    rows={2}
                                    placeholder="e.g. Bhatt Square, 1/4 Vishesh Khand, Gomti Nagar, Lucknow, UP 226010"
                                    value={companySettings.companyAddress}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyAddress: e.target.value })}
                                  />
                                  <Form.Text className="text-muted">This address appears on payslips, employment letters, and statutory documents.</Form.Text>
                                </Form.Group>
                              </Col>

                              {/* Official Email */}
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Official HR / Admin Email</Form.Label>
                                  <Form.Control
                                    type="email"
                                    placeholder="admin@company.com"
                                    value={companySettings.companyEmail}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyEmail: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              {/* Phone */}
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Official Phone Number</Form.Label>
                                  <Form.Control
                                    type="tel"
                                    placeholder="+91 92059 83996"
                                    value={companySettings.companyPhone}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyPhone: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              {/* Website */}
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Company Website</Form.Label>
                                  <Form.Control
                                    type="url"
                                    placeholder="https://bhattsquare.com"
                                    value={companySettings.companyWebsite}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyWebsite: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Right Column: Statutory & Corporate Identifiers */}
                      <Col lg={5}>
                        <Card className="border shadow-sm mb-4">
                          <Card.Header className="bg-transparent py-3">
                            <h5 className="fw-bold mb-0 text-dark">Statutory & Corporate Identifiers</h5>
                            <small className="text-muted">Required for tax compliance, GST invoicing, and formal payslips.</small>
                          </Card.Header>
                          <Card.Body>
                            <Row className="g-3">
                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">GSTIN / Tax ID</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. 09AALCB7260P1ZX"
                                    value={companySettings.taxId}
                                    onChange={(e) => setCompanySettings({ ...companySettings, taxId: e.target.value.toUpperCase() })}
                                  />
                                  <Form.Text className="text-muted">Printed on salary vouchers and statutory payroll exports.</Form.Text>
                                </Form.Group>
                              </Col>

                              <Col md={12}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Company CIN / Registration No.</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. U72900MH2023PTC123456"
                                    value={companySettings.registrationNumber}
                                    onChange={(e) => setCompanySettings({ ...companySettings, registrationNumber: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Industry</Form.Label>
                                  <Form.Select
                                    value={companySettings.industry}
                                    onChange={(e) => setCompanySettings({ ...companySettings, industry: e.target.value })}
                                  >
                                    <option value="">Select industry</option>
                                    <option value="Technology">Technology & Software</option>
                                    <option value="Professional Services">Professional Services</option>
                                    <option value="Manufacturing">Manufacturing</option>
                                    <option value="Retail & Commerce">Retail & Commerce</option>
                                    <option value="Healthcare">Healthcare</option>
                                    <option value="Education">Education</option>
                                    <option value="Construction & Real Estate">Real Estate</option>
                                    <option value="Other">Other</option>
                                  </Form.Select>
                                </Form.Group>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Company Size</Form.Label>
                                  <Form.Select
                                    value={companySettings.companySize}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companySize: e.target.value })}
                                  >
                                    <option value="">Select size</option>
                                    <option value="1-10">1–10 employees</option>
                                    <option value="11-50">11–50 employees</option>
                                    <option value="51-200">51–200 employees</option>
                                    <option value="201-500">201–500 employees</option>
                                    <option value="501+">501+ employees</option>
                                  </Form.Select>
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>

                        {/* Localization Settings */}
                        <Card className="border shadow-sm">
                          <Card.Header className="bg-transparent py-3">
                            <h5 className="fw-bold mb-0 text-dark">Localization & Currency</h5>
                          </Card.Header>
                          <Card.Body>
                            <Row className="g-3">
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Timezone</Form.Label>
                                  <Form.Select
                                    value={companySettings.timezone}
                                    onChange={(e) => setCompanySettings({ ...companySettings, timezone: e.target.value })}
                                  >
                                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                                    <option value="America/New_York">America/New_York (EST)</option>
                                    <option value="Europe/London">Europe/London (GMT)</option>
                                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                                  </Form.Select>
                                </Form.Group>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Currency</Form.Label>
                                  <Form.Select
                                    value={companySettings.currency}
                                    onChange={(e) => setCompanySettings({ ...companySettings, currency: e.target.value })}
                                  >
                                    <option value="INR">Indian Rupee (₹)</option>
                                    <option value="USD">US Dollar ($)</option>
                                    <option value="EUR">Euro (€)</option>
                                    <option value="GBP">British Pound (£)</option>
                                    <option value="AED">UAE Dirham (AED)</option>
                                  </Form.Select>
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Full-Width Row: Company Banking & Statutory Account Details */}
                      <Col md={12}>
                        <Card className="border shadow-sm">
                          <Card.Header className="bg-transparent py-3">
                            <h5 className="fw-bold mb-0 text-dark">Company Bank & Statutory Account Details</h5>
                            <small className="text-muted">Primary corporate bank account credentials for salary disbursement records, vendor payments, and billing.</small>
                          </Card.Header>
                          <Card.Body>
                            <Row className="g-3">
                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Company Bank Name</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. HDFC Bank, ICICI Bank, State Bank of India"
                                    value={companySettings.companyBankName}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyBankName: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Bank Account Number</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. 50200012345678"
                                    value={companySettings.companyBankAccountNo}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyBankAccountNo: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={4}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">IFSC Code</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. HDFC0001234"
                                    value={companySettings.companyBankIfsc}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyBankIfsc: e.target.value.toUpperCase() })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Bank Branch Name</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. Gomti Nagar Branch, Lucknow"
                                    value={companySettings.companyBankBranch}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyBankBranch: e.target.value })}
                                  />
                                </Form.Group>
                              </Col>

                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Company UPI ID / VPA</Form.Label>
                                  <Form.Control
                                    type="text"
                                    placeholder="e.g. bhattsquare@okhdfcbank"
                                    value={companySettings.companyUpiId}
                                    onChange={(e) => setCompanySettings({ ...companySettings, companyUpiId: e.target.value.toLowerCase() })}
                                  />
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Full-Width Row: Working Days */}
                      <Col md={12}>
                        <Card className="border shadow-sm">
                          <Card.Header className="bg-transparent py-3">
                            <h5 className="fw-bold mb-0 text-dark">Company Working Days</h5>
                            <small className="text-muted">Select active business days for attendance processing and payroll calculation.</small>
                          </Card.Header>
                          <Card.Body>
                            <div className="d-flex flex-wrap gap-2">
                              {workingDaysOptions.map((day) => {
                                const isSelected = companySettings.workingDays.includes(day.value);
                                return (
                                  <Badge
                                    key={day.value}
                                    bg={isSelected ? "primary" : "secondary"}
                                    className="p-2 cursor-pointer fs-6"
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleWorkingDayToggle(day.value)}
                                  >
                                    {isSelected ? "✓ " : ""}{day.label}
                                  </Badge>
                                );
                              })}
                            </div>
                            <Form.Text className="text-muted mt-2 d-block">
                              Click any day to toggle on/off. Blue badges represent active company working days.
                            </Form.Text>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </Tab>

                {/* 2. Attendance Rules Tab */}
                <Tab
                  eventKey="attendance"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconClock size={18} />
                      Attendance Rules
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    <Row className="g-4">
                      {/* Left Column - Shift & Time */}
                      <Col md={6}>
                        <Card className="border-0 shadow-sm">
                          <Card.Body>
                            <h5 className="fw-bold mb-4 d-flex align-items-center gap-2">
                              <IconClock size={20} />
                              Shift & Time Configuration
                            </h5>
                            <p className="text-muted small mb-4">Set your company's official working hours and late policies.</p>
                            <Row className="g-3">
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Shift Start Time</Form.Label>
                                  <Form.Control
                                    type="time"
                                    value={attendanceSettings.shiftStartTime}
                                    onChange={(e) => setAttendanceSettings({ ...attendanceSettings, shiftStartTime: e.target.value })}
                                  />
                                  <Form.Text>Official time when work starts.</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Late Cutoff Time</Form.Label>
                                  <Form.Control
                                    type="time"
                                    value={attendanceSettings.lateCutoffTime}
                                    onChange={(e) => setAttendanceSettings({ ...attendanceSettings, lateCutoffTime: e.target.value })}
                                  />
                                  <Form.Text>Time after which an employee is marked late.</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Shift End Time</Form.Label>
                                  <Form.Control
                                    type="time"
                                    value={attendanceSettings.shiftEndTime}
                                    onChange={(e) => setAttendanceSettings({ ...attendanceSettings, shiftEndTime: e.target.value })}
                                  />
                                  <Form.Text>Official time when work ends.</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col xs={12}>
                                <Form.Group>
                                  <Form.Check
                                    type="switch"
                                    id="auto-checkout-switch"
                                    label="Enable Auto Checkout"
                                    checked={attendanceSettings.autoCheckoutEnabled}
                                    onChange={(e) => setAttendanceSettings({ ...attendanceSettings, autoCheckoutEnabled: e.target.checked })}
                                  />
                                  <Form.Text>Automatically check out employees who forget to.</Form.Text>
                                </Form.Group>
                              </Col>
                              {attendanceSettings.autoCheckoutEnabled && (
                                <Col md={6}>
                                  <Form.Group>
                                    <Form.Label className="fw-semibold">Auto Checkout Time</Form.Label>
                                    <Form.Control
                                      type="time"
                                      value={attendanceSettings.autoCheckoutTime}
                                      onChange={(e) => setAttendanceSettings({ ...attendanceSettings, autoCheckoutTime: e.target.value })}
                                    />
                                    <Form.Text>Time for automatic checkout.</Form.Text>
                                  </Form.Group>
                                </Col>
                              )}
                            </Row>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Right Column - Location & Security */}
                      <Col md={6}>
                        <Card className="border-0 shadow-sm">
                          <Card.Body>
                            <h5 className="fw-bold mb-1 d-flex align-items-center gap-2">
                              <IconShieldLock size={20} />
                              Location &amp; Security
                            </h5>
                            <p className="text-muted small mb-4">Restrict attendance marking to specific locations or IP addresses. Employees can still log in from anywhere.</p>

                            {/* ── IP Restriction ── */}
                            <div className="p-3 rounded-3 mb-4" style={{ background: "#f8f9fa", border: "1px solid #e9ecef" }}>
                              <Form.Group className="mb-2">
                                <Form.Check
                                  type="switch"
                                  id="ip-restriction-switch"
                                  label={<span className="fw-semibold">Enable IP Address Restriction</span>}
                                  checked={attendanceSettings.ipRestrictionEnabled}
                                  onChange={(e) => setAttendanceSettings({ ...attendanceSettings, ipRestrictionEnabled: e.target.checked })}
                                />
                                <Form.Text className="ms-4 ps-2">Allow attendance marking only from authorised IP addresses or CIDR ranges.</Form.Text>
                              </Form.Group>

                              {attendanceSettings.ipRestrictionEnabled && (
                                <div className="mt-3">
                                  <Form.Group className="mb-2">
                                    <Form.Label className="fw-semibold small mb-1">Allowed IP Ranges</Form.Label>
                                    <Form.Control
                                      as="textarea"
                                      rows={3}
                                      placeholder="e.g., 192.168.1.0/24, 10.0.0.1, 203.0.113.5"
                                      value={attendanceSettings.allowedIpRanges}
                                      onChange={(e) => setAttendanceSettings({ ...attendanceSettings, allowedIpRanges: e.target.value })}
                                      className="font-monospace small"
                                    />
                                    <Form.Text>Comma-separated. Supports single IPs and CIDR ranges (e.g. 192.168.1.0/24).</Form.Text>
                                  </Form.Group>

                                  {/* What is my IP helper */}
                                  <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      className="d-inline-flex align-items-center gap-1"
                                      onClick={fetchMyIp}
                                      disabled={isFetchingIp}
                                      id="btn-detect-my-ip"
                                    >
                                      <IconWifi size={14} />
                                      {isFetchingIp ? "Detecting..." : "What is my IP?"}
                                    </Button>
                                    {myIpInfo && (
                                      <span className={`badge rounded-pill ${
                                        myIpInfo.is_currently_allowed === true
                                          ? "bg-success-subtle text-success border border-success-subtle"
                                          : myIpInfo.is_currently_allowed === false
                                          ? "bg-danger-subtle text-danger border border-danger-subtle"
                                          : "bg-secondary-subtle text-secondary border border-secondary-subtle"
                                      }`}>
                                        {myIpInfo.client_ip}
                                        {myIpInfo.is_currently_allowed === true && " ✓ Allowed"}
                                        {myIpInfo.is_currently_allowed === false && " ✗ Not allowed"}
                                      </span>
                                    )}
                                  </div>
                                  {myIpInfo?.is_currently_allowed === false && (
                                    <div className="alert alert-warning d-flex align-items-center gap-2 mt-2 py-2 px-3 small">
                                      <IconAlertTriangle size={16} />
                                      Your current IP is <strong>{myIpInfo.client_ip}</strong>. It has been added to the list above. Save settings to allow it.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* ── Geofencing ── */}
                            <div className="p-3 rounded-3" style={{ background: "#f8f9fa", border: "1px solid #e9ecef" }}>
                              <Form.Group className="mb-2">
                                <Form.Check
                                  type="switch"
                                  id="geofencing-switch"
                                  label={<span className="fw-semibold">Enable Geofencing Restriction</span>}
                                  checked={attendanceSettings.geofencingEnabled}
                                  onChange={(e) => setAttendanceSettings({ ...attendanceSettings, geofencingEnabled: e.target.checked })}
                                />
                                <Form.Text className="ms-4 ps-2 d-block">
                                  Allow attendance marking only from within a specific geographic radius of the office.
                                  <br />
                                  <span className="text-warning fw-semibold small">★ Note on GPS Drift:</span>
                                  <span className="text-muted small"> Coordinates naturally drift by a few meters (standard GPS variation) even when you are stationary. This is normal behavior due to satellite movement and Wi-Fi signal triangulation.</span>
                                </Form.Text>
                              </Form.Group>

                              {attendanceSettings.geofencingEnabled && (
                                <div className="mt-3">
                                  {/* Detect My Location helper */}
                                  <div className="d-flex align-items-center justify-content-between mb-3">
                                    <span className="small text-muted fw-semibold">Office Coordinates</span>
                                    <Button
                                      size="sm"
                                      variant="outline-success"
                                      className="d-inline-flex align-items-center gap-1"
                                      onClick={detectMyLocation}
                                      disabled={isDetectingLocation}
                                      id="btn-detect-my-location"
                                    >
                                      <IconCurrentLocation size={14} />
                                      {isDetectingLocation ? "Detecting..." : "Use My Location"}
                                    </Button>
                                  </div>

                                  {detectedAccuracy !== null && (
                                    <div className={`mb-3 p-2.5 rounded-3 small border ${
                                      detectedAccuracy > 150 
                                        ? "bg-warning-subtle text-warning border-warning-subtle" 
                                        : "bg-success-subtle text-success border-success-subtle"
                                    }`}>
                                      {detectedAccuracy > 150 ? (
                                        <div>
                                          <strong>⚠️ Low Accuracy (±{detectedAccuracy}m):</strong> Detected location accuracy is poor. This usually happens on desktop browsers. We highly recommend verifying these coordinates manually on Google Maps.
                                        </div>
                                      ) : (
                                        <div>
                                          <strong>✓ High Accuracy (±{detectedAccuracy}m):</strong> Location successfully captured.
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <Row className="g-3">
                                    <Col md={6}>
                                      <Form.Group>
                                        <Form.Label className="fw-semibold small mb-1">Office Latitude</Form.Label>
                                        <Form.Control
                                          type="text"
                                          placeholder="e.g., 26.8342"
                                          value={attendanceSettings.officeLatitude}
                                          onChange={(e) => setAttendanceSettings({ ...attendanceSettings, officeLatitude: e.target.value })}
                                        />
                                      </Form.Group>
                                    </Col>
                                    <Col md={6}>
                                      <Form.Group>
                                        <Form.Label className="fw-semibold small mb-1">Office Longitude</Form.Label>
                                        <Form.Control
                                          type="text"
                                          placeholder="e.g., 80.9862"
                                          value={attendanceSettings.officeLongitude}
                                          onChange={(e) => setAttendanceSettings({ ...attendanceSettings, officeLongitude: e.target.value })}
                                        />
                                      </Form.Group>
                                    </Col>
                                    <Col md={12}>
                                      <Form.Group>
                                        <Form.Label className="fw-semibold small mb-1">Geofence Radius (meters)</Form.Label>
                                        <Form.Control
                                          type="number"
                                          min={50}
                                          max={5000}
                                          value={attendanceSettings.geofenceRadius}
                                          onChange={(e) => setAttendanceSettings({ ...attendanceSettings, geofenceRadius: parseInt(e.target.value) || 100 })}
                                        />
                                        <Form.Text>Employees must be within this radius of the office to mark attendance.</Form.Text>
                                      </Form.Group>
                                    </Col>
                                  </Row>

                                  {/* Live preview */}
                                  {attendanceSettings.officeLatitude && attendanceSettings.officeLongitude && (
                                    <div className="mt-3">
                                      <div className="d-flex align-items-center gap-2 p-2 rounded-2 bg-primary-subtle border border-primary-subtle">
                                        <IconMapPin size={16} className="text-primary flex-shrink-0" />
                                        <span className="small text-primary">
                                          Employees must be within <strong>{attendanceSettings.geofenceRadius}m</strong> of
                                          &nbsp;({parseFloat(attendanceSettings.officeLatitude).toFixed(4)},&nbsp;
                                          {parseFloat(attendanceSettings.officeLongitude).toFixed(4)})
                                        </span>
                                      </div>
                                      <div className="mt-2 text-end">
                                        <a
                                          href={`https://www.google.com/maps/search/?api=1&query=${attendanceSettings.officeLatitude},${attendanceSettings.officeLongitude}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-decoration-none small fw-semibold text-primary d-inline-flex align-items-center gap-1"
                                        >
                                          <IconMapPin size={14} /> Verify Location on Google Maps
                                        </a>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </Tab>
                
                {/* Leave Settings Tab */}
                <Tab
                  eventKey="leave"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconCalendar size={18} />
                      Leave Settings
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    {/* Leave Policy Overview Cards */}
                    <Row className="mb-4 g-4">
                      <Col md={4}>
                        <Card className="border-0 bg-primary bg-opacity-10">
                          <Card.Body className="text-center">
                            <h3 className="fw-bold text-primary mb-0">{regularLeaveDays}</h3>
                            <p className="text-muted small mb-0">Regular Leave Days</p>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={4}>
                        <Card className="border-0 bg-info bg-opacity-10">
                          <Card.Body className="text-center">
                            <h3 className="fw-bold text-info mb-0">{parentalLeaveDays}</h3>
                            <p className="text-muted small mb-0">Parental Leave Days</p>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>

                    <Row className="g-4">
                      {/* Left Column - Core Leave Balances */}
                      <Col md={6}>
                        {/* Paid Leave Balances */}
                        <Card className="border-0 shadow-sm mb-4">
                          <Card.Body>
                            <h5 className="fw-bold mb-4 d-flex align-items-center gap-2">
                              <IconBriefcase size={20} />
                              Core Leave Balances
                            </h5>
                            <p className="text-muted small mb-4">Set the annual paid balance for each supported leave category.</p>
                            <Row className="g-3">
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Sick Leave (annual paid)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.sickLeaveDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, sickLeaveDays: parseInt(e.target.value) })}
                                  />
                                  <Form.Text>Health & medical leave</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Casual Leave (annual paid)</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.casualLeaveDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, casualLeaveDays: parseInt(e.target.value) })}
                                  />
                                  <Form.Text>Urgent personal matters</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Sick Leave Monthly Limit</Form.Label>
                                  <Form.Control
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={leaveSettings.sickLeaveMonthlyLimit}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, sickLeaveMonthlyLimit: parseInt(e.target.value) || 1 })}
                                  />
                                  <Form.Text>Maximum requested per employee each month (default 7 days)</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Casual Leave Monthly Limit</Form.Label>
                                  <Form.Control
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={leaveSettings.casualLeaveMonthlyLimit}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, casualLeaveMonthlyLimit: parseInt(e.target.value) || 1 })}
                                  />
                                  <Form.Text>Maximum requested per employee each month (default 3 days)</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Bereavement Leave</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.bereavementLeaveDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, bereavementLeaveDays: parseInt(e.target.value) })}
                                  />
                                  <Form.Text>Family emergency leave</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Marriage Leave</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.marriageLeaveDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, marriageLeaveDays: parseInt(e.target.value) })}
                                  />
                                  <Form.Text>For the employee&apos;s own marriage or a real brother&apos;s or sister&apos;s marriage.</Form.Text>
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>

                        {/* Parental Leave */}
                        <Card className="border-0 shadow-sm">
                          <Card.Body>
                            <h5 className="fw-bold mb-4 d-flex align-items-center gap-2">
                              <IconHeart size={20} />
                              Parental Leave
                            </h5>
                            <p className="text-muted small mb-4">Family-friendly policies to support new parents</p>
                            <Row className="g-3">
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Maternity Leave</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.maternityLeaveDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, maternityLeaveDays: parseInt(e.target.value) })}
                                  />
                                  <Form.Text>Paid leave for mothers</Form.Text>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Paternity Leave</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.paternityLeaveDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, paternityLeaveDays: parseInt(e.target.value) })}
                                  />
                                  <Form.Text>Paid leave for fathers</Form.Text>
                                </Form.Group>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Right Column - Policies & Workflow */}
                      <Col md={6}>
                        {/* Leave Policies */}
                        <Card className="border-0 shadow-sm mb-4">
                          <Card.Body>
                            <h5 className="fw-bold mb-4 d-flex align-items-center gap-2">
                              <IconSettings size={20} />
                              Leave Policies
                            </h5>
                            <p className="text-muted small mb-4">Rules that govern how leaves can be used</p>
                            
                            <div className="d-flex flex-column gap-3">
                              <Form.Group>
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>
                                    <Form.Label className="fw-semibold mb-0">Enable Leave Encashment</Form.Label>
                                    <Form.Text className="small mb-0">Allow cashing out unused leave days</Form.Text>
                                  </div>
                                  <Form.Check
                                    type="switch"
                                    checked={leaveSettings.leaveEncashmentEnabled}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, leaveEncashmentEnabled: e.target.checked })}
                                  />
                                </div>
                              </Form.Group>

                              {leaveSettings.leaveEncashmentEnabled && (
                                <Form.Group>
                                  <Form.Label className="fw-semibold">Max Encashment Days</Form.Label>
                                  <Form.Control
                                    type="number"
                                    value={leaveSettings.maxEncashmentDays}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, maxEncashmentDays: parseInt(e.target.value) })}
                                  />
                                </Form.Group>
                              )}

                              <hr className="my-2" />

                              <Form.Group>
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <Form.Label className="fw-semibold mb-0">Sunday Unpaid Rule</Form.Label>
                              <Form.Text className="small mb-0">Sunday is unpaid if leave taken before & after</Form.Text>
                            </div>
                            <Form.Check
                              type="switch"
                              checked={leaveSettings.sundayUnpaidRuleEnabled}
                              onChange={(e) => setLeaveSettings({ ...leaveSettings, sundayUnpaidRuleEnabled: e.target.checked })}
                            />
                          </div>
                        </Form.Group>
                        <Form.Group>
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <Form.Label className="fw-semibold mb-0">Burger Rule</Form.Label>
                              <Form.Text className="small mb-0">Holiday is unpaid if sandwiched between leaves</Form.Text>
                            </div>
                            <Form.Check
                              type="switch"
                              checked={leaveSettings.burgerRuleEnabled}
                              onChange={(e) => setLeaveSettings({ ...leaveSettings, burgerRuleEnabled: e.target.checked })}
                            />
                          </div>
                        </Form.Group>
                            </div>
                          </Card.Body>
                        </Card>

                        {/* Approval Workflow */}
                        <Card className="border-0 shadow-sm">
                          <Card.Body>
                            <h5 className="fw-bold mb-4 d-flex align-items-center gap-2">
                              <IconUsers size={20} />
                              Approval Workflow
                            </h5>
                            <p className="text-muted small mb-4">Configure how leave requests are approved</p>
                            
                            <div className="d-flex flex-column gap-3">
                              <Form.Group>
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>
                                    <Form.Label className="fw-semibold mb-0">Auto-Approve Short Leaves</Form.Label>
                                    <Form.Text className="small mb-0">Automatically approve 1-day leave requests</Form.Text>
                                  </div>
                                  <Form.Check
                                    type="switch"
                                    checked={leaveSettings.autoApproveEnabled}
                                    onChange={(e) => setLeaveSettings({ ...leaveSettings, autoApproveEnabled: e.target.checked })}
                                  />
                                </div>
                              </Form.Group>

                              <Form.Group>
                                <Form.Label className="fw-semibold">Approval Hierarchy</Form.Label>
                                <Form.Select
                                  value={leaveSettings.approvalHierarchy}
                                  onChange={(e) => setLeaveSettings({ ...leaveSettings, approvalHierarchy: e.target.value })}
                                >
                                  <option value="1level">1-Level (Manager only)</option>
                                  <option value="2level">2-Level (Manager + HR)</option>
                                </Form.Select>
                              </Form.Group>

                              <Form.Group>
                                <Form.Label className="fw-semibold">Medical Certificate Required After (days)</Form.Label>
                                <Form.Control
                                  type="number"
                                  value={leaveSettings.requireMedicalCertificate}
                                  onChange={(e) => setLeaveSettings({ ...leaveSettings, requireMedicalCertificate: parseInt(e.target.value) })}
                                />
                                <Form.Text>Sick leave longer than this needs medical proof</Form.Text>
                              </Form.Group>

                              <Form.Group>
                                <Form.Label className="fw-semibold">Minimum Advance Notice (days)</Form.Label>
                                <Form.Control
                                  type="number"
                                  value={leaveSettings.minDaysBeforeApply}
                                  onChange={(e) => setLeaveSettings({ ...leaveSettings, minDaysBeforeApply: parseInt(e.target.value) })}
                                />
                                <Form.Text>Days before leave employees must apply</Form.Text>
                              </Form.Group>

                              <Form.Group>
                                <Form.Label className="fw-semibold">Max Consecutive Leave Days</Form.Label>
                                <Form.Control
                                  type="number"
                                  value={leaveSettings.maxConsecutiveDays}
                                  onChange={(e) => setLeaveSettings({ ...leaveSettings, maxConsecutiveDays: parseInt(e.target.value) })}
                                />
                                <Form.Text>Prevent excessive long leaves</Form.Text>
                              </Form.Group>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </Tab>

                {/* Notifications Tab */}
                <Tab
                  eventKey="notifications"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconBell size={18} />
                      Notifications
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    <h4 className="fw-bold mb-4">Notification Preferences</h4>
                    <Row>
                      <Col md={8}>
                        <Card className="border bg-light-subtle">
                          <Card.Body>
                            <Form.Group className="mb-4">
                              <Form.Check
                                type="switch"
                                id="email-notifications"
                                label="Enable Email Notifications"
                                checked={notificationSettings.emailNotifications}
                                onChange={(e) =>
                                  setNotificationSettings({
                                    ...notificationSettings,
                                    emailNotifications: e.target.checked,
                                  })
                                }
                              />
                            </Form.Group>

                            <hr className="my-4" />

                            <h5 className="fw-semibold mb-3">Alert Types</h5>
                            <div className="d-flex flex-column gap-3">
                              <Form.Check
                                type="switch"
                                id="late-entry-alert"
                                label="Late Entry Alerts"
                                disabled={!notificationSettings.emailNotifications}
                                checked={notificationSettings.lateEntryAlert}
                                onChange={(e) =>
                                  setNotificationSettings({ ...notificationSettings, lateEntryAlert: e.target.checked })
                                }
                              />
                              <Form.Check
                                type="switch"
                                id="leave-request-alert"
                                label="Leave Request Notifications"
                                disabled={!notificationSettings.emailNotifications}
                                checked={notificationSettings.leaveRequestAlert}
                                onChange={(e) =>
                                  setNotificationSettings({ ...notificationSettings, leaveRequestAlert: e.target.checked })
                                }
                              />
                              <Form.Check
                                type="switch"
                                id="salary-alert"
                                label="Salary Processed Alerts"
                                disabled={!notificationSettings.emailNotifications}
                                checked={notificationSettings.salaryProcessedAlert}
                                onChange={(e) =>
                                  setNotificationSettings({ ...notificationSettings, salaryProcessedAlert: e.target.checked })
                                }
                              />
                              <Form.Check
                                type="switch"
                                id="new-employee-alert"
                                label="New Employee Onboarding Alerts"
                                disabled={!notificationSettings.emailNotifications}
                                checked={notificationSettings.newEmployeeAlert}
                                onChange={(e) =>
                                  setNotificationSettings({ ...notificationSettings, newEmployeeAlert: e.target.checked })
                                }
                              />
                            </div>

                            <hr className="my-4" />

                            <Form.Group className="mb-3">
                              <Form.Check
                                type="switch"
                                id="browser-notifications"
                                label="Enable Browser Notifications"
                                checked={notificationSettings.browserNotifications}
                                onChange={(e) =>
                                  setNotificationSettings({ ...notificationSettings, browserNotifications: e.target.checked })
                                }
                              />
                            </Form.Group>

                            <Form.Group className="mb-3">
                              <Form.Check
                                type="switch"
                                id="weekly-report"
                                label="Send Weekly Attendance Reports"
                                checked={notificationSettings.weeklyReportEnabled}
                                onChange={(e) =>
                                  setNotificationSettings({ ...notificationSettings, weeklyReportEnabled: e.target.checked })
                                }
                              />
                            </Form.Group>
                            {notificationSettings.weeklyReportEnabled && (
                              <Form.Group>
                                <Form.Label>Send Report On</Form.Label>
                                <Form.Select
                                  value={notificationSettings.weeklyReportDay}
                                  onChange={(e) =>
                                    setNotificationSettings({ ...notificationSettings, weeklyReportDay: e.target.value })
                                  }
                                >
                                  <option value="monday">Monday</option>
                                  <option value="tuesday">Tuesday</option>
                                  <option value="sunday">Sunday</option>
                                </Form.Select>
                              </Form.Group>
                            )}
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </Tab>

                {/* Security Tab */}
                <Tab
                  eventKey="security"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconShieldLock size={18} />
                      Security
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    <h4 className="fw-bold mb-4">Security Settings</h4>
                    <Row className="g-4">
                      <Col md={6}>
                        <Card className="border shadow-sm h-100">
                          <Card.Body>
                            <h5 className="fw-semibold mb-2">Employee onboarding code</h5>
                            <p className="text-secondary small mb-4">Employees use this secure code to create an account in <strong>{organizationAccess?.name || "your company"}</strong>. Generate a new code whenever access needs to be reset.</p>
                            {organizationCodeNotice && <Alert variant="success" className="py-2 small" dismissible onClose={() => setOrganizationCodeNotice("")}>{organizationCodeNotice}</Alert>}
                            {organizationCodeError && <Alert variant="danger" className="py-2 small" dismissible onClose={() => setOrganizationCodeError("")}>{organizationCodeError}</Alert>}
                            {isLoadingOrganizationAccess ? (
                              <div className="d-flex align-items-center gap-2 text-secondary small"><Spinner size="sm" /> Loading employee access…</div>
                            ) : organizationAccess ? (
                              <>
                                <Form.Group className="mb-3" controlId="employee-onboarding-code">
                                  <Form.Label className="small fw-semibold">Current code</Form.Label>
                                  <Form.Control value={organizationAccess.invite_code} readOnly className="font-monospace fw-semibold" />
                                </Form.Group>
                                <div className="d-flex flex-wrap gap-2 align-items-center">
                                  <Button type="button" variant="outline-primary" size="sm" onClick={copyOrganizationCode}><IconCopy size={16} className="me-1" />Copy code</Button>
                                  {organizationAccess.can_manage_invite_code ? (
                                    <Button type="button" variant="outline-secondary" size="sm" onClick={regenerateOrganizationCode} disabled={isUpdatingOrganizationCode}>
                                      {isUpdatingOrganizationCode ? <><Spinner size="sm" className="me-1" />Generating…</> : <><IconRefresh size={16} className="me-1" />Generate new code</>}
                                    </Button>
                                  ) : <small className="text-secondary">Only the company owner can generate a new code.</small>}
                                </div>
                              </>
                            ) : (
                              <div>
                                <p className="text-secondary small mb-3">Create a company workspace to issue the first employee onboarding code.</p>
                                <Button type="button" variant="primary" size="sm" onClick={createOrganizationAccess} disabled={isCreatingOrganizationAccess}>
                                  {isCreatingOrganizationAccess ? <><Spinner size="sm" className="me-1" />Creating code…</> : "Create employee onboarding code"}
                                </Button>
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col md={6}>
                        <Card className="border bg-light-subtle">
                          <Card.Body>
                            <h5 className="fw-semibold mb-3">Password Policy</h5>
                            <Form.Group className="mb-3">
                              <Form.Label>Minimum Password Length</Form.Label>
                              <Form.Control type="number" min={8} max={32} defaultValue={8} />
                            </Form.Group>
                            <Form.Group className="mb-4">
                              <Form.Check type="switch" id="password-expiry" label="Enable Password Expiry" defaultChecked />
                            </Form.Group>
                            <Form.Group className="mb-4">
                              <Form.Check type="switch" id="two-factor" label="Force Two-Factor Authentication" />
                            </Form.Group>
                            <Form.Group className="mb-4">
                              <Form.Check type="switch" id="session-timeout" label="Enable Session Timeout (30 minutes)" defaultChecked />
                            </Form.Group>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </Tab>

                {/* Increment Policy Tab */}
                <Tab
                  eventKey="increment"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconTrendingUp size={18} />
                      Increment Policy
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    <div className="d-flex align-items-center justify-content-between mb-4">
                      <div>
                        <h4 className="fw-bold mb-1">Company Increment Settings</h4>
                        <p className="text-secondary small mb-0">
                          Set default salary increment rules applied to all employees automatically. You can override these per employee.
                        </p>
                      </div>
                      <Form.Check
                        type="switch"
                        id="increment-enabled-toggle"
                        label={<span className="fw-semibold ms-1">{incrementSettings.incrementEnabled ? "System Active" : "System Disabled"}</span>}
                        checked={incrementSettings.incrementEnabled}
                        onChange={(e) => setIncrementSettings({ ...incrementSettings, incrementEnabled: e.target.checked })}
                      />
                    </div>

                    <Alert variant="info" className="d-flex align-items-start gap-3 mb-4 border-0 shadow-sm">
                      <IconTrendingUp size={24} className="text-info flex-shrink-0 mt-1" />
                      <div>
                        <div className="fw-semibold">How Company Increment Policy Works</div>
                        <div className="small text-secondary">
                          When enabled, AttendStack automatically tracks employee joining dates or last increment dates and schedules upcoming increments every <strong>{incrementSettings.defaultIncrementMonths} months</strong> with a <strong>{incrementSettings.defaultIncrementType === "PERCENTAGE" ? `${incrementSettings.defaultIncrementValue}%` : `₹${incrementSettings.defaultIncrementValue}`}</strong> raise. Admins can accept, reject, or reschedule due increments on the dashboard.
                        </div>
                      </div>
                    </Alert>

                    <Row className="g-4">
                      <Col md={4}>
                        <Card className="border shadow-sm h-100">
                          <Card.Body>
                            <Form.Group className="mb-3">
                              <Form.Label className="fw-semibold">Default Increment Interval</Form.Label>
                              <Form.Select
                                value={incrementSettings.defaultIncrementMonths}
                                onChange={(e) => setIncrementSettings({ ...incrementSettings, defaultIncrementMonths: parseInt(e.target.value) || 12 })}
                                disabled={!incrementSettings.incrementEnabled}
                              >
                                <option value={1}>Every 1 Month</option>
                                <option value={3}>Every 3 Months (Quarterly)</option>
                                <option value={6}>Every 6 Months (Half-Yearly)</option>
                                <option value={9}>Every 9 Months</option>
                                <option value={12}>Every 12 Months (Annually)</option>
                                <option value={18}>Every 18 Months (1.5 Years)</option>
                                <option value={24}>Every 24 Months (2 Years)</option>
                              </Form.Select>
                              <Form.Text className="text-muted small">
                                Default frequency for employee performance raises.
                              </Form.Text>
                            </Form.Group>
                          </Card.Body>
                        </Card>
                      </Col>

                      <Col md={4}>
                        <Card className="border shadow-sm h-100">
                          <Card.Body>
                            <Form.Group className="mb-3">
                              <Form.Label className="fw-semibold">Increment Calculation Type</Form.Label>
                              <Form.Select
                                value={incrementSettings.defaultIncrementType}
                                onChange={(e) => setIncrementSettings({ ...incrementSettings, defaultIncrementType: e.target.value })}
                                disabled={!incrementSettings.incrementEnabled}
                              >
                                <option value="PERCENTAGE">Percentage Raise (%)</option>
                                <option value="FLAT_AMOUNT">Flat Amount (Fixed ₹ Rupees)</option>
                              </Form.Select>
                              <Form.Text className="text-muted small">
                                Choose whether raises are calculated as % of salary or a flat rupee amount.
                              </Form.Text>
                            </Form.Group>
                          </Card.Body>
                        </Card>
                      </Col>

                      <Col md={4}>
                        <Card className="border shadow-sm h-100">
                          <Card.Body>
                            <Form.Group className="mb-3">
                              <Form.Label className="fw-semibold">Default Increment Value</Form.Label>
                              <div className="input-group">
                                <span className="input-group-text fw-semibold">
                                  {incrementSettings.defaultIncrementType === "PERCENTAGE" ? "%" : "₹"}
                                </span>
                                <Form.Control
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={incrementSettings.defaultIncrementValue}
                                  onChange={(e) => setIncrementSettings({ ...incrementSettings, defaultIncrementValue: parseFloat(e.target.value) || 0 })}
                                  disabled={!incrementSettings.incrementEnabled}
                                />
                              </div>
                              <Form.Text className="text-muted small">
                                {incrementSettings.defaultIncrementType === "PERCENTAGE"
                                  ? "E.g., 10 for a 10% annual salary increase."
                                  : "E.g., 5000 for a ₹5,000 raise."}
                              </Form.Text>
                            </Form.Group>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </Tab>

                {/* API & SimplyJob Integration Tab */}
                <Tab
                  eventKey="integrations"
                  title={
                    <span className="d-flex align-items-center gap-2 py-2">
                      <IconKey size={18} />
                      API & Integrations
                    </span>
                  }
                >
                  <div className="p-4 border-top">
                    <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
                      <div>
                        <h4 className="fw-bold mb-1">API Key & External Integrations</h4>
                        <p className="text-secondary small mb-0">
                          Connect AttendStack with SimplyJob and other external platforms using your secure organization API Key.
                        </p>
                      </div>
                      <Badge bg={organizationAccess?.api_key ? "success" : "warning"} className="px-3 py-2 fs-6">
                        {organizationAccess?.api_key ? "API Active & Ready" : "API Setup Required"}
                      </Badge>
                    </div>

                    <Row className="g-4">
                      {/* Left Column: API Key & SimplyJob Connection */}
                      <Col lg={7}>
                        <Card className="border shadow-sm h-100">
                          <Card.Body>
                            <h5 className="fw-bold mb-2 d-flex align-items-center gap-2">
                              <IconKey size={20} className="text-primary" />
                              AttendStack Integration API Key
                            </h5>
                            <p className="text-muted small mb-4">
                              Use this private key in SimplyJob (under <strong>Hired & AttendStack Invites</strong>) to link your workforce and sync employee invitations automatically.
                            </p>

                            {isLoadingOrganizationAccess ? (
                              <div className="d-flex align-items-center gap-2 text-secondary py-3">
                                <Spinner size="sm" /> Loading API configuration…
                              </div>
                            ) : organizationAccess ? (
                              <>
                                <Form.Group className="mb-3">
                                  <Form.Label className="small fw-semibold text-secondary">
                                    Your Organization API Key
                                  </Form.Label>
                                  <div className="input-group">
                                    <Form.Control
                                      type={showApiKey ? "text" : "password"}
                                      value={organizationAccess.api_key || ""}
                                      readOnly
                                      className="font-monospace fw-semibold bg-light"
                                    />
                                    <Button
                                      variant="outline-secondary"
                                      type="button"
                                      onClick={() => setShowApiKey(!showApiKey)}
                                      title={showApiKey ? "Hide Key" : "Show Key"}
                                    >
                                      {showApiKey ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                                    </Button>
                                    <Button
                                      variant="primary"
                                      type="button"
                                      onClick={copyApiKey}
                                    >
                                      <IconCopy size={18} className="me-1" /> Copy Key
                                    </Button>
                                  </div>
                                  <Form.Text className="text-muted small">
                                    Keep this secret. Never share your API Key in public repositories.
                                  </Form.Text>
                                </Form.Group>

                                <div className="d-flex align-items-center justify-content-between mt-4 pt-3 border-top flex-wrap gap-2">
                                  <div>
                                    <span className="small text-muted d-block">Need to rotate credentials?</span>
                                    <small className="text-secondary">Regenerating creates a fresh key immediately.</small>
                                  </div>
                                  {organizationAccess.can_manage_invite_code ? (
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={regenerateApiKey}
                                      disabled={isUpdatingApiKey}
                                    >
                                      {isUpdatingApiKey ? (
                                        <><Spinner size="sm" className="me-1" /> Regenerating…</>
                                      ) : (
                                        <><IconRefresh size={16} className="me-1" /> Regenerate API Key</>
                                      )}
                                    </Button>
                                  ) : (
                                    <small className="text-secondary">Only the organization owner can rotate keys.</small>
                                  )}
                                </div>
                              </>
                            ) : (
                              <Alert variant="warning" className="small mb-0">
                                Please create a company workspace to generate your integration API key.
                              </Alert>
                            )}

                            <hr className="my-4" />

                            <h6 className="fw-bold mb-3 d-flex align-items-center gap-2">
                              <IconLink size={18} className="text-primary" />
                              How to connect SimplyJob with AttendStack
                            </h6>
                            <div className="bg-light p-3 rounded small text-secondary">
                              <ol className="mb-0 ps-3">
                                <li className="mb-1">Click <strong>Copy Key</strong> above to copy your unique AttendStack API Key.</li>
                                <li className="mb-1">Open <strong>SimplyJob</strong> and navigate to <strong>Hired Employees & AttendStack</strong>.</li>
                                <li className="mb-1">Click <strong>Connect with API Key</strong> and paste the key.</li>
                                <li>SimplyJob will instantly connect, auto-fetch your Organization Code (<strong>{organizationAccess?.invite_code || "ORG-XXXXXX"}</strong>), and enable 1-click candidate invites!</li>
                              </ol>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Right Column: Organization Code & Plan Status */}
                      <Col lg={5}>
                        <div className="d-flex flex-column gap-4 h-100">
                          {/* Organization Code Box */}
                          <Card className="border shadow-sm">
                            <Card.Body>
                              <h5 className="fw-bold mb-2 d-flex align-items-center gap-2">
                                <IconShieldLock size={20} className="text-primary" />
                                Organization Code (Org ID)
                              </h5>
                              <p className="text-muted small mb-3">
                                Unique company identifier managed in AttendStack and synchronized with SimplyJob.
                              </p>

                              {organizationAccess ? (
                                <div className="d-flex align-items-center justify-content-between bg-light p-3 rounded border">
                                  <div>
                                    <span className="text-xs text-muted d-block uppercase fw-bold">Active Code</span>
                                    <span className="font-monospace fw-bold fs-5 text-primary">
                                      {organizationAccess.invite_code}
                                    </span>
                                  </div>
                                  <div className="d-flex gap-2">
                                    <Button variant="outline-primary" size="sm" onClick={copyOrganizationCode}>
                                      <IconCopy size={16} />
                                    </Button>
                                    {organizationAccess.can_manage_invite_code && (
                                      <Button
                                        variant="outline-secondary"
                                        size="sm"
                                        onClick={regenerateOrganizationCode}
                                        disabled={isUpdatingOrganizationCode}
                                        title="Reset Org ID (SimplyJob will auto-fetch the new one via API Key)"
                                      >
                                        <IconRefresh size={16} />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <Spinner size="sm" />
                              )}
                              <Form.Text className="text-muted small d-block mt-2">
                                If this code is reset, SimplyJob will automatically update it via your stored API Key.
                              </Form.Text>
                            </Card.Body>
                          </Card>

                          {/* Plan & Expiry Status Box */}
                          <Card className={`border shadow-sm ${organizationAccess?.is_plan_expired ? "border-danger bg-danger-subtle" : organizationAccess?.is_plan_expiring_soon ? "border-warning bg-warning-subtle" : ""}`}>
                            <Card.Body>
                              <h5 className="fw-bold mb-2 d-flex align-items-center justify-content-between">
                                <span className="d-flex align-items-center gap-2">
                                  <IconCreditCard size={20} className="text-primary" />
                                  Plan & Subscription
                                </span>
                                <Badge
                                  bg={
                                    organizationAccess?.is_plan_expired
                                      ? "danger"
                                      : organizationAccess?.is_plan_expiring_soon
                                      ? "warning"
                                      : "success"
                                  }
                                >
                                  {organizationAccess?.is_plan_expired
                                    ? "EXPIRED"
                                    : organizationAccess?.is_plan_expiring_soon
                                    ? "EXPIRING SOON"
                                    : "ACTIVE"}
                                </Badge>
                              </h5>

                              <div className="mt-3">
                                <div className="d-flex justify-content-between py-1 border-bottom">
                                  <span className="text-muted small">Current Plan:</span>
                                  <span className="fw-bold small">{organizationAccess?.plan_name || "Standard Plan"}</span>
                                </div>
                                <div className="d-flex justify-content-between py-1 border-bottom">
                                  <span className="text-muted small">Plan Source:</span>
                                  <span className="small">{organizationAccess?.plan_source === "SIMPLYJOB" ? "SimplyJob Integrated" : "AttendStack Direct"}</span>
                                </div>
                                <div className="d-flex justify-content-between py-1 border-bottom">
                                  <span className="text-muted small">Max Capacity:</span>
                                  <span className="small fw-semibold">{organizationAccess?.max_employees || 50} Employees</span>
                                </div>
                                <div className="d-flex justify-content-between py-1">
                                  <span className="text-muted small">Expiration Date:</span>
                                  <span className={`small fw-bold ${organizationAccess?.is_plan_expired ? "text-danger" : organizationAccess?.is_plan_expiring_soon ? "text-warning" : "text-dark"}`}>
                                    {organizationAccess?.plan_expires_at
                                      ? new Date(organizationAccess.plan_expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                      : "Active (Ongoing)"}
                                    {organizationAccess?.days_until_plan_expiry !== null && organizationAccess?.days_until_plan_expiry !== undefined && (
                                      <span className="ms-1 fw-normal text-muted">
                                        ({organizationAccess.days_until_plan_expiry} days left)
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>

                              {organizationAccess?.is_plan_expiring_soon && (
                                <Alert variant="warning" className="mt-3 py-2 small mb-0 d-flex align-items-center gap-2">
                                  <IconAlertTriangle size={18} className="flex-shrink-0" />
                                  <span>Your plan expires in {organizationAccess.days_until_plan_expiry} days. Please renew to avoid service interruption.</span>
                                </Alert>
                              )}
                              {organizationAccess?.is_plan_expired && (
                                <Alert variant="danger" className="mt-3 py-2 small mb-0 d-flex align-items-center gap-2">
                                  <IconAlertTriangle size={18} className="flex-shrink-0" />
                                  <span>Your plan has expired. Please renew your subscription to reactivate all features.</span>
                                </Alert>
                              )}

                              <div className="mt-3 pt-3 border-top d-flex gap-2 flex-wrap">
                                <Button
                                  as={Link as any}
                                  href="/plans"
                                  variant="primary"
                                  size="sm"
                                  className="fw-bold flex-grow-1 text-decoration-none d-inline-flex align-items-center justify-content-center"
                                >
                                  <IconArrowUpRight size={16} className="me-1" />
                                  {organizationAccess?.is_plan_expired ? "Reactivate Subscription" : "Renew / Upgrade Plan"}
                                </Button>
                                {organizationAccess?.plan_source === "SIMPLYJOB" && (
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    className="fw-semibold"
                                    onClick={() => {
                                      const simplyJobUrl = process.env.NEXT_PUBLIC_SIMPLYJOB_URL || (typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:3009" : "https://simplyjob.in");
                                      window.open(`${simplyJobUrl}/company/billing`, "_blank");
                                    }}
                                  >
                                    <IconExternalLink size={15} className="me-1" /> Renew on SimplyJob
                                  </Button>
                                )}
                              </div>
                            </Card.Body>
                          </Card>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>

          {/* Action Buttons */}
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button variant="secondary" onClick={handleResetDefaults} disabled={isSaving}>
              <IconRefresh size={18} className="me-2" />
              Reset to Defaults
            </Button>
            <Button variant="primary" onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Saving...
                </>
              ) : (
                <>
                  <IconDeviceFloppy size={18} className="me-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default SettingsPage;
