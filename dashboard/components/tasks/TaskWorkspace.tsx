"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import {
  IconAlertTriangle, IconCalendarDue, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp,
  IconCircleCheck, IconClock, IconDotsVertical, IconFolderPlus, IconListTree, IconPaperclip, IconPlus,
  IconRefresh, IconSearch, IconSettings, IconTarget, IconTrash, IconX,
} from "@tabler/icons-react";
import { Badge, Button, Card, Col, Dropdown, Form, InputGroup, Modal, Pagination, ProgressBar, Row, Spinner, Table, Tooltip, OverlayTrigger } from "react-bootstrap";
import { getAssetPath } from "helper/assetPath";

type Status = "PENDING" | "TODO" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CLOSED" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
type DashboardTaskFilter = "open" | "active" | "overdue" | "due-soon" | "on-hold" | "high-priority";

type Project = { id: string; name: string; key: string; description: string; status: ProjectStatus; status_label: string; owner: string | null; owner_name: string | null; created_by_name: string | null; created_by_role: string | null; department: string; start_date: string | null; due_date: string | null; color: string; task_count: number; completed_task_count: number; progress: number };
type Task = { id: string; title: string; description: string; project: string | null; project_name: string | null; project_key: string | null; parent: string | null; parent_title: string | null; subtask_count: number; assignee: string; assignees: string[]; assignee_name: string; assignee_names: string[]; assignee_avatar_url: string | null; assigned_by_name: string | null; priority: Priority; priority_label: string; status: Status; status_label: string; due_date: string | null; start_date: string | null; department: string; project_category: string; attachment_url: string | null; attachment_name: string | null; employee_notes: string; admin_notes: string; is_overdue: boolean };
type Employee = { id: string; employee_id: string; full_name: string; department: string; status: string; profile_photo_url: string | null };

type ProjectForm = { name: string; key: string; description: string; status: ProjectStatus; owner: string; department: string; start_date: string; due_date: string; color: string };
type TaskForm = { title: string; description: string; project: string; parent: string; assignees: string[]; priority: Priority; status: Status; start_date: string; due_date: string; department: string; project_category: string; admin_notes: string; attachment: File | null };

const apiRoot = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/api/v1`;
const projectsApi = `${apiRoot}/tasks/projects/`;
const emptyProject: ProjectForm = { name: "", key: "", description: "", status: "ACTIVE", owner: "", department: "", start_date: "", due_date: "", color: "#4f46e5" };
const emptyTask: TaskForm = { title: "", description: "", project: "", parent: "", assignees: [], priority: "MEDIUM", status: "TODO", start_date: "", due_date: "", department: "", project_category: "", admin_notes: "", attachment: null };
const taskStatuses: Array<{ value: Status; label: string }> = [{ value: "PENDING", label: "Pending" }, { value: "TODO", label: "To do" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "ON_HOLD", label: "On hold" }, { value: "COMPLETED", label: "Completed" }, { value: "CLOSED", label: "Closed" }, { value: "CANCELLED", label: "Cancelled" }];
const taskPriorities: Array<{ value: Priority; label: string }> = [{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }];
const TASKS_PER_PAGE = 10;
const ASSIGNABLE_EMPLOYEE_STATUSES = new Set(["ACTIVE", "PROVISION", "ON_LEAVE", "NOTICE_PERIOD"]);
const dashboardTaskFilterLabels: Record<DashboardTaskFilter, string> = { open: "Open tasks", active: "Active", overdue: "Overdue", "due-soon": "Due soon", "on-hold": "On hold", "high-priority": "High priority" };

const headers = (): Record<string, string> => {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const list = <T,>(payload: T[] | { results?: T[] }) => Array.isArray(payload) ? payload : payload.results || [];
const errorFrom = async (response: Response) => {
  const data = await response.json().catch(() => null);
  if (typeof data?.detail === "string") return data.detail;
  if (data && typeof data === "object") return Object.values(data).flat().join(" ");
  return "The request could not be completed.";
};
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "No date";
const activeStatus = (status: Status) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(status);
const statusClass = (status: string) => `workspace-status workspace-${status.toLowerCase().replace("_", "-")}`;
const daysUntilTask = (value: string | null) => { if (!value) return null; const today = new Date(); today.setHours(0, 0, 0, 0); const taskDate = new Date(value); taskDate.setHours(0, 0, 0, 0); return Math.ceil((taskDate.getTime() - today.getTime()) / 86400000); };
const collectSubtasks = (parentId: string, groups: Record<string, Task[]>, level = 1): Array<{ task: Task; level: number }> => (groups[parentId] || []).flatMap((task) => [{ task, level }, ...collectSubtasks(task.id, groups, level + 1)]);
const colorTint = (hex: string, opacity = 0.1) => {
  const value = hex.replace("#", "");
  const fullHex = value.length === 3 ? value.split("").map((item) => item + item).join("") : value;
  const number = Number.parseInt(fullHex, 16);
  if (Number.isNaN(number)) return `rgba(79, 70, 229, ${opacity})`;
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${opacity})`;
};
const isoDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const toDate = (value: string) => value ? new Date(`${value}T00:00:00`) : new Date();
const addDays = (days: number) => { const value = new Date(); value.setDate(value.getDate() + days); return value; };

function EmployeeAssigneePicker({
  employees,
  selectedIds,
  isOpen,
  onToggle,
  onChange,
}: {
  employees: Employee[];
  selectedIds: string[];
  isOpen: boolean;
  onToggle: () => void;
  onChange: (ids: string[]) => void;
}) {
  const selectedEmployees = selectedIds.map((id) => employees.find((employee) => employee.id === id)).filter(Boolean) as Employee[];
  const availableEmployees = employees.filter((employee) => !selectedIds.includes(employee.id));

  return (
    <Form.Group>
      <Form.Label>Assignees</Form.Label>
      <div className="task-assignee-picker">
        {selectedEmployees.map((employee) => (
          <span className="task-assignee-chip" key={employee.id}>
            <img className="task-assignee-chip-avatar" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} src={employee.profile_photo_url || getAssetPath("/images/avatar/avatar-fallback.jpg")} alt="" />
            <span className="task-assignee-chip-copy" style={{ display: "grid", lineHeight: 1.15 }}><strong>{employee.full_name}</strong><small>{employee.employee_id}</small></span>
            <button type="button" aria-label={`Remove ${employee.full_name}`} onClick={() => onChange(selectedIds.filter((id) => id !== employee.id))}><IconX size={14} /></button>
          </span>
        ))}
        {selectedIds.length > 0 && <Button type="button" size="sm" variant="outline-primary" className="task-add-assignee" disabled={selectedIds.length === employees.length} onClick={onToggle}><IconPlus size={15} /> Add assignee</Button>}
      </div>
      {selectedIds.length === 0 || isOpen ? (
        <div className="task-assignee-options mt-2" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #dbe4ef", borderRadius: 8, background: "#fff" }}>
          {availableEmployees.map((employee) => (
            <button key={employee.id} type="button" className="task-assignee-option" style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", border: 0, borderBottom: "1px solid #eef2f7", padding: 10, background: "#fff", textAlign: "left" }} onClick={() => { onChange([...selectedIds, employee.id]); onToggle(); }}>
              <img style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} src={employee.profile_photo_url || getAssetPath("/images/avatar/avatar-fallback.jpg")} alt="" />
              <span style={{ display: "grid", lineHeight: 1.25 }}><strong>{employee.full_name}</strong><small>{employee.employee_id} · {employee.department || "No department"}</small></span>
            </button>
          ))}
          {!availableEmployees.length && <small className="text-secondary d-block p-2">{employees.length ? "All active employees are assigned." : "No active employees are available."}</small>}
        </div>
      ) : null}
      <Form.Text>{employees.length ? "Assign employees from any department in your organization." : "Add an eligible employee before assigning this task."}</Form.Text>
    </Form.Group>
  );
}

