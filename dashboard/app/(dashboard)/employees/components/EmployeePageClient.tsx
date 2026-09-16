"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  IconDotsVertical,
  IconEdit,
  IconEye,
  IconFilter,
  IconKey,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUserCheck,
  IconCalendarStats,
  IconCopy,
  IconMail,
  IconAlertTriangle,
  IconCheck,
  IconBuildingSkyscraper,
} from "@tabler/icons-react";
import { Alert, Button, Dropdown, Form, Modal } from "react-bootstrap";
import Link from "next/link";
import EmployeeFormWizard, { EmployeeFormData } from "./EmployeeFormWizard";

type EmployeeStatus = "ACTIVE" | "PROVISION" | "INACTIVE" | "ON_LEAVE" | "NOTICE_PERIOD" | "TERMINATED";

type Employee = {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  profile_photo_url: string | null;
  department: string;
  designation: string;
  joining_date: string;
  account_exists: boolean;
  status: EmployeeStatus;
  status_label: string;
  status_effective_date?: string | null;
  status_end_date?: string | null;
  auto_transition_status?: EmployeeStatus | null;
  auto_transition_status_label?: string | null;
};

type EmployeeListResponse = Employee[] | {
  results: Employee[];
};

type PasswordActionResponse = {
  detail: string;
  employee_id: string;
  email: string;
  temporary_password: string;
};

type PasswordAction = "create-password" | "reset-password";

