"""
Dynamic module registry for the RBAC system.

Every module a role can be granted View/Edit/Delete permission on is listed
here. To expose a new dashboard module to the Role & Permission Management UI,
add one entry here — no other code needs to change; the module immediately
shows up in the role editor and can be checked with `check_user_module_permission`.

`key` must match the `permission_module` attribute used by the corresponding
DRF views (see accounts/permissions.py: check_user_module_permission).
"""

MODULE_REGISTRY = [
    {"key": "dashboard", "label": "Dashboard", "description": "Admin dashboard overview and stats"},
    {"key": "employees", "label": "Employees", "description": "Employee directory, profiles, and records"},
    {"key": "attendance", "label": "Attendance", "description": "Attendance records, check-in/check-out, shifts"},
    {"key": "leaves", "label": "Leaves", "description": "Leave requests and approvals"},
    {"key": "holidays", "label": "Holidays", "description": "Company holiday calendar"},
    {"key": "payroll", "label": "Salary & Payroll", "description": "Payroll records and salary increments"},
    {"key": "tasks", "label": "Projects & Tasks", "description": "Projects and task management"},
    # Chat & Messages is intentionally NOT permission-gated — every employee
    # has full access to it regardless of role, so it's excluded from the
    # Role & Permission Management UI entirely.
    {"key": "settings", "label": "Settings", "description": "Company profile, attendance rules, system settings"},
    {"key": "subadmins", "label": "Role & Permission Management", "description": "Create roles and assign them to employees"},
]

MODULE_KEYS = [module["key"] for module in MODULE_REGISTRY]

MODULE_LABELS = {module["key"]: module["label"] for module in MODULE_REGISTRY}


def default_permission_matrix(all_true: bool = False):
    """A fresh {module_key: {view, edit, delete}} matrix, all off unless all_true."""
    return {
        key: {"view": all_true, "edit": all_true, "delete": all_true}
        for key in MODULE_KEYS
    }