export default function TaskWorkspace({ employeeMode = false }: { employeeMode?: boolean }) {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("IN_PROGRESS");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL");
  const [dashboardFilter, setDashboardFilter] = useState<DashboardTaskFilter | null>(null);
  const [showProjects, setShowProjects] = useState(true);
  const [taskPage, setTaskPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [projectModal, setProjectModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [progressModal, setProgressModal] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProject);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTask);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [progressStatus, setProgressStatus] = useState<Status>("TODO");
  const [progressPriority, setProgressPriority] = useState<Priority>("MEDIUM");
  const [progressNote, setProgressNote] = useState("");
  const [currentUserName, setCurrentUserName] = useState("Current user");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [datePlannerTarget, setDatePlannerTarget] = useState<"start_date" | "due_date" | null>(null);
  const [datePlannerMonth, setDatePlannerMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const isFormerEmployee = employeeMode && Boolean(currentEmployee && ["INACTIVE", "TERMINATED"].includes(currentEmployee.status));
  const workActionsDisabled = employeeMode && (!currentEmployee || isFormerEmployee);

  useEffect(() => {
    if (!error) return;
    void Swal.fire({
      icon: "error",
      title: "Action unavailable",
      text: error,
      confirmButtonText: "Okay",
    });
    setError("");
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    void Swal.fire({
      icon: "success",
      title: "Done",
      text: notice,
      timer: 2200,
      timerProgressBar: true,
      showConfirmButton: false,
    });
    setNotice("");
  }, [notice]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null") as { full_name?: string; email?: string; role?: string } | null;
      setCurrentUserName(user?.full_name || user?.email || "Current user");
      setCurrentUserRole(user?.role === "SUPER_ADMIN" ? "Admin" : user?.role === "HR" ? "HR" : user?.role === "EMPLOYEE" ? "Employee" : user?.role || "");
    } catch {
      setCurrentUserName("Current user");
      setCurrentUserRole("");
    }
  }, []);

  useEffect(() => {
    if (progressModal) setProgressPriority(progressModal.priority);
  }, [progressModal]);

  useEffect(() => {
    if (!employeeMode) return;
    document.body.classList.add("employee-task-workspace");
    return () => document.body.classList.remove("employee-task-workspace");
  }, [employeeMode]);

  useEffect(() => {
    if (!employeeMode) return;
    const fetchCurrentEmployee = async () => {
      try {
        const response = await fetch(`${apiRoot}/employees/me/`, { headers: headers() });
        if (!response.ok) return;
        const employee = await response.json() as Employee;
        setCurrentEmployee(employee);
      } catch {
        setCurrentEmployee(null);
      }
    };
    void fetchCurrentEmployee();
  }, [employeeMode]);

  useEffect(() => {
    setTaskPage(1);
  }, [query, projectFilter, statusFilter, priorityFilter, dashboardFilter]);

  useEffect(() => {
    const value = searchParams.get("task_filter");
    const requestedStatus = searchParams.get("status")?.toUpperCase();
    const validStatuses = taskStatuses.map((item) => item.value) as string[];
    const validFilters: DashboardTaskFilter[] = ["open", "active", "overdue", "due-soon", "on-hold", "high-priority"];
    if (!value || !validFilters.includes(value as DashboardTaskFilter)) {
      setDashboardFilter(null);
      setStatusFilter(requestedStatus && validStatuses.includes(requestedStatus) ? requestedStatus as Status : "IN_PROGRESS");
      return;
    }
    const filter = value as DashboardTaskFilter;
    setDashboardFilter(filter);
    setQuery("");
    setProjectFilter("ALL");
    setPriorityFilter("ALL");
    setStatusFilter(filter === "active" ? "IN_PROGRESS" : filter === "on-hold" ? "ON_HOLD" : "ALL");
    setTaskPage(1);
    window.setTimeout(() => {
      document.getElementById("workspace-task-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [searchParams]);

  useEffect(() => {
    if (!taskModal) return;
    const openPlanner = (event: MouseEvent) => {
      const input = event.target as HTMLInputElement;
      const taskTitleInput = document.querySelector<HTMLInputElement>('.modal input[placeholder="Describe the work clearly"]');
      const taskDialog = taskTitleInput?.closest(".modal");
      if (!taskDialog || !taskDialog.contains(input) || input.type !== "date") return;
      event.preventDefault();
      const dates = Array.from(taskDialog.querySelectorAll<HTMLInputElement>('input[type="date"]'));
      const target = dates.indexOf(input) === 0 ? "start_date" : "due_date";
      setDatePlannerTarget(target);
      setDatePlannerMonth(new Date(toDate(taskForm[target]).getFullYear(), toDate(taskForm[target]).getMonth(), 1));
    };
    document.addEventListener("mousedown", openPlanner, true);
    return () => document.removeEventListener("mousedown", openPlanner, true);
  }, [taskModal, taskForm.start_date, taskForm.due_date]);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const requests = [fetch(`${projectsApi}?page_size=100`, { headers: headers() }), fetch(`${apiRoot}/tasks/?page_size=500`, { headers: headers() }), fetch(`${apiRoot}/employees/?page_size=100`, { headers: headers() })];
      const responses = await Promise.all(requests);
      if (!responses[1].ok) throw new Error(await errorFrom(responses[1]));
      if (responses[0].ok) {
        setProjects(list<Project>(await responses[0].json()));
      } else {
        setProjects([]);
        setError("Projects could not be loaded, but your assigned tasks are still available.");
      }
      setTasks(list<Task>(await responses[1].json()));
      if (responses[2]?.ok) {
        setEmployees(
          list<Employee>(await responses[2].json()).filter((item) =>
            ASSIGNABLE_EMPLOYEE_STATUSES.has(item.status)
          )
        );
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the workspace."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const metrics = useMemo(() => ({
    projects: projects.filter((item) => item.status !== "ARCHIVED").length,
    active: tasks.filter((item) => activeStatus(item.status)).length,
    overdue: tasks.filter((item) => item.is_overdue).length,
    completed: tasks.filter((item) => ["COMPLETED", "CLOSED"].includes(item.status)).length,
  }), [projects, tasks]);
  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const directlyMatching = tasks.filter((item) => {
      const dueInDays = daysUntilTask(item.due_date);
      const matchesDashboardFilter =
        !dashboardFilter ||
        (dashboardFilter === "open" && activeStatus(item.status)) ||
        (dashboardFilter === "active" && item.status === "IN_PROGRESS") ||
        (dashboardFilter === "overdue" && item.is_overdue) ||
        (dashboardFilter === "due-soon" && dueInDays !== null && dueInDays >= 0 && dueInDays <= 3 && activeStatus(item.status)) ||
        (dashboardFilter === "on-hold" && item.status === "ON_HOLD") ||
        (dashboardFilter === "high-priority" && ["URGENT", "HIGH"].includes(item.priority) && activeStatus(item.status));
      return matchesDashboardFilter && (projectFilter === "ALL" || item.project === projectFilter) && (statusFilter === "ALL" || item.status === statusFilter) && (priorityFilter === "ALL" || item.priority === priorityFilter) && (!needle || [item.title, item.description, item.assignee_name, item.assignee_names?.join(" "), item.project_name, item.project_key].filter(Boolean).some((value) => value!.toLowerCase().includes(needle)));
    });
    const visibleIds = new Set(directlyMatching.map((item) => item.id));
    const tasksById = new Map(tasks.map((item) => [item.id, item]));
    directlyMatching.forEach((item) => {
      let parentId = item.parent;
      while (parentId) {
        visibleIds.add(parentId);
        parentId = tasksById.get(parentId)?.parent || null;
      }
    });
    return tasks.filter((item) => visibleIds.has(item.id));
  }, [tasks, query, projectFilter, statusFilter, priorityFilter, dashboardFilter]);
  const allRootTasks = visibleTasks.filter((item) => !item.parent);
  const totalTaskPages = Math.max(1, Math.ceil(allRootTasks.length / TASKS_PER_PAGE));
  const currentTaskPage = Math.min(taskPage, totalTaskPages);
  const rootTasks = allRootTasks.slice((currentTaskPage - 1) * TASKS_PER_PAGE, currentTaskPage * TASKS_PER_PAGE);
  const pageNumbers = Array.from({ length: totalTaskPages }, (_, index) => index + 1);
  const allSubtasksByParent = useMemo(() => visibleTasks.filter((item) => item.parent).reduce<Record<string, Task[]>>((groups, item) => { if (item.parent) (groups[item.parent] ||= []).push(item); return groups; }, {}), [visibleTasks]);
  const detailSubtasks = useMemo(() => detailTask ? collectSubtasks(detailTask.id, allSubtasksByParent) : [], [detailTask, allSubtasksByParent]);
  const projectColors = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project.color])), [projects]);

  const openProject = (project?: Project) => {
    if (workActionsDisabled) return;
    setEditingProject(project || null);
    setProjectForm(project ? { name: project.name, key: project.key, description: project.description || "", status: project.status, owner: project.owner || "", department: project.department || "", start_date: project.start_date || "", due_date: project.due_date || "", color: project.color || "#4f46e5" } : emptyProject);
    setProjectModal(true);
  };
  const resetFilters = () => {
    setQuery("");
    setProjectFilter("ALL");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setDashboardFilter(null);
    setTaskPage(1);
  };
  const selectProject = (projectId: string) => {
    setProjectFilter(projectId);
    setTaskPage(1);
    window.setTimeout(() => {
      document.getElementById("workspace-task-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const openTask = (task?: Task, parent?: Task) => {
    if (workActionsDisabled) return;
    setEditingTask(task || null);
    setAssigneePickerOpen(false);
    setTaskForm(task ? { title: task.title, description: task.description || "", project: task.project || "", parent: task.parent || "", assignees: task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : [], priority: task.priority, status: task.status, start_date: task.start_date || "", due_date: task.due_date || "", department: task.department || "", project_category: task.project_category || "", admin_notes: task.admin_notes || "", attachment: null } : { ...emptyTask, project: parent?.project || (projectFilter === "ALL" ? "" : projectFilter), parent: parent?.id || "", assignees: employeeMode && currentEmployee ? [currentEmployee.id] : [], department: parent?.department || "" });
    setTaskModal(true);
  };
  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(editingProject ? `${projectsApi}${editingProject.id}/` : projectsApi, { method: editingProject ? "PATCH" : "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ ...projectForm, owner: employeeMode ? undefined : projectForm.owner || null, start_date: projectForm.start_date || null, due_date: projectForm.due_date || null }) });
      if (!response.ok) throw new Error(await errorFrom(response));
      setProjectModal(false); setNotice(editingProject ? "Project updated." : "Project created. You can now add tasks to it."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save project."); } finally { setSaving(false); }
  };
  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = new FormData();
      Object.entries(taskForm).forEach(([key, value]) => { if (key !== "attachment" && key !== "assignees" && typeof value === "string" && value) payload.append(key, value); });
      payload.set("project", taskForm.project); payload.set("status", taskForm.status); payload.set("priority", taskForm.priority);
      if (!taskForm.assignees.length) throw new Error("Assign at least one employee.");
      payload.set("assignee", taskForm.assignees[0]);
      taskForm.assignees.forEach((assignee) => payload.append("assignees", assignee));
      if (taskForm.attachment) payload.append("attachment", taskForm.attachment);
      const response = await fetch(editingTask ? `${apiRoot}/tasks/${editingTask.id}/` : `${apiRoot}/tasks/`, { method: editingTask ? "PATCH" : "POST", headers: headers(), body: payload });
      if (!response.ok) throw new Error(await errorFrom(response));
      const savedTask = await response.json() as Task;
      setTasks((current) => {
        const withoutSavedTask = current.filter((task) => task.id !== savedTask.id);
        return [savedTask, ...withoutSavedTask];
      });
      setQuery("");
      setDashboardFilter(null);
      setProjectFilter(savedTask.project || taskForm.project || "ALL");
      setStatusFilter(savedTask.status);
      setPriorityFilter("ALL");
      setTaskPage(1);
      setTaskModal(false);
      setNotice(editingTask ? "Task updated." : taskForm.parent ? "Subtask added." : "Task added to the project.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save task."); } finally { setSaving(false); }
  };
  const deleteProject = async (project: Project) => {
    if (workActionsDisabled) return;
    const taskWarning = project.task_count ? ` This will also permanently delete its ${project.task_count} task${project.task_count === 1 ? "" : "s"}.` : "";
    const result = await Swal.fire({ icon: "warning", title: "Delete this project?", text: `“${project.name}” cannot be restored after deletion.${taskWarning}`, showCancelButton: true, confirmButtonText: "Delete project", confirmButtonColor: "#dc3545" });
    if (!result.isConfirmed) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${projectsApi}${project.id}/`, { method: "DELETE", headers: headers() });
      if (!response.ok) throw new Error(await errorFrom(response));
      if (projectFilter === project.id) setProjectFilter("ALL");
      setDetailTask(null); setNotice("Project deleted."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete project."); } finally { setSaving(false); }
  };
  const deleteTask = async (task: Task) => {
    if (workActionsDisabled) return;
    const subtaskWarning = task.subtask_count ? ` This will also permanently delete its ${task.subtask_count} subtask${task.subtask_count === 1 ? "" : "s"}.` : "";
    const result = await Swal.fire({ icon: "warning", title: "Delete this task?", text: `“${task.title}” cannot be restored after deletion.${subtaskWarning}`, showCancelButton: true, confirmButtonText: "Delete task", confirmButtonColor: "#dc3545" });
    if (!result.isConfirmed) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${apiRoot}/tasks/${task.id}/`, { method: "DELETE", headers: headers() });
      if (!response.ok) throw new Error(await errorFrom(response));
      if (detailTask?.id === task.id) setDetailTask(null);
      setNotice("Task deleted."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete task."); } finally { setSaving(false); }
  };
  const openProgress = (task: Task) => {
    if (workActionsDisabled) return;
    setProgressModal(task);
    setProgressStatus(task.status === "CANCELLED" ? "TODO" : task.status);
    setProgressPriority(task.priority);
    setProgressNote(task.employee_notes || "");
  };

  const saveProgress = async (event: React.FormEvent) => {
    event.preventDefault(); if (!progressModal) return; setSaving(true); setError("");
    try {
      const response = await fetch(`${apiRoot}/tasks/${progressModal.id}/status/`, { method: "PATCH", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ status: progressStatus, priority: progressPriority, employee_notes: progressNote }) });
      if (!response.ok) throw new Error(await errorFrom(response));
      const updatedTask = await response.json() as Task;
      setTasks((currentTasks) => currentTasks.map((task) => task.id === updatedTask.id ? updatedTask : task));
      setDetailTask((currentTask) => currentTask?.id === updatedTask.id ? updatedTask : currentTask);
      setProgressModal(null);
      setNotice("Progress updated.");
      void load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update progress."); } finally { setSaving(false); }
  };

  return <div className="container-fluid px-0 py-4 task-workspace">
    <div className="workspace-hero mb-4">
      <div><div className="workspace-eyebrow"><IconTarget size={16} /> WORKSPACE</div><h2>{employeeMode ? "My work" : "Project workspace"}</h2><p>{employeeMode ? "Create, organize, and deliver your work in shared projects." : "Plan projects, delegate work, and keep every delivery visible."}</p></div>
      <div className="d-flex flex-wrap gap-2"><Button variant="outline-primary" onClick={() => openProject()} disabled={workActionsDisabled}><IconFolderPlus size={17} /> New project</Button><Button variant="primary" onClick={() => openTask()} disabled={!projects.length || workActionsDisabled}><IconPlus size={18} /> New task</Button></div>
    </div>
    {isFormerEmployee && <div className="alert alert-secondary border-0 shadow-sm mb-4"><strong>Task actions disabled:</strong> Your employment status is {currentEmployee?.status === "INACTIVE" ? "Inactive" : "Terminated"}. You can review existing projects and tasks, but you cannot create, edit, delete, or update work. Contact HR if this status needs correction.</div>}
    <Row className="g-3 mb-4">
      {[["Projects", metrics.projects, <IconTarget key="i" />], ["Open work", metrics.active, <IconClock key="i" />], ["Overdue", metrics.overdue, <IconAlertTriangle key="i" />], ["Completed", metrics.completed, <IconCircleCheck key="i" />]].map(([label, value, icon]) => <Col key={String(label)} xs={6} md={3}><Card className="border-0 shadow-sm workspace-metric"><Card.Body><span>{icon as React.ReactNode}</span><div><small>{label}</small><strong>{String(value)}</strong></div></Card.Body></Card></Col>)}
    </Row>
    {loading ? <div className="text-center py-5"><Spinner animation="border" /><p className="text-secondary mt-2">Loading project workspace…</p></div> : <>
      <div className="workspace-projects-header mb-3"><div><h5 className="fw-bold mb-0">Projects</h5><small className="text-secondary">Select a project to focus its task list.</small></div><div className="d-flex align-items-center gap-2"><Badge bg="light" text="dark" className="border">{projects.length} total</Badge><Button size="sm" variant="outline-secondary" className="workspace-projects-toggle" onClick={() => setShowProjects((visible) => !visible)} aria-expanded={showProjects}>{showProjects ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}{showProjects ? "Hide projects" : "Show projects"}</Button></div></div>
      {showProjects && <div className="workspace-projects mb-4">{projects.map((project) => <Card key={project.id} onClick={() => selectProject(project.id)} className={`border-0 shadow-sm workspace-project ${projectFilter === project.id ? "is-selected" : ""}`} style={{ "--project-color": project.color, "--project-tint": colorTint(project.color, 0.22) } as React.CSSProperties} role="button" tabIndex={0} aria-pressed={projectFilter === project.id} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectProject(project.id); } }}><Card.Body>{projectFilter === project.id && <span className="project-selected"><IconCheck size={13} /> Selected</span>}<div className="d-flex justify-content-between gap-2"><div><span className="project-key" style={{ color: project.color }}>{project.key}</span><h6>{project.name}</h6></div><div className="d-flex gap-1"><Button size="sm" variant="link" className="project-action-button" title="Edit project" aria-label={`Edit ${project.name}`} onClick={(e) => { e.stopPropagation(); openProject(project); }}><IconSettings size={16} /></Button><Button size="sm" variant="link" className="project-action-button text-danger" title="Delete project" aria-label={`Delete ${project.name}`} disabled={saving} onClick={(e) => { e.stopPropagation(); void deleteProject(project); }}><IconTrash size={16} /></Button></div></div><p>{project.description || "No project description yet."}</p><div className="d-flex justify-content-between small text-secondary mb-1"><span>{project.completed_task_count}/{project.task_count} complete</span><span>{project.progress}%</span></div><ProgressBar now={project.progress} style={{ "--bs-progress-bar-bg": project.color } as React.CSSProperties} /><div className="project-footer"><Badge className={statusClass(project.status)}>{project.status_label}</Badge><span>{project.due_date ? `Due ${date(project.due_date)}` : "No deadline"}</span></div></Card.Body></Card>)}{projects.length === 0 && <Card className="border-dashed"><Card.Body className="text-center py-4"><IconFolderPlus size={30} className="text-primary mb-2" /><h6>No projects yet</h6><p className="text-secondary small mb-3">Start with a project, then break the work into tasks.</p><Button size="sm" onClick={() => openProject()}>Create first project</Button></Card.Body></Card>}</div>}
      <Card id="workspace-task-list" className="border-0 shadow-sm workspace-task-list">
        <Card.Header className="bg-white border-0 pt-4 px-4 d-flex justify-content-between align-items-center task-list-header">
          <div>
            <h5 className="fw-bold mb-1">Task list</h5>
            <small className="text-secondary">Click the subtask count to view nested subtasks, or click a row for details.</small>
          </div>
          <Button size="sm" onClick={() => openTask()} disabled={!projects.length || workActionsDisabled}><IconPlus size={16} /> Add task</Button>
        </Card.Header>
        <Card.Body className="task-list-filters border-top">
          {dashboardFilter && <div className="dashboard-filter-chip mb-3"><span>Dashboard filter</span><strong>{dashboardTaskFilterLabels[dashboardFilter]}</strong><button type="button" onClick={resetFilters} aria-label="Clear dashboard filter"><IconX size={14} /></button></div>}
          <Row className="g-3">
            <Col lg={3}>
              <InputGroup>
                <InputGroup.Text className="bg-white"><IconSearch size={18} /></InputGroup.Text>
                <Form.Control value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks or people" />
              </InputGroup>
            </Col>
            <Col md={4} lg={3}>
              <Form.Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="ALL">All projects</option>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.key} · {project.name}</option>)}
              </Form.Select>
            </Col>
            <Col md={4} lg={2}>
              <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "ALL")}>
                <option value="ALL">All statuses</option>
                {taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Form.Select>
            </Col>
            <Col md={4} lg={2}>
              <Form.Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | "ALL")}>
                <option value="ALL">All priorities</option>
                {taskPriorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Form.Select>
            </Col>
            <Col lg={2} className="d-grid">
              <Button variant="outline-secondary" onClick={resetFilters} className="d-inline-flex align-items-center justify-content-center gap-2"><IconRefresh size={16} /> Reset filters</Button>
            </Col>
          </Row>
        </Card.Body>
        <Card.Body className="p-0">
          {rootTasks.length ? (
            <div className="table-responsive task-list-table-wrap">
              <Table hover className="align-middle mb-0 workspace-task-table">
                <thead className="table-light">
                  <tr className="small text-secondary text-uppercase">
                    <th className="px-4 py-3" style={{ width: "6%", minWidth: "60px" }}>Sr. no.</th>
                    <th className="py-3" style={{ width: employeeMode ? "42%" : "30%", minWidth: "220px" }}>Task</th>
                    {!employeeMode && <th className="py-3" style={{ width: "20%", minWidth: "160px" }}>Assigned to</th>}
                    <th className="py-3" style={{ width: "12%", minWidth: "100px" }}>Subtasks</th>
                    <th className="py-3" style={{ width: "18%", minWidth: "150px" }}>Priority &amp; status</th>
                    <th className="px-4 py-3 text-end" style={{ width: "14%", minWidth: "140px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rootTasks.map((task, index) => <TaskTableRowsWithSubtasks key={task.id} task={task} index={(currentTaskPage - 1) * TASKS_PER_PAGE + index + 1} subtasksByParent={allSubtasksByParent} expanded={Boolean(expanded[task.id])} projectColors={projectColors} employeeMode={employeeMode} workActionsDisabled={workActionsDisabled} onToggleSubtasks={(taskId) => setExpanded((current) => ({ ...current, [taskId]: !current[taskId] }))} onOpenDetail={setDetailTask} onOpenProgress={openProgress} />)}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-5"><IconListTree size={36} className="text-muted mb-2" /><h6>No tasks in this view</h6><p className="text-secondary small">Create a task or adjust the filters.</p></div>
          )}
        </Card.Body>
      </Card>
      {allRootTasks.length > TASKS_PER_PAGE && (
        <div className="task-list-pagination">
          <span>Showing {(currentTaskPage - 1) * TASKS_PER_PAGE + 1}–{Math.min(currentTaskPage * TASKS_PER_PAGE, allRootTasks.length)} of {allRootTasks.length} tasks</span>
          <Pagination size="sm" className="mb-0">
            <Pagination.Prev onClick={() => setTaskPage((page) => Math.max(1, page - 1))} disabled={currentTaskPage === 1} />
            {pageNumbers.map((page) => (
              <Pagination.Item key={page} active={page === currentTaskPage} onClick={() => setTaskPage(page)}>
                {page}
              </Pagination.Item>
            ))}
            <Pagination.Next onClick={() => setTaskPage((page) => Math.min(totalTaskPages, page + 1))} disabled={currentTaskPage === totalTaskPages} />
          </Pagination>
        </div>
      )}
    </>}
    <Modal show={Boolean(detailTask)} onHide={() => setDetailTask(null)} centered size="lg"><Modal.Header closeButton><Modal.Title>Task details</Modal.Title></Modal.Header><Modal.Body>{detailTask && <><div className="task-detail-hero mb-4"><div><div className="d-flex align-items-center gap-2 flex-wrap"><h5 className="fw-bold mb-1">{detailTask.title}</h5><Badge className={`task-priority priority-${detailTask.priority.toLowerCase()}`}>{detailTask.priority_label}</Badge><Badge className={statusClass(detailTask.status)}>{detailTask.is_overdue ? "Overdue" : detailTask.status_label}</Badge></div><p className="text-secondary mb-0">{detailTask.description || "No description provided."}</p></div></div><div className="task-detail-grid mb-4"><div className="task-detail-field"><span>Project</span><strong>{detailTask.project_key ? `${detailTask.project_key} · ${detailTask.project_name}` : "No project"}</strong></div><div className="task-detail-field"><span>Assigned to</span><strong>{detailTask.assignee_names?.length ? detailTask.assignee_names.join(", ") : detailTask.assignee_name || "Unassigned"}</strong><small>{detailTask.department || "No department"}</small></div><div className="task-detail-field"><span>Timeline</span><strong>{detailTask.start_date ? `Start: ${date(detailTask.start_date)}` : "No start date"}</strong><small>Due: {date(detailTask.due_date)}</small></div><div className="task-detail-field"><span>Created by</span><strong>{detailTask.assigned_by_name || "Workspace member"}</strong></div><div className="task-detail-field"><span>Category</span><strong>{detailTask.project_category || "General"}</strong></div><div className="task-detail-field"><span>Subtasks</span><strong>{detailSubtasks.length} total</strong></div></div>{detailTask.admin_notes && <div className="task-detail-section mb-3"><span>Manager note</span><p>{detailTask.admin_notes}</p></div>}{detailTask.employee_notes && <div className="task-detail-section mb-3"><span >Latest progress update</span><p>{detailTask.employee_notes}</p></div>}{detailTask.attachment_url && <a href={detailTask.attachment_url} target="_blank" rel="noopener noreferrer" className="d-inline-flex align-items-center gap-2 mb-4 text-decoration-none"><IconPaperclip size={16} /> {detailTask.attachment_name || "Open attachment"}</a>}<div className="subtask-detail-list"><div className="d-flex align-items-center justify-content-between mb-2"><h6 className="fw-bold mb-0">Subtasks</h6><Badge bg="light" text="dark" className="border">{detailSubtasks.length}</Badge></div>{detailSubtasks.length ? detailSubtasks.map(({ task, level }) => <div key={task.id} className="subtask-detail-item" style={{ marginLeft: `${Math.min(level - 1, 4) * 18}px` }}><IconListTree size={15} /><div><strong>{task.title}</strong><span>{task.description || "No description"}</span></div><Badge className={statusClass(task.status)}>{task.status_label}</Badge></div>) : <p className="text-secondary small mb-0">No subtasks have been added yet.</p>}</div></>}</Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setDetailTask(null)}>Close</Button>{detailTask && <Button variant="outline-danger" onClick={() => void deleteTask(detailTask)}><IconTrash size={16} /> Delete</Button>}{detailTask && <Button variant="outline-primary" onClick={() => { const task = detailTask; setDetailTask(null); openTask(task); }}>Edit task</Button>}{detailTask && <Button variant="outline-primary" disabled={detailTask.status === "CANCELLED"} onClick={() => { const task = detailTask; setDetailTask(null); openProgress(task); }}>Update progress</Button>}<Button onClick={() => { const task = detailTask; setDetailTask(null); if (task) openTask(undefined, task); }}><IconPlus size={16} /> Add subtask</Button></Modal.Footer></Modal>
    <Modal show={projectModal} onHide={() => !saving && setProjectModal(false)} centered size="lg"><Form onSubmit={saveProject}><Modal.Header closeButton><Modal.Title>{editingProject ? "Edit project" : "Create project"}</Modal.Title></Modal.Header><Modal.Body><Row className="g-3"><Col md={8}><Form.Group><Form.Label>Project name</Form.Label><Form.Control required minLength={3} value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="Website redesign" /></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Project key</Form.Label><Form.Control required maxLength={12} value={projectForm.key} onChange={(e) => setProjectForm({ ...projectForm, key: e.target.value.toUpperCase().replace(/\s+/g, "-") })} placeholder="WEB" /></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Description</Form.Label><Form.Control as="textarea" rows={3} value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="What outcome will this project deliver?" /></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Status</Form.Label><Form.Select value={projectForm.status} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as ProjectStatus })}>{["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</Form.Select></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Created by</Form.Label><Form.Control value={editingProject?.created_by_name ? `${editingProject.created_by_role ? `${editingProject.created_by_role} — ` : ""}${editingProject.created_by_name}` : `${currentUserRole ? `${currentUserRole} — ` : ""}${currentUserName}`} readOnly /></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Department</Form.Label><Form.Control value={projectForm.department} onChange={(e) => setProjectForm({ ...projectForm, department: e.target.value })} placeholder="Engineering" /></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Start date</Form.Label><Form.Control type="date" value={projectForm.start_date} onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })} /></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Target date</Form.Label><Form.Control type="date" value={projectForm.due_date} onChange={(e) => setProjectForm({ ...projectForm, due_date: e.target.value })} /></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Accent color</Form.Label><Form.Control type="color" value={projectForm.color} onChange={(e) => setProjectForm({ ...projectForm, color: e.target.value })} /></Form.Group></Col></Row></Modal.Body><Modal.Footer><Button variant="light" onClick={() => setProjectModal(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingProject ? "Save changes" : "Create project"}</Button></Modal.Footer></Form></Modal>
    <Modal show={taskModal} onHide={() => !saving && setTaskModal(false)} centered size="lg"><Form onSubmit={saveTask}><Modal.Header closeButton><Modal.Title>{editingTask ? "Edit task" : taskForm.parent ? "Add subtask" : "Add task"}</Modal.Title></Modal.Header><Modal.Body><Row className="g-3"><Col xs={12}><Form.Group><Form.Label>Task title</Form.Label><Form.Control required minLength={3} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Describe the work clearly" /></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Description</Form.Label><Form.Control as="textarea" rows={3} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Add context, acceptance criteria, or links." /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Project</Form.Label><Form.Select required disabled={Boolean(taskForm.parent)} value={taskForm.project} onChange={(e) => setTaskForm({ ...taskForm, project: e.target.value })}><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.key} · {project.name}</option>)}</Form.Select></Form.Group></Col><Col md={6}><EmployeeAssigneePicker employees={employees} selectedIds={taskForm.assignees} isOpen={assigneePickerOpen} onToggle={() => setAssigneePickerOpen((open) => !open)} onChange={(assignees) => setTaskForm({ ...taskForm, assignees })} /></Col><Col md={4}><Form.Group><Form.Label>Priority</Form.Label><Form.Select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Priority })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => <option key={value} value={value}>{value}</option>)}</Form.Select></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Status</Form.Label><Form.Select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as Status })}>{taskStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Form.Select></Form.Group></Col><Col md={4}><Form.Group><Form.Label>Category</Form.Label><Form.Control value={taskForm.project_category} onChange={(e) => setTaskForm({ ...taskForm, project_category: e.target.value })} placeholder="Design" /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Start date</Form.Label><Form.Control type="date" value={taskForm.start_date} onChange={(e) => setTaskForm({ ...taskForm, start_date: e.target.value })} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Due date</Form.Label><Form.Control type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} /></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Attachment</Form.Label><Form.Control type="file" onChange={(e) => { const input = e.currentTarget as HTMLInputElement; setTaskForm({ ...taskForm, attachment: input.files?.[0] || null }); }} /><Form.Text>Optional, maximum 10 MB.</Form.Text></Form.Group></Col>{!employeeMode && <Col xs={12}><Form.Group><Form.Label>Manager note</Form.Label><Form.Control as="textarea" rows={2} value={taskForm.admin_notes} onChange={(e) => setTaskForm({ ...taskForm, admin_notes: e.target.value })} /></Form.Group></Col>}</Row></Modal.Body><Modal.Footer><Button variant="light" onClick={() => setTaskModal(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingTask ? "Save changes" : taskForm.parent ? "Add subtask" : "Create task"}</Button></Modal.Footer></Form></Modal>
    <Modal show={Boolean(progressModal)} onHide={() => !saving && setProgressModal(null)} centered><Form onSubmit={saveProgress}><Modal.Header closeButton><Modal.Title>Update task</Modal.Title></Modal.Header><Modal.Body><p className="fw-semibold mb-3">{progressModal?.title}</p><Row className="g-3"><Col md={6}><Form.Group><Form.Label>Priority</Form.Label><Form.Select value={progressPriority} onChange={(e) => setProgressPriority(e.target.value as Priority)}>{taskPriorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Form.Select></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Status</Form.Label><Form.Select value={progressStatus} onChange={(e) => setProgressStatus(e.target.value as Status)}>{taskStatuses.filter((item) => item.value !== "CANCELLED").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Form.Select></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Progress note</Form.Label><Form.Control as="textarea" rows={4} value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="Share progress, blockers, or completion notes." /></Form.Group></Col></Row></Modal.Body><Modal.Footer><Button variant="light" onClick={() => setProgressModal(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Updating…" : "Update task"}</Button></Modal.Footer></Form></Modal>
    <TaskDatePlanner target={datePlannerTarget} month={datePlannerMonth} startDate={taskForm.start_date} dueDate={taskForm.due_date} onClose={() => setDatePlannerTarget(null)} onTargetChange={setDatePlannerTarget} onMonthChange={setDatePlannerMonth} onSelect={(field, value) => { setTaskForm((current) => ({ ...current, [field]: value })); setDatePlannerTarget(null); }} />
    <style suppressHydrationWarning>{styles}{heroStyles}{taskTableStyles}{detailStyles}{tableEnhancements}{projectColorStyles}{projectActionStyles}{paginationStyles}{categoryRemovalStyles}{datePlannerStyles}{responsiveStyles}{isFormerEmployee ? readOnlyStyles : ""}</style>
  </div>;
}

function TaskDatePlanner({ target, month, startDate, dueDate, onClose, onTargetChange, onMonthChange, onSelect }: { target: "start_date" | "due_date" | null; month: Date; startDate: string; dueDate: string; onClose: () => void; onTargetChange: (value: "start_date" | "due_date") => void; onMonthChange: (value: Date) => void; onSelect: (field: "start_date" | "due_date", value: string) => void }) {
  if (!target) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const selected = target === "start_date" ? startDate : dueDate;
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const calendarDays = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - startOffset + 1));
  const quickDates = [
    ["Today", today], ["Tomorrow", addDays(1)], ["This weekend", addDays((6 - today.getDay() + 7) % 7 || 7)], ["Next week", addDays(7)], ["Next weekend", addDays(13)], ["2 weeks", addDays(14)], ["4 weeks", addDays(28)],
  ] as const;
  return <Modal show centered onHide={onClose} dialogClassName="task-date-planner"><Modal.Body className="p-0"><div className="date-planner-tabs"><button type="button" className={target === "start_date" ? "is-active" : ""} onClick={() => onTargetChange("start_date")}><IconCalendarDue size={15} /> Start date</button><button type="button" className={target === "due_date" ? "is-active" : ""} onClick={() => onTargetChange("due_date")}><IconCalendarDue size={15} /> Due date</button></div><div className="date-planner-content"><div className="date-quick-list">{quickDates.map(([label, value]) => <button key={label} type="button" onClick={() => onSelect(target, isoDate(value))}><span>{label}</span><small>{value.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></button>)}</div><div className="date-calendar"><div className="date-calendar-head"><button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><IconChevronLeft size={17} /></button><strong>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</strong><button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><IconChevronRight size={17} /></button></div><div className="date-weekdays">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div><div className="date-grid">{calendarDays.map((day) => { const value = isoDate(day); const isCurrentMonth = day.getMonth() === month.getMonth(); const isToday = value === isoDate(today); return <button key={value} type="button" className={`${!isCurrentMonth ? "is-muted" : ""} ${selected === value ? "is-selected" : ""} ${isToday ? "is-today" : ""}`} onClick={() => onSelect(target, value)}>{day.getDate()}</button>; })}</div></div></div></Modal.Body></Modal>;
}

function TaskTableRowsWithSubtasks({ task, index, subtasksByParent, expanded, projectColors, employeeMode, workActionsDisabled = false, onToggleSubtasks, onOpenDetail, onOpenProgress }: { task: Task; index: number; subtasksByParent: Record<string, Task[]>; expanded: boolean; projectColors: Record<string, string>; employeeMode: boolean; workActionsDisabled?: boolean; onToggleSubtasks: (taskId: string) => void; onOpenDetail: (task: Task) => void; onOpenProgress: (task: Task) => void }) {
  const nestedSubtasks = collectSubtasks(task.id, subtasksByParent);
  const childCount = nestedSubtasks.length || task.subtask_count;
  const countLabel = (count: number) => `${count} subtask${count === 1 ? "" : "s"}`;
  const renderRow = (item: Task, level = 0, number?: string) => {
    const rowChildCount = level ? (collectSubtasks(item.id, subtasksByParent).length || item.subtask_count) : childCount;
    return <tr key={item.id} className={`workspace-task-row ${level ? "is-subtask" : ""}`} onClick={() => onOpenDetail(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenDetail(item); } }}>
      <td className="px-4 py-3 fw-bold text-secondary text-nowrap" data-label="Sr. no.">{number || "-"}</td>
      <td className="py-3" data-label="Task">
        <div className="task-table-title" style={{ paddingLeft: `${Math.min(level, 4) * 18}px` }}>
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            {level > 0 && <IconListTree size={15} className="text-secondary flex-shrink-0" />}
            <span className={`priority-dot priority-${item.priority.toLowerCase()} flex-shrink-0`} />
            <strong className="task-title-clamp" title={item.title}>{item.title}</strong>
            {item.project_key && (
              <span
                className="task-project-badge flex-shrink-0"
                style={{
                  color: projectColors[item.project || ""] || "#4f46e5",
                  backgroundColor: colorTint(projectColors[item.project || ""] || "#4f46e5", 0.14),
                  borderColor: colorTint(projectColors[item.project || ""] || "#4f46e5", 0.3),
                }}
              >
                {item.project_key}
              </span>
            )}
          </div>
          <div className="task-table-description" title={item.description || ""}>{item.description || (level ? "Subtask" : "No description")}</div>
          {item.employee_notes && <div className="task-table-progress" title={item.employee_notes}>Progress: {item.employee_notes}</div>}
        </div>
      </td>
      {!employeeMode && (
        <td className="py-3" data-label="Assigned to">
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <img className="task-avatar task-avatar-image flex-shrink-0" src={item.assignee_avatar_url || getAssetPath("/images/avatar/avatar-fallback.jpg")} alt={item.assignee_name || "Assignee"} />
            <div className="overflow-hidden" style={{ minWidth: 0 }}>
              <div className="fw-semibold small text-truncate" title={item.assignee_names?.length ? item.assignee_names.join(", ") : item.assignee_name || "Unassigned"}>{item.assignee_names?.length ? item.assignee_names.join(", ") : item.assignee_name || "Unassigned"}</div>
              <div className="text-secondary small text-truncate">{item.assignee_names?.length > 1 ? `${item.assignee_names.length} collaborators` : item.department || "No department"}</div>
            </div>
          </div>
        </td>
      )}
      <td className="py-3 text-nowrap" data-label="Subtasks">
        {rowChildCount ? (
          level ? (
            <Badge bg="light" text="dark" className="task-subtask-badge border"><IconListTree size={14} /> {rowChildCount}</Badge>
          ) : (
            <Button
              variant="light"
              size="sm"
              className={`task-subtask-count ${expanded ? "is-expanded" : ""}`}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} ${countLabel(rowChildCount)} for ${item.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleSubtasks(item.id);
              }}
            >
              <span>{countLabel(rowChildCount)}</span>
              {expanded ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
            </Button>
          )
        ) : (
          <span className="text-secondary small">0</span>
        )}
      </td>
      <td className="py-3 text-nowrap" data-label="Priority & status">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Badge className={`task-priority-chip priority-${item.priority.toLowerCase()}`}>{item.priority_label}</Badge>
          <Badge className={`task-status-chip status-${item.is_overdue ? "overdue" : item.status.toLowerCase().replace("_", "-")}`}>{item.is_overdue ? "Overdue" : item.status_label}</Badge>
        </div>
      </td>
      <td className="px-4 py-3 text-end text-nowrap" data-label="Action">
        <Button
          variant="outline-primary"
          size="sm"
          className="task-row-update-btn d-inline-flex align-items-center gap-1.5"
          disabled={workActionsDisabled || item.status === "CANCELLED"}
          onClick={(event) => {
            event.stopPropagation();
            onOpenProgress(item);
          }}
          title="Update progress"
        >
          <IconRefresh size={14} />
          <span>Update progress</span>
        </Button>
      </td>
    </tr>;
  };
  const renderSubtaskRows = (parentId: string, parentNumber: string, level = 1): React.ReactNode[] => (subtasksByParent[parentId] || []).flatMap((child, childIndex) => {
    const childNumber = `${parentNumber}.${childIndex + 1}`;
    return [renderRow(child, level, childNumber), ...renderSubtaskRows(child.id, childNumber, level + 1)];
  });
  return <>{renderRow(task, 0, String(index))}{expanded && renderSubtaskRows(task.id, String(index))}</>;
}

function TaskTableRows({ task, index, subtasksByParent, projectColors, employeeMode, onOpenDetail, onAddSubtask, onEdit, onProgress, onDelete }: { task: Task; index: number; subtasksByParent: Record<string, Task[]>; projectColors: Record<string, string>; employeeMode: boolean; onOpenDetail: (task: Task) => void; onAddSubtask: (task: Task) => void; onEdit: (task: Task) => void; onProgress: (task: Task) => void; onDelete: (task: Task) => void }) {
  const renderRows = (item: Task, level = 0, number?: string): React.ReactNode[] => {
    const row = <tr key={item.id} className={`workspace-task-row ${level ? "is-subtask" : ""}`} onClick={() => onOpenDetail(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenDetail(item); } }}>
      <td className="px-4 py-3 fw-bold text-secondary" data-label="Sr. no.">{number || "—"}</td>
      <td className="py-3" data-label="Task"><div className="task-table-title" style={{ paddingLeft: `${Math.min(level, 4) * 18}px` }}><div className="d-flex align-items-center gap-2">{level > 0 && <IconListTree size={15} className="text-secondary" />}<span className={`priority-dot priority-${item.priority.toLowerCase()}`} /><strong>{item.title}</strong>{item.project_key && <span className="task-project-badge" style={{ color: projectColors[item.project || ""] || "#4f46e5", backgroundColor: colorTint(projectColors[item.project || ""] || "#4f46e5", 0.14), borderColor: colorTint(projectColors[item.project || ""] || "#4f46e5", 0.3) }}>{item.project_key}</span>}</div><div className="task-table-description">{item.description || (level ? "Subtask" : "No description")}</div>{item.employee_notes && <div className="task-table-progress">Progress: {item.employee_notes}</div>}</div></td>
      {!employeeMode && <td className="py-3" data-label="Assigned to"><div className="d-flex align-items-center gap-2"><img className="task-avatar task-avatar-image" src={item.assignee_avatar_url || getAssetPath("/images/avatar/avatar-fallback.jpg")} alt={item.assignee_name || "Assignee"} /><div><div className="fw-semibold small">{item.assignee_names?.length ? item.assignee_names.join(", ") : item.assignee_name || "Unassigned"}</div><div className="text-secondary small">{item.assignee_names?.length > 1 ? `${item.assignee_names.length} collaborators` : item.department || "No department"}</div></div></div></td>}
      <td className="py-3" data-label="Priority & status"><div className="d-flex flex-wrap align-items-center gap-2"><Badge className={`task-priority-chip priority-${item.priority.toLowerCase()}`}>{item.priority_label}</Badge><Badge className={`task-status-chip status-${item.is_overdue ? "overdue" : item.status.toLowerCase().replace("_", "-")}`}>{item.is_overdue ? "Overdue" : item.status_label}</Badge></div></td>
      <td className="px-4 py-3 text-end" data-label="Action"><Dropdown align="end" onClick={(event) => event.stopPropagation()}><Dropdown.Toggle variant="light" size="sm" className="task-action-toggle" aria-label={`Actions for ${item.title}`}><IconDotsVertical size={18} /></Dropdown.Toggle><Dropdown.Menu className="task-action-menu shadow border-0" popperConfig={{ strategy: "fixed" }}><Dropdown.Item className="d-flex align-items-center gap-2" onClick={() => onAddSubtask(item)}><IconPlus size={16} /> Add subtask</Dropdown.Item><Dropdown.Divider />{employeeMode ? <Dropdown.Item className="d-flex align-items-center gap-2" disabled={item.status === "CANCELLED"} onClick={() => onProgress(item)}><IconRefresh size={16} /> Update task</Dropdown.Item> : <Dropdown.Item className="d-flex align-items-center gap-2" onClick={() => onEdit(item)}><IconSettings size={16} /> Edit task</Dropdown.Item>}<Dropdown.Divider /><Dropdown.Item className="d-flex align-items-center gap-2 text-danger" onClick={() => onDelete(item)}><IconTrash size={16} /> Delete task</Dropdown.Item></Dropdown.Menu></Dropdown></td>
    </tr>;
    const children = (subtasksByParent[item.id] || []).flatMap((child, childIndex) => renderRows(child, level + 1, `${number || index}.${childIndex + 1}`));
    return [row, ...children];
  };
  return <>{renderRows(task, 0, String(index))}</>;
}