const API_URL = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/employees/`;
const localDateValue = () => {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
};

const statusBadgeClass: Record<Employee["status"], string> = {
  ACTIVE: "bg-success-subtle text-success",
  PROVISION: "bg-info-subtle text-info",
  ON_LEAVE: "bg-warning-subtle text-warning",
  NOTICE_PERIOD: "bg-warning-subtle text-danger",
  INACTIVE: "bg-secondary-subtle text-secondary",
  TERMINATED: "bg-danger-subtle text-danger",
};

const employeeStatusOptions: Array<{
  value: EmployeeStatus;
  label: string;
}> = [
  {
    value: "ACTIVE",
    label: "Active",
  },
  {
    value: "PROVISION",
    label: "Provision",
  },
  {
    value: "ON_LEAVE",
    label: "On Leave",
  },
  {
    value: "NOTICE_PERIOD",
    label: "Notice Period",
  },
  {
    value: "INACTIVE",
    label: "Inactive",
  },
  {
    value: "TERMINATED",
    label: "Terminated",
  },
];

const statusLabelByValue = employeeStatusOptions.reduce((labels, option) => {
  labels[option.value] = option.label;
  return labels;
}, {} as Record<EmployeeStatus, string>);

const employeeStatusOrder: Record<EmployeeStatus, number> = {
  ACTIVE: 0,
  PROVISION: 1,
  ON_LEAVE: 2,
  NOTICE_PERIOD: 3,
  INACTIVE: 4,
  TERMINATED: 5,
};

const sortEmployeesByStatus = (employees: Employee[]) => [...employees].sort((first, second) =>
  employeeStatusOrder[first.status] - employeeStatusOrder[second.status]
  || first.full_name.localeCompare(second.full_name)
);

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const toCamelCase = (s: string) => {
  return s.replace(/([-_][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '');
  });
};

const generateStrongPassword = (length = 14) => {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = lower + upper + digits + symbols;
  const required = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  const remaining = Array.from({ length: length - required.length }, () => all[Math.floor(Math.random() * all.length)]);
  return [...required, ...remaining].sort(() => Math.random() - 0.5).join("");
};

const EmployeePageClient = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          setCurrentUser(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isHR = currentUser?.role === "HR";
  const isSubAdmin = currentUser?.role === "SUB_ADMIN";
  const employeesPermission = currentUser?.permissions?.employees;

  const canEdit = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof employeesPermission === "object" && employeesPermission !== null
      ? Boolean(employeesPermission.edit)
      : Boolean(employeesPermission)
  ) : true);

  const canDelete = isSuperAdmin || isHR || (isSubAdmin ? (
    typeof employeesPermission === "object" && employeesPermission !== null
      ? Boolean(employeesPermission.delete)
      : false
  ) : false);

  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [passwordEmployee, setPasswordEmployee] = useState<Employee | null>(null);
  const [passwordAction, setPasswordAction] = useState<PasswordAction>("create-password");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [statusEmployee, setStatusEmployee] = useState<Employee | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<EmployeeStatus>("ACTIVE");
  const [statusEffectiveDate, setStatusEffectiveDate] = useState(localDateValue);
  const [statusEndDate, setStatusEndDate] = useState("");
  const [autoTransitionStatus, setAutoTransitionStatus] = useState<EmployeeStatus | "">("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Partial<EmployeeFormData> | null>(null);
  const [isEditModalLoading, setIsEditModalLoading] = useState(false);
  const router = useRouter();

  // SimplyJob Invitation Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState<{ invite_url: string; invite_code: string; simplyjob_org_id: string } | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  const handleOpenInviteModal = async () => {
    setShowInviteModal(true);
    setIsGeneratingInvite(true);
    setInviteError("");
    setInviteData(null);

    try {
      const token = localStorage.getItem("authToken");
      const orgRes = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/organizations/my-organization/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let myOrg = null;
      if (orgRes.ok) {
        const orgs = await orgRes.json();
        const list = Array.isArray(orgs) ? orgs : orgs.results || [];
        if (list.length > 0) myOrg = list[0];
      }
      if (!myOrg) {
        const fallbackRes = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/organizations/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallbackRes.ok) {
          const orgs = await fallbackRes.json();
          const list = Array.isArray(orgs) ? orgs : orgs.results || [];
          const storedUserStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
          const storedUser = storedUserStr ? JSON.parse(storedUserStr) : null;
          myOrg = (storedUser?.email && list.find((o: any) => o.owner_email && o.owner_email.toLowerCase() === storedUser.email.toLowerCase())) || list[0];
        }
      }
      if (myOrg) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1/organizations/${myOrg.id}/generate-invite-link/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setInviteData(data);
        } else {
          setInviteError(data.detail || "SimplyJob Organization ID is not configured. Please paste and save your SimplyJob Org ID in Settings before sending invitations.");
        }
      } else {
        setInviteError("No organization workspace found for this account.");
      }
    } catch {
      setInviteError("Failed to generate invitation link. Please check your backend connection.");
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const loadEmployees = async () => {
    setIsLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(API_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error("Unable to load employees from the backend.");
      }

      const data = (await response.json()) as EmployeeListResponse;
      setEmployees(sortEmployeesByStatus(Array.isArray(data) ? data : data.results));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load employees.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleRowClick = (employeeUuid: string) => {
    router.push(`/employees/${employeeUuid}`);
  };

  const handleEdit = async (employee: Employee) => {
    setIsEditModalOpen(true);
    setIsEditModalLoading(true);
    setEditingEmployee(null);
    try {
      const details = await fetchEmployeeDetails(employee.id);
      setEditingEmployee({ ...details, id: employee.id });
    } catch (error) {
      Swal.fire("Error", "Could not load employee details.", "error");
      setIsEditModalOpen(false);
    } finally {
      setIsEditModalLoading(false);
    }
  };

  const fetchEmployeeDetails = async (employeeId: string): Promise<Partial<EmployeeFormData>> => {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${API_URL}${employeeId}/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      throw new Error("Failed to fetch employee details.");
    }
    const data = await response.json();
    const camelCaseData: Partial<EmployeeFormData> = {};
    for (const key in data) {
      if (key === "profile_photo") {
        camelCaseData.profilePhoto = null;
        continue;
      }
      if (key === "profile_photo_url") {
        camelCaseData.profilePhotoUrl = data[key];
        continue;
      }
      if (key === "aadhaar_document") {
        camelCaseData.aadhaarDocument = null;
        continue;
      }
      if (key === "aadhaar_document_url") {
        camelCaseData.aadhaarDocumentUrl = data[key];
        continue;
      }
      if (key === "pan_card_document") {
        camelCaseData.panCardDocument = null;
        continue;
      }
      if (key === "pan_card_document_url") {
        camelCaseData.panCardDocumentUrl = data[key];
        continue;
      }
      if (key === "cv_document") {
        camelCaseData.cvDocument = null;
        continue;
      }
      if (key === "cv_document_url") {
        camelCaseData.cvDocumentUrl = data[key];
        continue;
      }
      const camelKey = toCamelCase(key);
      // Optional API fields may be null for existing employees. Form controls
      // and the edit payload expect strings, so normalize them at the boundary.
      (camelCaseData as any)[camelKey] = data[key] ?? "";
    }
    return camelCaseData;
  };

  const handleDelete = async (employeeId: string) => {
    if (!canDelete) {
      Swal.fire({
        title: "Permission Denied",
        text: "You do not have permission to delete employee records.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
      return;
    }

    const result = await Swal.fire({
      title: "Delete Employee?",
      text: "This permanently deletes the employee record and their linked login account. They will no longer be able to sign in.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Delete It",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    try {
      setError("");
      setSuccessMessage("");
      setActionLoadingKey(`${employeeId}:delete`);
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}${employeeId}/`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error("Unable to delete employee.");
      }

      setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));
      Swal.fire({
        title: "Deleted!",
        text: "Employee and linked login account deleted successfully.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (deleteError) {
      Swal.fire({
        title: "Delete Failed",
        text: deleteError instanceof Error ? deleteError.message : "Unable to delete employee.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setActionLoadingKey(null);
    }
  };

  const parseApiError = async (response: Response) => {
    const errorBody = await response.json().catch(() => null);
    if (!errorBody) return "Request failed. Please try again.";
    if (typeof errorBody.detail === "string") return errorBody.detail;
    return Object.values(errorBody).flat().join(" ");
  };

  const openPasswordModal = (employee: Employee, action: PasswordAction) => {
    setPasswordEmployee(employee);
    setPasswordAction(action);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const openStatusModal = (employee: Employee) => {
    setStatusEmployee(employee);
    setSelectedStatus(employee.status);
    const existingDate = employee.status_effective_date || employee.joining_date;
    setStatusEffectiveDate(existingDate || localDateValue());
    setStatusEndDate(employee.status_end_date || "");
    setAutoTransitionStatus((employee.auto_transition_status as EmployeeStatus) || "");
  };

  const closeStatusModal = () => {
    if (actionLoadingKey?.endsWith(":status")) return;
    setStatusEmployee(null);
    setSelectedStatus("ACTIVE");
    setStatusEffectiveDate(localDateValue());
    setStatusEndDate("");
    setAutoTransitionStatus("");
  };

  const closePasswordModal = () => {
    setPasswordEmployee(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const handleAutoGeneratePassword = () => {
    const generatedPassword = generateStrongPassword();
    setNewPassword(generatedPassword);
    setConfirmPassword(generatedPassword);
    setShowPassword(true);
  };

  const handlePasswordAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordEmployee) return;

    const trimmedPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if ((trimmedPassword || trimmedConfirmPassword) && trimmedPassword !== trimmedConfirmPassword) {
      Swal.fire({
        title: "Password Mismatch",
        text: "Password and confirm password must match.",
        icon: "warning",
        confirmButtonColor: "#ffc107",
      });
      return;
    }

    if (trimmedPassword && trimmedPassword.length < 8) {
      Swal.fire({
        title: "Weak Password",
        text: "Password must be at least 8 characters long.",
        icon: "warning",
        confirmButtonColor: "#ffc107",
      });
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setActionLoadingKey(`${passwordEmployee.id}:${passwordAction}`);

      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}${passwordEmployee.id}/${passwordAction}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(trimmedPassword ? { password: trimmedPassword } : {}),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const data = (await response.json()) as PasswordActionResponse;
      closePasswordModal();

      const successHtml = data.temporary_password
        ? `${data.detail}<br/><br/><div class="text-start"><strong>New Password:</strong><div class="input-group mt-1"><input type="text" class="form-control font-monospace" value="${data.temporary_password}" readonly /><button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText('${data.temporary_password}').then(() => { this.innerText = 'Copied'; });">Copy</button></div><small class="d-block mt-2 text-warning">Please copy this password and share it securely. It will not be shown again.</small></div>`
        : data.detail;

      Swal.fire({
        title: "Success",
        html: successHtml,
        icon: "success",
        confirmButtonColor: "#198754",
      });

      setEmployees((prev) =>
        prev.map((item) =>
          item.id === passwordEmployee.id ? { ...item, account_exists: true } : item
        )
      );
    } catch (passwordError) {
      Swal.fire({
        title: "Action Failed",
        text: passwordError instanceof Error ? passwordError.message : "Unable to complete password action.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setActionLoadingKey(null);
    }
  };

  const handleStatusAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!statusEmployee) return;

    try {
      setError("");
      setSuccessMessage("");
      setActionLoadingKey(`${statusEmployee.id}:status`);

      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}${statusEmployee.id}/status/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          status: selectedStatus,
          effective_date: statusEffectiveDate,
          end_date: statusEndDate || null,
          auto_transition_status: autoTransitionStatus || (selectedStatus === "NOTICE_PERIOD" ? "INACTIVE" : selectedStatus === "PROVISION" ? "ACTIVE" : null),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const updatedEmployee = (await response.json()) as Employee;
      setEmployees((prev) => sortEmployeesByStatus(
        prev.map((item) => (item.id === updatedEmployee.id ? { ...item, ...updatedEmployee } : item))
      ));
      setStatusEmployee(null);

      Swal.fire({
        title: "Status Updated",
        text: `${updatedEmployee.full_name} is now ${updatedEmployee.status_label} (Effective: ${formatDate(statusEffectiveDate)}).`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (statusError) {
      Swal.fire({
        title: "Status Update Failed",
        text: statusError instanceof Error ? statusError.message : "Unable to update employee status.",
        icon: "error",
        confirmButtonColor: "#dc3545",
      });
    } finally {
      setActionLoadingKey(null);
    }
  };



  const handleEditSaved = async () => {
    await loadEmployees();
    setIsEditModalOpen(false);
    setEditingEmployee(null);
    Swal.fire("Success", "Employee updated successfully!", "success");
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        employee.full_name.toLowerCase().includes(query) ||
        employee.email.toLowerCase().includes(query) ||
        employee.employee_id.toLowerCase().includes(query);
      const matchesDepartment = !departmentFilter || employee.department === departmentFilter;
      const matchesStatus = !statusFilter || employee.status === statusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [employees, searchQuery, departmentFilter, statusFilter]);

  const uniqueDepartments = [...new Set(employees.map((employee) => employee.department).filter(Boolean))];
  return (
    <Fragment>
      <div className="mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <h2 className="mb-0 fw-bold">Employees</h2>
          <p className="text-secondary mb-0">Manage your workforce, view profiles, and update details.</p>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Button variant="outline-primary" className="d-flex align-items-center gap-2 fw-semibold" onClick={handleOpenInviteModal}>
            <IconMail size={18} /> Invite Candidate (SimplyJob)
          </Button>
          <Link href="/employees/add" className="btn btn-primary d-flex align-items-center gap-2">
            <IconPlus size={18} /> Add Employee
          </Link>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-6">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-3">
          <div className="row g-3 align-items-center">
            <div className="col-12 col-md-5 col-lg-4">
              <div className="input-group">
                <span className="input-group-text bg-transparent border-end-0">
                  <IconSearch size={18} className="text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 ps-0"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-7 col-lg-8 d-flex justify-content-start justify-content-md-end">
              <Dropdown>
                <Dropdown.Toggle variant="outline-secondary" id="dropdown-filter" className="d-flex align-items-center gap-2">
                  <IconFilter size={18} /> Filter
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  <Dropdown.Header>Department</Dropdown.Header>
                  <Dropdown.Item onClick={() => setDepartmentFilter("")}>All Departments</Dropdown.Item>
                  {uniqueDepartments.map((department) => (
                    <Dropdown.Item key={department} onClick={() => setDepartmentFilter(department)}>{department}</Dropdown.Item>
                  ))}
                  <Dropdown.Divider />
                  <Dropdown.Header>Status</Dropdown.Header>
                  <Dropdown.Item onClick={() => setStatusFilter("")}>All Statuses</Dropdown.Item>
                  <Dropdown.Item onClick={() => setStatusFilter("ACTIVE")}>Active</Dropdown.Item>
                  <Dropdown.Item onClick={() => setStatusFilter("PROVISION")}>Provision</Dropdown.Item>
                  <Dropdown.Item onClick={() => setStatusFilter("ON_LEAVE")}>On Leave</Dropdown.Item>
                  <Dropdown.Item onClick={() => setStatusFilter("NOTICE_PERIOD")}>Notice Period</Dropdown.Item>
                  <Dropdown.Item onClick={() => setStatusFilter("INACTIVE")}>Inactive</Dropdown.Item>
                  <Dropdown.Item onClick={() => setStatusFilter("TERMINATED")}>Terminated</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </div>
        </div>
        <div className="card-body p-0">
          {error && <div className="alert alert-danger m-3">{error}</div>}
          {successMessage && <div className="alert alert-success m-3">{successMessage}</div>}

          <div className="table-responsive employee-table-wrapper">
            <table className="table table-sm table-borderless table-striped align-middle table-hover text-nowrap mb-0">
              <thead className="table-light">
                <tr>
                  <th className="py-2.5 ps-3" style={{ minWidth: "220px" }}>Employee Name</th>
                  <th className="py-2.5" style={{ minWidth: "110px" }}>ID</th>
                  <th className="py-2.5" style={{ minWidth: "130px" }}>Department</th>
                  <th className="py-2.5" style={{ minWidth: "140px" }}>Designation</th>
                  <th className="py-2.5" style={{ minWidth: "150px" }}>Status</th>
                  <th className="py-2.5 text-center employee-action-column pe-3" style={{ minWidth: "90px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-secondary">Loading employees...</td>
                  </tr>
                )}

                {!isLoading && filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-secondary">No employees found.</td>
                  </tr>
                )}

                {!isLoading && filteredEmployees.map((employee) => (
                  <tr key={employee.id} style={{ cursor: "pointer" }} onClick={() => handleRowClick(employee.id)}>
                    <td className="py-2 ps-3" style={{ maxWidth: "220px" }}>
                      <div className="d-flex align-items-center">
                        <img
                          src={employee.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                          alt={employee.full_name}
                          className="rounded-circle me-2.5 flex-shrink-0"
                          style={{ width: "32px", height: "32px", objectFit: "cover" }}
                        />
                        <div className="min-w-0">
                          <h6 className="mb-0 fw-semibold fs-6 text-truncate" title={employee.full_name}>{employee.full_name}</h6>
                          <small className="text-muted d-block text-truncate" style={{ fontSize: "0.78rem" }} title={employee.email}>{employee.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{employee.employee_id}</td>
                    <td style={{ maxWidth: "140px" }}>
                      <div className="text-truncate" style={{ maxWidth: "140px" }} title={employee.department || "-"}>
                        {employee.department || "-"}
                      </div>
                    </td>
                    <td style={{ maxWidth: "180px" }}>
                      <div className="text-truncate" style={{ maxWidth: "180px" }} title={employee.designation || "-"}>
                        {employee.designation || "-"}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass[employee.status] || "bg-secondary-subtle text-secondary"}`}>
                        {employee.status_label}
                      </span>
                      {employee.status === "INACTIVE" || employee.status === "TERMINATED" ? (
                        (employee.status_effective_date || employee.joining_date) && (
                          <small className="d-block text-muted mt-0.5" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                            {employee.status === "TERMINATED" ? "On " : "Since "}
                            {formatDate(employee.status_effective_date || employee.joining_date)}
                          </small>
                        )
                      ) : employee.status_end_date ? (
                        <small className="d-block text-muted mt-0.5" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                          Until {formatDate(employee.status_end_date)}
                          {employee.auto_transition_status_label ? ` → ${employee.auto_transition_status_label}` : ""}
                        </small>
                      ) : (employee.status === "NOTICE_PERIOD" || employee.status === "PROVISION" || employee.status === "ON_LEAVE") && employee.status_effective_date ? (
                        <small className="d-block text-muted mt-0.5" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                          Since {formatDate(employee.status_effective_date)}
                        </small>
                      ) : null}
                    </td>
                    <td className="text-center employee-action-column">
                      <Dropdown
                        align="end"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Dropdown.Toggle
                          variant="light"
                          size="sm"
                          className="btn-icon employee-action-toggle"
                          aria-label={`Actions for ${employee.full_name}`}
                        >
                          <IconDotsVertical size={18} />
                        </Dropdown.Toggle>
                        <Dropdown.Menu
                          className="employee-action-menu shadow border-0"
                          popperConfig={{ strategy: "fixed" }}
                        >
                          <Dropdown.Item onClick={() => handleRowClick(employee.id)} className="d-flex align-items-center gap-2">
                            <IconEye size={16} /> View Profile
                          </Dropdown.Item>
                          {canEdit && (
                            <>
                              <Dropdown.Item onClick={() => handleEdit(employee)} className="d-flex align-items-center gap-2">
                                <IconEdit size={16} /> Edit Employee
                              </Dropdown.Item>
                              <Dropdown.Item onClick={() => router.push(`/employees/${employee.id}#leave-entitlement`)} className="d-flex align-items-center gap-2">
                                <IconCalendarStats size={16} /> Manage Leave Entitlement
                              </Dropdown.Item>
                              <Dropdown.Item onClick={() => openStatusModal(employee)} className="d-flex align-items-center gap-2">
                                <IconUserCheck size={16} /> Change Status
                              </Dropdown.Item>
                              <Dropdown.Divider />
                              <Dropdown.Item
                                disabled={employee.account_exists || actionLoadingKey === `${employee.id}:create-password`}
                                onClick={() => openPasswordModal(employee, "create-password")}
                                className="d-flex align-items-center gap-2"
                              >
                                <IconKey size={16} /> {actionLoadingKey === `${employee.id}:create-password` ? "Creating..." : "Create Password"}
                              </Dropdown.Item>
                            </>
                          )}
                          {canDelete && (
                            <>
                              <Dropdown.Divider />
                              <Dropdown.Item
                                disabled={actionLoadingKey === `${employee.id}:delete`}
                                onClick={() => handleDelete(employee.id)}
                                className="d-flex align-items-center gap-2 text-danger"
                              >
                                <IconTrash size={16} /> {actionLoadingKey === `${employee.id}:delete` ? "Deleting..." : "Delete"}
                              </Dropdown.Item>
                            </>
                          )}
                        </Dropdown.Menu>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal show={Boolean(passwordEmployee)} onHide={closePasswordModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>{passwordAction === "create-password" ? "Create Employee Password" : "Reset Employee Password"}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePasswordAction}>
          <Modal.Body>
            <Alert variant="info" className="mb-4">
              Enter your own password or use auto-generate. If both fields are left blank, the system will generate a secure password automatically.
            </Alert>
            <div className="mb-4">
              <div className="text-secondary small">Employee</div>
              <div className="fw-semibold">{passwordEmployee?.full_name}</div>
              <div className="text-muted small">{passwordEmployee?.email}</div>
            </div>
            <Form.Group className="mb-3" controlId="employeePassword">
              <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
                <Form.Label className="mb-0 fw-semibold">Password</Form.Label>
                <Button
                  type="button"
                  variant="outline-primary"
                  size="sm"
                  onClick={handleAutoGeneratePassword}
                >
                  Auto Generate
                </Button>
              </div>
              <Form.Control
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter custom password or auto-generate"
                autoComplete="new-password"
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="employeeConfirmPassword">
              <Form.Label className="fw-semibold">Confirm Password</Form.Label>
              <Form.Control
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </Form.Group>
            <Form.Check
              type="checkbox"
              id="showEmployeePassword"
              label="Show password"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closePasswordModal} disabled={Boolean(actionLoadingKey)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={Boolean(actionLoadingKey)}>
              {actionLoadingKey ? "Saving..." : passwordAction === "create-password" ? "Create Password" : "Reset Password"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={Boolean(statusEmployee)} onHide={closeStatusModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Change Employee Status</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleStatusAction}>
          <Modal.Body>
            <div className="employee-status-summary mb-4">
              <div className="d-flex align-items-center gap-3">
                <img
                  src={statusEmployee?.profile_photo_url || "/images/avatar/avatar-fallback.jpg"}
                  alt={statusEmployee?.full_name || "Employee"}
                  className="avatar avatar-sm rounded-circle"
                />
                <div className="min-w-0">
                  <div className="fw-semibold">{statusEmployee?.full_name}</div>
                  <div className="text-muted small">{statusEmployee?.employee_id} - {statusEmployee?.email}</div>
                </div>
              </div>
              {statusEmployee && (
                <div className="d-flex flex-wrap gap-1 align-items-center justify-content-end">
                  <span className={`badge ${statusBadgeClass[statusEmployee.status] || "bg-secondary-subtle text-secondary"}`}>
                    Current: {statusEmployee.status_label}
                  </span>
                  {statusEmployee.status_effective_date && (
                    <span className="badge bg-light text-dark border" style={{ fontSize: "11px" }}>
                      Since: {formatDate(statusEmployee.status_effective_date)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <Form.Group className="mb-4" controlId="employeeStatus">
              <Form.Label className="fw-semibold">New Status</Form.Label>
              <div className="employee-status-options">
                {employeeStatusOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`employee-status-option ${selectedStatus === option.value ? "is-selected" : ""}`}
                  >
                    <Form.Check
                      type="radio"
                      name="employeeStatus"
                      value={option.value}
                      checked={selectedStatus === option.value}
                      onChange={(event) => setSelectedStatus(event.target.value as EmployeeStatus)}
                    />
                    <span>
                      <span className="d-flex align-items-center justify-content-between gap-3">
                        <span className="fw-semibold">{option.label}</span>
                        <span className={`badge ${statusBadgeClass[option.value]}`}>{option.label}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </Form.Group>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <Form.Group controlId="statusEffectiveDate">
                  <Form.Label className="fw-semibold">Start Date (From)</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    min={statusEmployee?.joining_date}
                    value={statusEffectiveDate}
                    onChange={(event) => setStatusEffectiveDate(event.target.value)}
                  />
                  <Form.Text className="text-muted small" style={{ fontSize: "11px" }}>
                    Select today or any past effective date (since joining: {formatDate(statusEmployee?.joining_date)}).
                  </Form.Text>
                </Form.Group>
              </div>

              <div className="col-md-6">
                <Form.Group controlId="statusEndDate">
                  <Form.Label className="fw-semibold">
                    End Date (To) {selectedStatus === "NOTICE_PERIOD" || selectedStatus === "PROVISION" ? <span className="text-danger">*</span> : <small className="text-muted">(Optional)</small>}
                  </Form.Label>
                  <Form.Control
                    type="date"
                    min={statusEffectiveDate}
                    value={statusEndDate}
                    onChange={(event) => setStatusEndDate(event.target.value)}
                  />
                  <Form.Text className="text-muted small" style={{ fontSize: "11px" }}>
                    {selectedStatus === "NOTICE_PERIOD" || selectedStatus === "PROVISION" ? "End date of this transition phase." : "Optional expiration date."}
                  </Form.Text>
                </Form.Group>
              </div>
            </div>

            {(selectedStatus === "NOTICE_PERIOD" || selectedStatus === "PROVISION" || statusEndDate) && (
              <div className="alert alert-warning border-0 shadow-sm rounded-3 mb-3 p-3">
                <div className="d-flex align-items-center gap-2 mb-1 fw-bold text-dark">
                  <IconCalendarStats size={18} className="text-warning me-1" />
                  Automated Status Transition
                </div>
                <div className="small text-secondary">
                  {selectedStatus === "NOTICE_PERIOD" && (
                    statusEndDate ? (
                      <>Employee serves Notice Period until <strong>{formatDate(statusEndDate)}</strong>. Once the notice period ends, status will automatically transition to <span className="badge bg-secondary-subtle text-secondary ms-1">Inactive</span>.</>
                    ) : (
                      <>Select the Notice Period end date above. Once completed, employee status will automatically transition to <span className="badge bg-secondary-subtle text-secondary ms-1">Inactive</span>.</>
                    )
                  )}
                  {selectedStatus === "PROVISION" && (
                    statusEndDate ? (
                      <>Provision ends on <strong>{formatDate(statusEndDate)}</strong>. Once provision completes, status will automatically transition to <span className="badge bg-success-subtle text-success ms-1">Active</span>.</>
                    ) : (
                      <>Select the Provision end date above. Once completed, employee status will automatically transition to <span className="badge bg-success-subtle text-success ms-1">Active</span>.</>
                    )
                  )}
                  {selectedStatus !== "NOTICE_PERIOD" && selectedStatus !== "PROVISION" && statusEndDate && (
                    <>Status active from <strong>{formatDate(statusEffectiveDate)}</strong> until <strong>{formatDate(statusEndDate)}</strong>.</>
                  )}
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeStatusModal} disabled={actionLoadingKey === `${statusEmployee?.id}:status`}>
              Cancel
            </Button>
            <Button
              variant={
                selectedStatus === "ACTIVE"
                  ? "success"
                  : selectedStatus === "TERMINATED"
                  ? "danger"
                  : selectedStatus === "INACTIVE"
                  ? "secondary"
                  : "primary"
              }
              type="submit"
              disabled={!statusEmployee || actionLoadingKey === `${statusEmployee?.id}:status`}
            >
              {actionLoadingKey === `${statusEmployee?.id}:status`
                ? "Updating..."
                : selectedStatus === statusEmployee?.status
                ? "Update Status Dates"
                : `Set ${statusLabelByValue[selectedStatus]}`}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>



      <Modal show={isEditModalOpen} onHide={() => setIsEditModalOpen(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Edit Employee</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isEditModalLoading ? (
            <div className="text-center">Loading...</div>
          ) : (
            <EmployeeFormWizard
                initialData={editingEmployee || undefined}
                onSave={handleEditSaved}
                mode="edit"
              />
          )}
        </Modal.Body>
      </Modal>

      {/* SimplyJob Employee Invitation Modal */}
      <Modal show={showInviteModal} onHide={() => setShowInviteModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <IconMail className="text-primary" size={22} />
            Invite Candidate from SimplyJob
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          {isGeneratingInvite ? (
            <div className="text-center py-4">
              <span className="spinner-border spinner-border-sm text-primary me-2" />
              Checking SimplyJob integration & generating URL with Org ID...
            </div>
          ) : inviteError ? (
            <div>
              <Alert variant="warning" className="border-0 shadow-xs mb-3">
                <div className="fw-bold mb-1 d-flex align-items-center gap-1">
                  <IconAlertTriangle size={18} /> Integration Required:
                </div>
                <div className="small">{inviteError}</div>
              </Alert>
              <div className="p-3 bg-light border rounded text-secondary small mb-3">
                <strong>Enforcement Rule:</strong> To invite hired employees from SimplyJob, your company must copy your AttendStack Org ID and paste your SimplyJob Org ID in Settings.
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Button variant="outline-secondary" onClick={() => setShowInviteModal(false)}>
                  Close
                </Button>
                <Link href="/settings" className="btn btn-primary fw-semibold" onClick={() => setShowInviteModal(false)}>
                  Go to Settings to Link Org ID
                </Link>
              </div>
            </div>
          ) : inviteData ? (
            <div>
              <p className="text-secondary small mb-3">
                Send this official onboarding link to your candidate hired on SimplyJob. The link includes your <strong>Org ID ({inviteData.invite_code})</strong> so the employee is automatically connected to your company.
              </p>

              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold small">Invitation URL (with Org ID)</Form.Label>
                <div className="input-group">
                  <Form.Control value={inviteData.invite_url} readOnly className="font-monospace small bg-light" />
                  <Button
                    variant="primary"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteData.invite_url);
                      alert("Invitation URL with Org ID copied to clipboard!");
                    }}
                  >
                    <IconCopy size={16} className="me-1" /> Copy Link
                  </Button>
                </div>
              </Form.Group>

              <div className="p-3 bg-success-subtle border border-success-subtle rounded text-success small mb-3">
                <IconCheck size={16} className="me-1" /> SimplyJob Connected: Org ID <strong>{inviteData.simplyjob_org_id}</strong> is verified.
              </div>
            </div>
          ) : null}
        </Modal.Body>
        {!inviteError && inviteData && (
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowInviteModal(false)}>
              Done
            </Button>
          </Modal.Footer>
        )}
      </Modal>

      <style jsx global>{`
        .employee-table-wrapper {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .employee-table-wrapper table {
          min-width: 860px;
          width: 100%;
        }

        .employee-action-column {
          width: 90px;
          min-width: 90px;
        }

        .employee-action-toggle {
          width: 34px;
          height: 34px;
          padding: 0;
          border: 1px solid #d8e0e7;
          border-radius: 8px;
          background: #fff;
          color: #526273;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
        }

        .employee-action-toggle::after {
          display: none;
        }

        .employee-action-toggle:hover,
        .employee-action-toggle:focus,
        .employee-action-toggle.show {
          background: #f5f8fb;
          border-color: #bac7d5;
          color: #0f172a;
        }

        .employee-action-menu {
          min-width: 210px;
          padding: 8px;
          border-radius: 8px;
          z-index: 1080;
        }

        .employee-action-menu .dropdown-item {
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
        }

        .employee-action-menu .dropdown-item:active {
          background-color: #e9f7f1;
          color: #0f172a;
        }

        .employee-status-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px;
          border: 1px solid #e5eaf0;
          border-radius: 8px;
          background: #f8fafc;
        }

        .employee-status-options {
          display: grid;
          gap: 10px;
        }

        .employee-status-option {
          display: grid;
          grid-template-columns: 22px 1fr;
          gap: 10px;
          padding: 12px;
          border: 1px solid #e5eaf0;
          border-radius: 8px;
          background: #fff;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .employee-status-option:hover {
          border-color: #b7c8da;
          background: #fbfdff;
        }

        .employee-status-option.is-selected {
          border-color: #0d6efd;
          box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.12);
        }

        .employee-status-option .form-check {
          min-height: 0;
          margin: 2px 0 0;
          padding-left: 0;
        }

        .employee-status-option .form-check-input {
          margin-left: 0;
        }

        .min-w-0 {
          min-width: 0;
        }

        @media (max-width: 991.98px) {
          .employee-table-wrapper {
            overflow-x: auto;
            padding-bottom: 20px;
          }
        }
      `}</style>
    </Fragment>
  );
};

export default EmployeePageClient;
