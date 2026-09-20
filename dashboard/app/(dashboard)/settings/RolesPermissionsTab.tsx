"use client";

import React, { useEffect, useState } from "react";
import { Row, Col, Card, Button, Form, Alert, Spinner, Badge, Table, InputGroup } from "react-bootstrap";
import {
  IconShieldLock,
  IconPlus,
  IconTrash,
  IconCheck,
  IconUsers,
  IconLock,
  IconEdit,
  IconUserPlus,
  IconSearch,
  IconArrowLeft,
} from "@tabler/icons-react";
import Swal from "sweetalert2";

const apiRoot = (process.env.NEXT_PUBLIC_API_ENDPOINT || "").replace(/\/$/, "");

const authHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

type ModuleDef = { key: string; label: string; description: string };
type PermissionFlags = { view: boolean; edit: boolean; delete: boolean };
type PermissionMatrix = Record<string, PermissionFlags>;

type RoleRecord = {
  id: string;
  name: string;
  description: string;
  is_admin: boolean;
  is_system: boolean;
  permissions: PermissionMatrix;
  employee_count: number;
};

type AssignableEmployee = {
  employee_id: string;
  employee_code: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  has_account: boolean;
  current_role_id: string | null;
  current_role_name: string | null;
  assigned: boolean;
};

function emptyMatrix(modules: ModuleDef[], allTrue = false): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  modules.forEach((m) => {
    matrix[m.key] = { view: allTrue, edit: allTrue, delete: allTrue };
  });
  return matrix;
}