function TaskRow({ task, subtasks, employeeMode, expanded, onToggle, onAddSubtask, onEdit, onProgress }: { task: Task; subtasks: Task[]; employeeMode: boolean; expanded: boolean; onToggle: () => void; onAddSubtask: () => void; onEdit: () => void; onProgress: (task: Task) => void }) {
  const childCount = subtasks.length || task.subtask_count;
  return <div className="task-node"><div className="task-row"><Button variant="link" className="task-expand" onClick={onToggle} disabled={!childCount}>{childCount ? expanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} /> : <span />}</Button><span className={`priority-dot priority-${task.priority.toLowerCase()}`} /><div className="task-copy"><div className="d-flex align-items-center gap-2 flex-wrap"><strong>{task.title}</strong>{task.project_key && <span className="task-project-tag">{task.project_key}</span>}</div>{task.description && <span>{task.description}</span>}{task.employee_notes && <em>Update: {task.employee_notes}</em>}</div><div className="task-meta"><Badge className={statusClass(task.status)}>{task.is_overdue ? "Overdue" : task.status_label}</Badge><span className={task.is_overdue ? "text-danger" : ""}>{task.due_date ? date(task.due_date) : "No due date"}</span><span>{employeeMode ? "Me" : task.assignee_name}</span></div><div className="task-actions"><Button size="sm" variant="light" title="Add subtask" onClick={onAddSubtask}><IconPlus size={16} /></Button>{employeeMode ? <Button size="sm" variant="outline-primary" onClick={() => onProgress(task)} disabled={task.status === "CANCELLED"}>Update</Button> : <Button size="sm" variant="outline-primary" onClick={onEdit}>Edit</Button>}</div></div>{expanded && subtasks.map((subtask) => <div className="subtask-row" key={subtask.id}><IconCheck size={15} /><div><strong>{subtask.title}</strong><span>{subtask.description || "Subtask"}</span></div><Badge className={statusClass(subtask.status)}>{subtask.status_label}</Badge><span>{subtask.due_date ? date(subtask.due_date) : "No date"}</span>{employeeMode && <Button size="sm" variant="link" onClick={() => onProgress(subtask)}>Update</Button>}</div>)}</div>;
}

const styles = `
.workspace-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:26px 28px;border-radius:16px;background:linear-gradient(115deg,#172554,#3730a3 58%,#4f46e5);color:#fff}.workspace-hero h2{margin:4px 0;font-weight:800}.workspace-hero p{margin:0;color:#c7d2fe}.workspace-hero .btn{display:inline-flex;align-items:center;gap:7px}.workspace-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.1em;display:flex;align-items:center;gap:6px;color:#c7d2fe}.workspace-metric .card-body{display:flex;align-items:center;gap:13px}.workspace-metric span{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#eef2ff;color:#4f46e5}.workspace-metric small,.workspace-metric strong{display:block}.workspace-metric small{color:#64748b;font-weight:600}.workspace-metric strong{font-size:1.45rem;color:#0f172a}.workspace-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:16px}.workspace-project{cursor:pointer;border-top:4px solid #4f46e5!important;transition:.18s ease}.workspace-project:hover,.workspace-project.is-selected{transform:translateY(-2px);box-shadow:0 12px 26px rgba(15,23,42,.12)!important}.workspace-project.is-selected{outline:2px solid #c7d2fe}.workspace-project h6{font-weight:750;margin:3px 0}.workspace-project p{font-size:.83rem;color:#64748b;height:39px;overflow:hidden;margin:10px 0}.project-key{font-size:.7rem;font-weight:800;letter-spacing:.08em}.project-footer{display:flex;justify-content:space-between;align-items:center;margin-top:14px;font-size:.73rem;color:#64748b}.workspace-status{border-radius:99px;padding:4px 8px;font-size:.7rem;font-weight:700;border:1px solid transparent}.workspace-todo{background:#f1f5f9;color:#475569;border-color:#cbd5e1}.workspace-pending,.workspace-planning{background:#e0f2fe;color:#0369a1;border-color:#bae6fd}.workspace-in-progress,.workspace-active{background:#e0e7ff;color:#4338ca;border-color:#c7d2fe}.workspace-on-hold{background:#fef3c7;color:#a16207;border-color:#fde68a}.workspace-completed,.workspace-closed{background:#dcfce7;color:#15803d;border-color:#bbf7d0}.workspace-cancelled,.workspace-archived{background:#fee2e2;color:#b91c1c;border-color:#fecaca}.border-dashed{border:1px dashed #cbd5e1!important}.task-node{border:1px solid #e5e7eb;border-radius:12px;margin-bottom:10px;overflow:hidden}.task-row{min-height:72px;display:grid;grid-template-columns:32px 10px minmax(230px,1fr) minmax(230px,.8fr) auto;gap:12px;align-items:center;padding:11px 14px}.task-expand{padding:0;color:#475569;width:26px;height:26px}.task-expand:disabled{opacity:.2}.priority-dot{width:9px;height:9px;border-radius:50%}.priority-low{background:#94a3b8}.priority-medium{background:#38bdf8}.priority-high{background:#f59e0b}.priority-urgent{background:#ef4444}.task-copy{min-width:0}.task-copy strong{display:block;color:#0f172a}.task-copy>span,.task-copy em{display:block;max-width:430px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem;color:#64748b;margin-top:2px}.task-copy em{color:#6366f1;font-style:normal}.task-project-tag{background:#f1f5f9;border-radius:4px;padding:2px 5px;color:#475569;font-size:.65rem;font-weight:800}.task-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.76rem;color:#64748b}.task-actions{display:flex;gap:7px}.subtask-row{display:grid;grid-template-columns:20px minmax(150px,1fr) auto 95px auto;align-items:center;gap:10px;padding:10px 16px 10px 56px;border-top:1px solid #eef2f7;background:#fafcff;font-size:.82rem}.subtask-row svg{color:#94a3b8}.subtask-row strong,.subtask-row span{display:block}.subtask-row span{color:#64748b;font-size:.74rem;margin-top:2px}.subtask-row>.workspace-status{justify-self:start}@media(max-width:991px){.task-row{grid-template-columns:28px 10px minmax(170px,1fr) auto}.task-meta{grid-column:3/5;justify-content:flex-start}.task-actions{grid-row:1;grid-column:4}.subtask-row{grid-template-columns:20px 1fr auto;padding-left:38px}.subtask-row>span{display:none}}@media(max-width:575px){.workspace-hero{align-items:flex-start;flex-direction:column;padding:22px}.workspace-hero .btn{font-size:.82rem}.task-row{grid-template-columns:25px 9px 1fr auto;padding:10px}.task-meta{grid-column:3/5;gap:7px;font-size:.7rem}.task-meta span:last-child{display:none}.task-actions .btn:last-child{font-size:0;padding:7px}.task-actions .btn:last-child:after{content:'•••';font-size:.8rem}.subtask-row{grid-template-columns:15px 1fr auto;padding:9px 10px 9px 30px}.subtask-row>.workspace-status{display:none}}
`;