export default function RolesPermissionsTab() {
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"edit" | "assign" | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formPermissions, setFormPermissions] = useState<PermissionMatrix>({});
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Assign Role panel state
  const [assignEmployees, setAssignEmployees] = useState<AssignableEmployee[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(null);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || null;
  const editing = panelMode === "edit" && (isCreating || !!selectedRole);
  const assigning = panelMode === "assign" && !!selectedRole;

  const loadData = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [modulesRes, rolesRes] = await Promise.all([
        fetch(`${apiRoot}/api/v1/roles/modules/`, { headers: authHeaders() }),
        fetch(`${apiRoot}/api/v1/roles/`, { headers: authHeaders() }),
      ]);
      if (!modulesRes.ok || !rolesRes.ok) {
        throw new Error("Failed to load roles & permissions.");
      }
      const modulesData: ModuleDef[] = await modulesRes.json();
      const rolesData = await rolesRes.json();
      setModules(modulesData);
      setRoles(Array.isArray(rolesData) ? rolesData : rolesData.results || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load roles & permissions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRole = (role: RoleRecord) => {
    setPanelMode("edit");
    setIsCreating(false);
    setSelectedRoleId(role.id);
    setFormName(role.name);
    setFormDescription(role.description);
    setFormIsAdmin(role.is_admin);
    setFormPermissions(role.permissions);
    setFormError("");
  };

  const openCreate = () => {
    setPanelMode("edit");
    setSelectedRoleId(null);
    setIsCreating(true);
    setFormName("");
    setFormDescription("");
    setFormIsAdmin(false);
    setFormPermissions(emptyMatrix(modules));
    setFormError("");
  };

  const closeEditor = () => {
    setPanelMode(null);
    setSelectedRoleId(null);
    setIsCreating(false);
    setFormError("");
  };

  const loadAssignees = async (roleId: string) => {
    setIsLoadingAssignees(true);
    setAssignError("");
    try {
      const res = await fetch(`${apiRoot}/api/v1/roles/${roleId}/employees/`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load employees.");
      const data: AssignableEmployee[] = await res.json();
      setAssignEmployees(data);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to load employees.");
    } finally {
      setIsLoadingAssignees(false);
    }
  };

  const openAssign = (role: RoleRecord) => {
    setPanelMode("assign");
    setIsCreating(false);
    setSelectedRoleId(role.id);
    setAssignSearch("");
    loadAssignees(role.id);
  };

  const toggleAssignment = async (employee: AssignableEmployee) => {
    if (!selectedRole || !employee.has_account) return;
    setTogglingEmployeeId(employee.employee_id);
    setAssignError("");
    try {
      const url = employee.assigned
        ? `${apiRoot}/api/v1/roles/unassign/`
        : `${apiRoot}/api/v1/roles/${selectedRole.id}/assign/`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: employee.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to update role assignment.");

      setAssignEmployees((prev) =>
        prev.map((e) =>
          e.employee_id === employee.employee_id
            ? {
                ...e,
                assigned: !employee.assigned,
                current_role_id: !employee.assigned ? selectedRole.id : null,
                current_role_name: !employee.assigned ? selectedRole.name : null,
              }
            : e
        )
      );
      // Refresh employee_count badges in the role list without losing panel state.
      const rolesRes = await fetch(`${apiRoot}/api/v1/roles/`, { headers: authHeaders() });
      if (rolesRes.ok) {
        const data2 = await rolesRes.json();
        setRoles(Array.isArray(data2) ? data2 : data2.results || []);
      }
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to update role assignment.");
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  const filteredAssignEmployees = assignEmployees.filter((e) => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q)
    );
  });

  const toggleFlag = (moduleKey: string, flag: keyof PermissionFlags) => {
    setFormPermissions((prev) => {
      const current = prev[moduleKey] || { view: false, edit: false, delete: false };
      const next = { ...current, [flag]: !current[flag] };
      // Keep the matrix consistent: delete implies edit implies view.
      if (flag === "delete" && next.delete) next.edit = true;
      if (flag === "edit" && next.edit) next.view = true;
      if (flag === "view" && !next.view) {
        next.edit = false;
        next.delete = false;
      }
      return { ...prev, [moduleKey]: next };
    });
  };

  const selectAll = () => setFormPermissions(emptyMatrix(modules, true));
  const clearAll = () => setFormPermissions(emptyMatrix(modules, false));

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError("Role name is required.");
      return;
    }
    setIsSaving(true);
    setFormError("");
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        is_admin: formIsAdmin,
        permissions: formPermissions,
      };
      const url = selectedRole
        ? `${apiRoot}/api/v1/roles/${selectedRole.id}/`
        : `${apiRoot}/api/v1/roles/`;
      const method = selectedRole ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.name?.[0] || data.detail || "Failed to save role.");
      }
      Swal.fire({
        icon: "success",
        title: selectedRole ? "Role Updated!" : "Role Created!",
        text: `'${data.name}' has been saved successfully.`,
        timer: 2000,
        showConfirmButton: false,
      });
      await loadData();
      setSelectedRoleId(data.id);
      setIsCreating(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRole) return;
    const confirm = await Swal.fire({
      title: `Delete role "${selectedRole.name}"?`,
      text:
        selectedRole.employee_count > 0
          ? `This role is assigned to ${selectedRole.employee_count} employee(s) and cannot be deleted until they're reassigned.`
          : "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      confirmButtonText: "Yes, Delete Role",
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`${apiRoot}/api/v1/roles/${selectedRole.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete role.");
      }
      Swal.fire({ icon: "success", title: "Deleted", timer: 1500, showConfirmButton: false });
      closeEditor();
      await loadData();
    } catch (err) {
      Swal.fire("Error", err instanceof Error ? err.message : "Failed to delete role.", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="p-4 border-top">
      {loadError && <Alert variant="danger">{loadError}</Alert>}

      <div className="mb-4">
        <h5 className="fw-bold mb-1 d-flex align-items-center gap-2">
          <IconShieldLock size={20} className="text-primary" />
          Role & Permission Management
        </h5>
        <p className="text-muted small mb-0">
          Employee → Role → Module → Permission. Create reusable roles with View/Edit/Delete access per
          module, then assign them to employees from their profile page.
        </p>
      </div>

      <Row className="g-4">
        {/* Role list */}
        <Col lg={4}>
          <Card className="border shadow-sm h-100">
            <Card.Header className="bg-transparent py-3 d-flex align-items-center justify-content-between">
              <h6 className="fw-bold mb-0">Roles</h6>
              <Button size="sm" variant="primary" className="d-inline-flex align-items-center gap-1" onClick={openCreate}>
                <IconPlus size={15} /> Create New Role
              </Button>
            </Card.Header>
            <Card.Body className="p-2">
              {roles.length === 0 && <p className="text-muted small p-3 mb-0">No roles yet. Create one to get started.</p>}
              {roles.map((role) => {
                const isActive = selectedRoleId === role.id;
                return (
                  <div
                    key={role.id}
                    className={`rounded-3 p-3 mb-2 ${isActive ? "bg-primary-subtle" : "bg-light"}`}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="fw-semibold text-dark d-flex align-items-center gap-2">
                        {role.name}
                        {role.is_system && <IconLock size={13} className="text-muted" />}
                      </span>
                      {role.is_admin && (
                        <Badge bg="primary-subtle" text="primary" className="border border-primary-subtle">
                          Full Access
                        </Badge>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-1 text-muted small mt-1 mb-2">
                      <IconUsers size={13} />
                      {role.employee_count} employee{role.employee_count === 1 ? "" : "s"}
                    </div>
                    <div className="d-flex gap-2">
                      <Button
                        size="sm"
                        variant={isActive && panelMode === "assign" ? "primary" : "outline-primary"}
                        className="d-inline-flex align-items-center gap-1 flex-fill justify-content-center"
                        onClick={() => openAssign(role)}
                      >
                        <IconUserPlus size={14} /> Assign Role
                      </Button>
                      <Button
                        size="sm"
                        variant={isActive && panelMode === "edit" ? "secondary" : "outline-secondary"}
                        className="d-inline-flex align-items-center gap-1 flex-fill justify-content-center"
                        onClick={() => openRole(role)}
                      >
                        <IconEdit size={14} /> View / Edit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card.Body>
          </Card>
        </Col>

        {/* Editor */}
        <Col lg={8}>
          {assigning && selectedRole ? (
            <Card className="border shadow-sm">
              <Card.Header className="bg-transparent py-3 d-flex align-items-center gap-2">
                <Button variant="link" className="p-0 text-secondary" onClick={closeEditor}>
                  <IconArrowLeft size={18} />
                </Button>
                <h6 className="fw-bold mb-0">Assign "{selectedRole.name}" to Employees</h6>
              </Card.Header>
              <Card.Body>
                {assignError && <Alert variant="danger" className="py-2 small">{assignError}</Alert>}

                <InputGroup className="mb-3">
                  <InputGroup.Text className="bg-light border-end-0">
                    <IconSearch size={15} className="text-muted" />
                  </InputGroup.Text>
                  <Form.Control
                    className="border-start-0"
                    placeholder="Search employees by name, ID, or email"
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                  />
                </InputGroup>

                {isLoadingAssignees ? (
                  <div className="d-flex justify-content-center py-4">
                    <Spinner animation="border" size="sm" />
                  </div>
                ) : filteredAssignEmployees.length === 0 ? (
                  <p className="text-muted small text-center py-4 mb-0">No employees found.</p>
                ) : (
                  <div className="d-flex flex-column gap-2" style={{ maxHeight: 460, overflowY: "auto" }}>
                    {filteredAssignEmployees.map((emp) => (
                      <label
                        key={emp.employee_id}
                        className={`d-flex align-items-center gap-3 p-2 rounded-3 border ${
                          emp.assigned ? "bg-primary-subtle border-primary-subtle" : "bg-light"
                        } ${!emp.has_account ? "opacity-50" : ""}`}
                        style={{ cursor: emp.has_account ? "pointer" : "not-allowed" }}
                      >
                        <Form.Check
                          type="checkbox"
                          checked={emp.assigned}
                          disabled={!emp.has_account || togglingEmployeeId === emp.employee_id}
                          onChange={() => toggleAssignment(emp)}
                        />
                        <div className="flex-grow-1 min-w-0">
                          <div className="fw-semibold text-dark d-flex align-items-center gap-2">
                            {emp.full_name}
                            <span className="text-muted small fw-normal">{emp.employee_code}</span>
                          </div>
                          <div className="text-muted small">
                            {emp.designation || emp.department || emp.email}
                            {!emp.has_account && " · No login account yet"}
                            {emp.has_account && emp.current_role_name && !emp.assigned && (
                              <> · Currently: {emp.current_role_name}</>
                            )}
                          </div>
                        </div>
                        {togglingEmployeeId === emp.employee_id && <Spinner size="sm" />}
                      </label>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>
          ) : !editing ? (
            <Card className="border shadow-sm h-100">
              <Card.Body className="d-flex flex-column align-items-center justify-content-center text-center py-5">
                <IconShieldLock size={36} className="text-muted mb-3" />
                <p className="text-muted mb-0">Select a role to view its permissions, or create a new one.</p>
              </Card.Body>
            </Card>
          ) : (
            <Card className="border shadow-sm">
              <Card.Header className="bg-transparent py-3">
                <h6 className="fw-bold mb-0">{selectedRole ? `Edit "${selectedRole.name}"` : "Create New Role"}</h6>
              </Card.Header>
              <Card.Body>
                {formError && <Alert variant="danger" className="py-2 small">{formError}</Alert>}

                <Row className="g-3 mb-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold">Role Name</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g. Floor Manager"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        disabled={selectedRole?.is_system}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold">Description</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="What is this role for?"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Check
                  type="switch"
                  id="role-is-admin-switch"
                  className="mb-3"
                  label={
                    <span>
                      <strong>Full Access (Admin)</strong> — this role gets complete access to every
                      module, regardless of the checkboxes below.
                    </span>
                  }
                  checked={formIsAdmin}
                  onChange={(e) => setFormIsAdmin(e.target.checked)}
                  disabled={selectedRole?.is_system}
                />

                {!formIsAdmin && (
                  <>
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <Form.Label className="fw-semibold mb-0">Module Permissions</Form.Label>
                      <div className="d-flex gap-2">
                        <Button size="sm" variant="outline-secondary" onClick={selectAll}>
                          Select All
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={clearAll}>
                          Clear All
                        </Button>
                      </div>
                    </div>
                    <div className="table-responsive rounded-3 border">
                      <Table className="mb-0 align-middle" size="sm">
                        <thead className="bg-light">
                          <tr>
                            <th>Module</th>
                            <th className="text-center" style={{ width: 90 }}>View</th>
                            <th className="text-center" style={{ width: 90 }}>Edit</th>
                            <th className="text-center" style={{ width: 90 }}>Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modules.map((mod) => {
                            const flags = formPermissions[mod.key] || { view: false, edit: false, delete: false };
                            return (
                              <tr key={mod.key}>
                                <td>
                                  <div className="fw-semibold">{mod.label}</div>
                                  <div className="text-muted small">{mod.description}</div>
                                </td>
                                <td className="text-center">
                                  <Form.Check
                                    type="checkbox"
                                    checked={flags.view}
                                    onChange={() => toggleFlag(mod.key, "view")}
                                  />
                                </td>
                                <td className="text-center">
                                  <Form.Check
                                    type="checkbox"
                                    checked={flags.edit}
                                    onChange={() => toggleFlag(mod.key, "edit")}
                                  />
                                </td>
                                <td className="text-center">
                                  <Form.Check
                                    type="checkbox"
                                    checked={flags.delete}
                                    onChange={() => toggleFlag(mod.key, "delete")}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}

                <div className="d-flex justify-content-between align-items-center mt-4">
                  <div>
                    {selectedRole && !selectedRole.is_system && (
                      <Button variant="outline-danger" size="sm" className="d-inline-flex align-items-center gap-1" onClick={handleDelete}>
                        <IconTrash size={15} /> Delete Role
                      </Button>
                    )}
                  </div>
                  <div className="d-flex gap-2">
                    <Button variant="outline-secondary" onClick={closeEditor} disabled={isSaving}>
                      Cancel
                    </Button>
                    <Button variant="primary" className="d-inline-flex align-items-center gap-2 fw-semibold" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? <Spinner size="sm" /> : <IconCheck size={16} />}
                      {selectedRole ? "Save Changes" : "Create Role"}
                    </Button>
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