const heroStyles = `
.workspace-hero{position:relative;display:flex;justify-content:space-between;align-items:center;gap:24px;min-height:136px;padding:26px 30px;border:1px solid #e3eaf3;border-radius:14px;background:radial-gradient(circle at 100% 0%,rgba(13,110,253,.1),transparent 34%),linear-gradient(135deg,#fff 0%,#f8faff 100%);box-shadow:0 4px 16px rgba(15,23,42,.055);color:#1e293b;overflow:hidden}.workspace-hero:before{content:"";position:absolute;left:0;top:24px;bottom:24px;width:4px;border-radius:0 4px 4px 0;background:var(--bs-primary,#0d6efd)}.workspace-hero:after{content:"";position:absolute;right:-46px;bottom:-76px;width:184px;height:184px;border:30px solid rgba(13,110,253,.055);border-radius:50%;pointer-events:none}.workspace-hero>div{position:relative;z-index:1}.workspace-hero h2{margin:5px 0 6px;color:#1e293b;font-size:1.6rem;font-weight:700;letter-spacing:-.02em}.workspace-hero p{margin:0;color:#64748b;font-size:.92rem}.workspace-hero .btn{display:inline-flex;align-items:center;gap:7px;border-radius:8px;font-weight:600;box-shadow:none}.workspace-hero .btn-outline-primary{background:#fff;border-color:#cbd5e1;color:#334155}.workspace-hero .btn-outline-primary:hover{background:#f1f5f9;border-color:var(--bs-primary,#0d6efd);color:var(--bs-primary,#0d6efd)}.workspace-hero .btn-primary{padding-inline:18px;box-shadow:0 5px 12px rgba(13,110,253,.2)}.workspace-eyebrow{font-size:.71rem;font-weight:800;letter-spacing:.09em;display:flex;align-items:center;gap:7px;color:var(--bs-primary,#0d6efd)}.workspace-eyebrow svg{padding:3px;box-sizing:content-box;border-radius:50%;background:rgba(13,110,253,.1)}@media(max-width:575px){.workspace-hero{align-items:flex-start;min-height:0;padding:22px}.workspace-hero h2{font-size:1.35rem}.workspace-hero:before{top:18px;bottom:18px}.workspace-hero:after{display:none}}
`;

const taskTableStyles = `
.workspace-task-table{table-layout:fixed!important;width:100%!important;min-width:880px}.workspace-task-table th{font-size:.7rem;letter-spacing:.04em;white-space:nowrap;color:#52637a!important;font-weight:750!important}.workspace-task-row{cursor:pointer;transition:background-color .15s ease}.workspace-task-row:hover{background:#f8fafc}.workspace-task-row:focus-visible{outline:2px solid #3b82f6;outline-offset:-2px}.workspace-task-row.is-subtask td{background:#fbfcfe}.workspace-task-row.is-subtask td:first-child{box-shadow:inset 3px 0 0 #e2e8f0}.task-table-title{min-width:0;max-width:100%}.task-title-clamp{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;word-break:break-all;color:#1e293b;font-size:.875rem}.task-table-description{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-size:.78rem;margin-top:3px}.task-table-progress{display:block;max-width:100%;margin-top:4px;overflow:hidden;color:#2563eb;font-size:.72rem;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.task-avatar{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#e0e7ff;color:#4338ca;font-size:.73rem;font-weight:800}.task-priority{border:0;border-radius:5px;padding:5px 8px;font-size:.7rem;font-weight:700}.task-priority.priority-low{background:#f1f5f9;color:#64748b}.task-priority.priority-medium{background:#e0f2fe;color:#0369a1}.task-priority.priority-high{background:#fef3c7;color:#a16207}.task-priority.priority-urgent{background:#fee2e2;color:#b91c1c}
`;

const detailStyles = `
.task-detail-hero{padding:18px;border:1px solid #e5eaf0;border-radius:10px;background:#f8fafc}.task-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.task-detail-field,.task-detail-section{padding:12px;border:1px solid #e5eaf0;border-radius:8px;background:#fff}.task-detail-field span,.task-detail-section span{display:block;margin-bottom:5px;color:#64748b;font-size:.7rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase}.task-detail-field strong{display:block;color:#1e293b;font-size:.84rem;overflow-wrap:anywhere}.task-detail-field small{display:block;margin-top:3px;color:#64748b;font-size:.75rem}.task-detail-section p{margin:0;color:#475569;white-space:pre-wrap}.subtask-detail-list{padding:14px;border:1px solid #e5eaf0;border-radius:10px;background:#f8fafc}.subtask-detail-item{display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px 0;border-top:1px solid #e5eaf0}.subtask-detail-item:first-of-type{border-top:0}.subtask-detail-item svg{color:#64748b}.subtask-detail-item strong,.subtask-detail-item span{display:block}.subtask-detail-item strong{font-size:.83rem;color:#334155}.subtask-detail-item span{margin-top:2px;color:#64748b;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:767.98px){.task-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:575.98px){.task-detail-grid{grid-template-columns:1fr}.subtask-detail-item{grid-template-columns:18px minmax(0,1fr)}.subtask-detail-item .workspace-status{grid-column:2;justify-self:start}}
.task-detail-grid{display:flex!important;flex-wrap:wrap;gap:8px!important;margin-bottom:14px!important}.task-detail-field{display:inline-flex!important;align-items:center;gap:7px;max-width:100%;min-height:30px;padding:6px 10px!important;border-radius:999px!important;background:#f8fafc!important;border-color:#dbe4ef!important}.task-detail-field span{display:inline!important;margin:0!important;color:#64748b!important;font-size:.62rem!important;font-weight:800!important;line-height:1;white-space:nowrap}.task-detail-field span:after{content:":";margin-left:2px}.task-detail-field strong{display:inline!important;min-width:0;color:#1e293b!important;font-size:.76rem!important;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-detail-field small{display:inline!important;margin:0!important;color:#64748b!important;font-size:.7rem!important;line-height:1.2;white-space:nowrap}.task-detail-field small:before{content:"• ";color:#94a3b8}.task-detail-section{padding:10px 12px!important;border-radius:8px!important}@media(max-width:575.98px){.task-detail-grid{display:grid!important;grid-template-columns:1fr!important}.task-detail-field{width:100%;border-radius:8px!important}.task-detail-field strong,.task-detail-field small{white-space:normal}}
.task-detail-hero .task-priority,.task-detail-hero .workspace-status{border-radius:999px!important;border:1px solid transparent!important;padding:5px 9px!important;font-size:.68rem!important;font-weight:750!important;line-height:1!important}.task-detail-hero .task-priority.priority-low{background:#f1f5f9!important;color:#475569!important;border-color:#e2e8f0!important}.task-detail-hero .task-priority.priority-medium{background:#e0f2fe!important;color:#0369a1!important;border-color:#bae6fd!important}.task-detail-hero .task-priority.priority-high{background:#fff7ed!important;color:#c2410c!important;border-color:#fed7aa!important}.task-detail-hero .task-priority.priority-urgent{background:#fef2f2!important;color:#b91c1c!important;border-color:#fecaca!important}.task-detail-hero .workspace-pending{background:#eff6ff!important;color:#1d4ed8!important;border-color:#bfdbfe!important}.task-detail-hero .workspace-todo{background:#f8fafc!important;color:#475569!important;border-color:#cbd5e1!important}.task-detail-hero .workspace-in-progress{background:#eef2ff!important;color:#4338ca!important;border-color:#c7d2fe!important}.task-detail-hero .workspace-on-hold{background:#fffbeb!important;color:#a16207!important;border-color:#fde68a!important}.task-detail-hero .workspace-completed,.task-detail-hero .workspace-closed{background:#dcfce7!important;color:#166534!important;border-color:#bbf7d0!important}.task-detail-hero .workspace-cancelled{background:#fef2f2!important;color:#b91c1c!important;border-color:#fecaca!important}
.subtask-detail-list .workspace-status{border-radius:999px!important;border:1px solid transparent!important;padding:5px 9px!important;font-size:.68rem!important;font-weight:750!important;line-height:1!important}.subtask-detail-list .workspace-pending{background:#eff6ff!important;color:#1d4ed8!important;border-color:#bfdbfe!important}.subtask-detail-list .workspace-todo{background:#f8fafc!important;color:#475569!important;border-color:#cbd5e1!important}.subtask-detail-list .workspace-in-progress{background:#eef2ff!important;color:#4338ca!important;border-color:#c7d2fe!important}.subtask-detail-list .workspace-on-hold{background:#fffbeb!important;color:#a16207!important;border-color:#fde68a!important}.subtask-detail-list .workspace-completed,.subtask-detail-list .workspace-closed{background:#dcfce7!important;color:#166534!important;border-color:#bbf7d0!important}.subtask-detail-list .workspace-cancelled{background:#fef2f2!important;color:#b91c1c!important;border-color:#fecaca!important}
.task-detail-hero{position:relative!important;overflow:hidden!important;padding:20px!important;border-color:#dbe7f4!important;background:linear-gradient(135deg,#ffffff 0%,#f8fbff 58%,#eef6ff 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}.task-detail-hero:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#0ea5e9}.task-detail-hero h5{color:#111827!important;font-size:1.05rem!important;letter-spacing:0!important}.task-detail-hero p{max-width:680px;color:#64748b!important;font-size:.86rem!important}.task-detail-grid .task-detail-field:nth-child(1){background:#eff6ff!important;border-color:#bfdbfe!important}.task-detail-grid .task-detail-field:nth-child(1) span{color:#2563eb!important}.task-detail-grid .task-detail-field:nth-child(2){background:#ecfdf5!important;border-color:#bbf7d0!important}.task-detail-grid .task-detail-field:nth-child(2) span{color:#047857!important}.task-detail-grid .task-detail-field:nth-child(3){background:#fff7ed!important;border-color:#fed7aa!important}.task-detail-grid .task-detail-field:nth-child(3) span{color:#c2410c!important}.task-detail-grid .task-detail-field:nth-child(4){background:#f8fafc!important;border-color:#cbd5e1!important}.task-detail-grid .task-detail-field:nth-child(4) span{color:#475569!important}.task-detail-grid .task-detail-field:nth-child(6){background:#f5f3ff!important;border-color:#ddd6fe!important}.task-detail-grid .task-detail-field:nth-child(6) span{color:#6d28d9!important}.task-detail-section{background:#fff!important;border-color:#dbe7f4!important;border-left:4px solid #0ea5e9!important;box-shadow:0 1px 2px rgba(15,23,42,.04)}.task-detail-section span{color:#2563eb!important}.task-detail-section p{color:#334155!important;font-size:.88rem!important;line-height:1.55}.subtask-detail-list{padding:12px!important;border-color:#dbe7f4!important;background:linear-gradient(180deg,#f8fbff 0%,#f6f8fb 100%)!important}.subtask-detail-list h6{color:#111827!important;font-size:.92rem!important}.subtask-detail-list>.d-flex{padding-bottom:8px;border-bottom:1px solid #e5edf6}.subtask-detail-item{margin-top:8px!important;padding:10px 12px!important;border:1px solid #e5edf6!important;border-radius:8px!important;background:#fff!important;box-shadow:0 1px 2px rgba(15,23,42,.04)}.subtask-detail-item:first-of-type{margin-top:8px!important}.subtask-detail-item svg{color:#2563eb!important}.subtask-detail-item strong{color:#1f2937!important;font-size:.86rem!important}.subtask-detail-item span{color:#64748b!important}.task-workspace .modal-footer{background:#f8fafc;border-top-color:#e5edf6}.task-workspace .modal-footer .btn{border-radius:8px!important;font-weight:750!important}.task-workspace .modal-footer .btn-primary,.task-workspace .modal-footer .btn-success{background:#059669!important;border-color:#059669!important}.task-workspace .modal-footer .btn-outline-primary{border-color:#10b981!important;color:#047857!important}.task-workspace .modal-footer .btn-outline-primary:hover{background:#ecfdf5!important;color:#065f46!important}
`;

const tableEnhancements = `
.workspace-task-row td{vertical-align:middle}.task-action-toggle{display:inline-flex!important;align-items:center;justify-content:center;padding:5px 7px!important;color:#475569!important}.task-action-toggle:after{display:none!important}.task-action-menu{min-width:168px;border-radius:9px!important;padding:6px}.task-action-menu .dropdown-item{border-radius:6px;padding:8px 10px;font-size:.8rem;font-weight:600}.task-assignee-picker{display:flex;min-height:38px;flex-wrap:wrap;align-items:center;gap:6px;border:1px solid #dbe4ef;border-radius:8px;padding:5px;background:#f8fafc}.task-assignee-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 5px 4px 9px;background:#e0e7ff;color:#3730a3;font-size:.75rem;font-weight:700}.task-assignee-chip button{display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:50%;padding:0;background:rgba(67,56,202,.12);color:#4338ca}.task-assignee-chip button:hover{background:rgba(67,56,202,.22)}.task-add-assignee{border-style:dashed!important;white-space:nowrap}.task-avatar-image{object-fit:cover;border:2px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.16)}.task-priority-chip,.task-status-chip{display:inline-flex;align-items:center;justify-content:center;min-width:76px;border:1px solid transparent;border-radius:999px;padding:5px 9px;font-size:.69rem;font-weight:750;line-height:1.1;white-space:nowrap}.task-priority-chip.priority-low{background:#f1f5f9!important;color:#64748b!important;border-color:#e2e8f0!important}.task-priority-chip.priority-medium{background:#e0f2fe!important;color:#0369a1!important;border-color:#bae6fd!important}.task-priority-chip.priority-high{background:#fff7ed!important;color:#c2410c!important;border-color:#fed7aa!important}.task-priority-chip.priority-urgent{background:#fef2f2!important;color:#b91c1c!important;border-color:#fecaca!important}.task-status-chip.status-pending{background:#eff6ff!important;color:#1d4ed8!important;border-color:#bfdbfe!important}.task-status-chip.status-todo{background:#f8fafc!important;color:#475569!important;border-color:#cbd5e1!important}.task-status-chip.status-in-progress{background:#eef2ff!important;color:#4f46e5!important;border-color:#c7d2fe!important}.task-status-chip.status-on-hold{background:#fffbeb!important;color:#a16207!important;border-color:#fde68a!important}.task-status-chip.status-completed{background:#ecfdf5!important;color:#047857!important;border-color:#a7f3d0!important}.task-status-chip.status-closed{background:#f5f3ff!important;color:#6d28d9!important;border-color:#ddd6fe!important}.task-status-chip.status-cancelled,.task-status-chip.status-overdue{background:#fef2f2!important;color:#b91c1c!important;border-color:#fecaca!important}
`;

const projectColorStyles = `
.workspace-projects-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.workspace-projects{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.workspace-projects-toggle{display:inline-flex;align-items:center;gap:6px;border-radius:7px;font-weight:600}.workspace-task-list{scroll-margin-top:24px}.task-list-filters{padding:16px 24px;background:#fbfcfe}.task-subtask-count{display:inline-flex!important;align-items:center;gap:6px;border:1px solid #dbe4ef!important;border-radius:999px!important;background:#fff!important;color:#334155!important;font-size:.72rem!important;font-weight:750!important;line-height:1;white-space:nowrap}.task-subtask-count.is-expanded{background:#eef2ff!important;border-color:#c7d2fe!important;color:#4338ca!important}.task-subtask-badge{display:inline-flex!important;align-items:center;gap:5px;border-radius:999px!important;padding:5px 8px!important;color:#475569!important;font-size:.7rem!important}.task-row-update-btn{font-size:.74rem;font-weight:650;padding:5px 11px;border-radius:7px;white-space:nowrap;border-color:#c7d2fe;color:#4338ca;background:#f8faff;transition:all .15s ease-in-out}.task-row-update-btn:hover:not(:disabled){background:#eef2ff;border-color:#818cf8;color:#312e81;box-shadow:0 2px 6px rgba(99,102,241,.2)}.task-row-update-btn:disabled{opacity:.45}.workspace-project{position:relative;border-top-color:var(--project-color,#4f46e5)!important;background:linear-gradient(135deg,var(--project-tint,rgba(79,70,229,.16)) 0%,#fff 82%)!important}.workspace-project.is-selected{outline-color:var(--project-color,#4f46e5);box-shadow:0 0 0 4px var(--project-tint,rgba(79,70,229,.16)),0 12px 26px rgba(15,23,42,.12)!important}.workspace-project:focus-visible{outline:3px solid var(--project-color,#4f46e5);outline-offset:3px}.workspace-project .card-body{position:relative}.project-selected{position:absolute;top:12px;right:86px;display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:4px 8px;background:var(--project-color,#4f46e5);color:#fff;font-size:.67rem;font-weight:800;line-height:1;box-shadow:0 2px 6px rgba(15,23,42,.14)}.workspace-project .progress-bar{background-color:var(--project-color,#4f46e5)!important}.task-project-badge{display:inline-flex;align-items:center;border:1px solid transparent;border-radius:5px!important;padding:3px 6px!important;font-size:.64rem!important;font-weight:800!important;letter-spacing:.04em;line-height:1}@media(max-width:991.98px){.workspace-projects{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:575.98px){.workspace-projects-header{align-items:flex-start;flex-direction:column}.workspace-projects{grid-template-columns:1fr;width:100%}.task-list-filters{padding:14px}}

.dashboard-filter-chip{display:inline-flex;align-items:center;gap:8px;width:max-content;max-width:100%;border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1d4ed8;padding:6px 8px 6px 11px;font-size:.76rem}.dashboard-filter-chip span{font-weight:800;text-transform:uppercase;font-size:.63rem;letter-spacing:.04em;color:#2563eb}.dashboard-filter-chip strong{color:#0f172a;font-size:.78rem}.dashboard-filter-chip button{display:grid;place-items:center;width:22px;height:22px;border:0;border-radius:50%;background:#dbeafe;color:#1d4ed8}.dashboard-filter-chip button:hover{background:#bfdbfe}@media(max-width:575.98px){.dashboard-filter-chip{width:100%;justify-content:space-between;border-radius:8px}}
`;

const projectActionStyles = `
.project-action-button{display:inline-flex!important;align-items:center;justify-content:center;width:28px;height:28px;padding:0!important;border:0!important;background:transparent!important;color:#334155!important;text-decoration:none!important}.project-action-button.text-danger{color:#dc3545!important}.project-action-button:hover,.project-action-button:focus-visible{background:rgba(15,23,42,.08)!important;border-radius:6px;text-decoration:none!important}.project-action-button:focus-visible{outline:2px solid #2563eb;outline-offset:1px}.project-action-button:disabled{opacity:.45}
`;

const paginationStyles = `
.task-list-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid #e5eaf0;border-top:0;border-radius:0 0 10px 10px;background:#fff;color:#64748b;font-size:.78rem}.task-list-pagination .pagination{gap:4px}.task-list-pagination .page-link{min-width:32px;border-radius:6px;text-align:center;font-size:.78rem}.task-list-pagination .page-item.active .page-link{background:#2563eb;border-color:#2563eb}@media(max-width:575.98px){.task-list-pagination{align-items:flex-start;flex-direction:column}.task-list-pagination .pagination{flex-wrap:wrap}}
`;

const categoryRemovalStyles = `
.modal-body .col-md-4:has(input[placeholder="Design"]),.modal-body .row > div:has(input[placeholder="Design"]),.task-detail-grid .task-detail-field:nth-child(5){display:none!important}.modal-body .row:has(input[placeholder="Describe the work clearly"]) > .col-md-4{flex:0 0 auto;width:50%}body.employee-task-workspace .modal-body .row:has(input[placeholder="Describe the work clearly"]) > .col-md-6:has(select),body.employee-task-workspace .modal-body .row:has(input[placeholder="Describe the work clearly"]) > .col-md-4:has(select){flex:0 0 auto;width:33.333333%}@media(max-width:767.98px){.modal-body .row:has(input[placeholder="Describe the work clearly"]) > .col-md-4,body.employee-task-workspace .modal-body .row:has(input[placeholder="Describe the work clearly"]) > .col-md-6:has(select),body.employee-task-workspace .modal-body .row:has(input[placeholder="Describe the work clearly"]) > .col-md-4:has(select){width:100%}}
`;

const datePlannerStyles = `
.task-date-planner{--bs-modal-width:500px}.date-planner-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px;border-bottom:1px solid #e5e7eb}.date-planner-tabs button{display:flex;align-items:center;gap:7px;border:0;border-radius:7px;padding:9px 11px;background:#f1f5f9;color:#64748b;text-align:left}.date-planner-tabs button.is-active{background:#eef2ff;color:#4f46e5;box-shadow:inset 0 0 0 1px #6366f1}.date-planner-content{display:grid;grid-template-columns:46% 54%;min-height:300px}.date-quick-list{padding:10px;border-right:1px solid #e5e7eb}.date-quick-list button{display:flex;justify-content:space-between;width:100%;border:0;background:transparent;padding:8px 4px;color:#334155;text-align:left}.date-quick-list button:hover{color:#4f46e5}.date-quick-list small{color:#94a3b8}.date-calendar{padding:14px}.date-calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.date-calendar-head button{border:0;background:transparent;color:#64748b}.date-weekdays,.date-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}.date-weekdays{margin-bottom:6px;color:#94a3b8;font-size:.72rem}.date-grid button{height:30px;border:0;border-radius:50%;background:transparent;color:#334155;font-size:.78rem}.date-grid button:hover,.date-grid button.is-selected{background:#4f46e5;color:#fff}.date-grid button.is-muted{color:#cbd5e1}.date-grid button.is-today{box-shadow:inset 0 0 0 1px #f43f5e}@media(max-width:575px){.task-date-planner{--bs-modal-width:calc(100% - 20px)}.date-planner-content{grid-template-columns:1fr}.date-quick-list{border-right:0;border-bottom:1px solid #e5e7eb}.date-quick-list{display:grid;grid-template-columns:1fr 1fr}.date-calendar{padding:12px}}
`;

const responsiveStyles = `
.task-workspace{min-width:0;overflow-x:clip}.task-list-header{gap:16px}.task-table-title,.task-table-title>div,.workspace-task-table td>div{min-width:0}.task-table-title>div{flex-wrap:wrap}.task-table-title strong,.workspace-task-table td{overflow-wrap:anywhere}
.workspace-task-table td[data-label="Action"]{text-align:right}
@media(max-width:991.98px){
  .task-list-table-wrap{overflow-x:visible}
  .workspace-task-table,body.employee-task-workspace .workspace-task-table{min-width:0!important;width:100%!important;table-layout:auto!important}
  .workspace-task-table thead{display:none!important}
  .workspace-task-table,.workspace-task-table tbody,.workspace-task-table tr,.workspace-task-table td{display:block!important;width:100%!important}
  .workspace-task-table tbody{padding:12px!important;background:#f8fafc!important}
  .workspace-task-table tr{margin:0 0 12px!important;border:1px solid #e5eaf0!important;border-radius:10px!important;background:#fff!important;box-shadow:0 4px 14px rgba(15,23,42,.06)!important;overflow:hidden!important}
  .workspace-task-table tr:last-child{margin-bottom:0!important}
  .workspace-task-table td{display:grid!important;grid-template-columns:minmax(110px,30%) minmax(0,1fr)!important;gap:12px!important;align-items:start!important;border:0!important;border-bottom:1px solid #eef2f6!important;padding:12px 16px!important;text-align:left!important;white-space:normal!important}
  .workspace-task-table td:last-child{border-bottom:0!important}
  .workspace-task-table td:before{display:block!important;content:attr(data-label)!important;font-size:.69rem!important;font-weight:750!important;color:#64748b!important;text-transform:uppercase!important;letter-spacing:.04em!important}
  .workspace-task-row.is-subtask{width:calc(100% - 16px)!important;margin-left:16px!important;border-left:3px solid #cbd5e1!important}
  .workspace-task-table .task-table-description,.workspace-task-table .task-table-progress{max-width:none!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
  .workspace-task-table td[data-label="Action"]{text-align:left!important}
  .workspace-task-table td[data-label="Action"] .task-row-update-btn{width:max-content}
}
@media(max-width:575.98px){
  .task-workspace{padding-top:16px!important}
  .workspace-hero{gap:18px;padding:20px!important}
  .workspace-hero>div,.workspace-hero>div:last-child{width:100%}
  .workspace-hero>div:last-child{display:grid!important;grid-template-columns:1fr 1fr}
  .workspace-hero .btn{justify-content:center;white-space:nowrap}
  .workspace-metric .card-body{gap:9px;padding:12px}
  .workspace-metric span{width:36px;height:36px;flex:0 0 36px}
  .workspace-metric span svg{width:19px;height:19px}
  .workspace-metric small{font-size:.7rem}
  .workspace-metric strong{font-size:1.2rem}
  .workspace-projects-header>div:last-child{width:100%;flex-wrap:wrap}
  .workspace-projects-toggle{flex:1;justify-content:center}
  .project-selected{position:static;margin-bottom:8px;width:max-content}
  .task-list-header{align-items:stretch!important;flex-direction:column;padding:18px 14px 14px!important}
  .task-list-header .btn{justify-content:center}
  .task-list-filters{padding:14px!important}
  .workspace-task-table tbody{padding:8px!important}
  .workspace-task-table td{grid-template-columns:1fr!important;gap:5px!important;padding:10px 12px!important}
  .workspace-task-table td:before{font-size:.65rem!important}
  .workspace-task-row.is-subtask{width:calc(100% - 8px)!important;margin-left:8px!important}
  .task-table-title{padding-left:0!important}
  .task-priority-chip,.task-status-chip{min-width:0}
  .task-list-pagination{padding:12px;width:100%;overflow:hidden}
  .task-list-pagination .pagination{max-width:100%;gap:2px}
  .task-list-pagination .page-link{min-width:30px;padding-inline:8px}
  .task-workspace .modal-footer{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .task-workspace .modal-footer>*{margin:0!important}
  .subtask-detail-item{margin-left:0!important}
}
@media(max-width:380px){
  .workspace-hero>div:last-child{grid-template-columns:1fr}
  .workspace-metric .card-body{align-items:flex-start;flex-direction:column}
}
`;

const readOnlyStyles = `
.project-action-button{pointer-events:none!important;opacity:.45!important}
.task-workspace~.modal .modal-footer .btn:not(:first-child){display:none!important}
`;
