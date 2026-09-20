"""
accounts – permissions
Custom DRF permission classes for multi-tenant role-based access control (RBAC).

Roles: SUPER_ADMIN | HR | SUB_ADMIN | EMPLOYEE (coarse Django-level bucket, used
for login/auth flows and to decide *whether* a user is a manager-type account
at all).

On top of that, any HR or SUB_ADMIN user can be assigned a dynamic `Role`
(see the `roles` app) whose per-module View/Edit/Delete matrix is the single
source of truth for what they can actually do. `check_user_module_permission`
below is the one function every permission class in this project funnels
through — never hardcode `if user.role == "HR"` checks elsewhere; add the
module to roles.registry.MODULE_REGISTRY and gate it through this function
(or one of the permission classes below) instead.
"""

from rest_framework.permissions import BasePermission
from accounts.models import UserRole


def check_user_module_permission(user, module: str, action: str = "view") -> bool:
    """
    Check whether a user has permission to view, edit, or delete a specific module.

    Resolution order:
    1. Django superuser / SUPER_ADMIN -> always allowed (the one hardcoded
       exception; a true super admin must never be lockable out of their own
       platform by a misconfigured role).
    2. A dynamic `custom_role` assigned -> that Role's permission matrix decides.
    3. Legacy fallback for accounts that predate the dynamic Role system and
       have not been assigned one yet: HR -> full access, SUB_ADMIN -> their
       old per-user SubAdminPermission JSON blob.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.role == UserRole.SUPER_ADMIN:
        return True

    custom_role = getattr(user, "custom_role", None)
    if custom_role is not None:
        return custom_role.has_permission(module, action)

    # ---- Legacy fallback (pre-dynamic-RBAC accounts only) ----
    if user.role == UserRole.HR:
        return True
    if user.role == UserRole.SUB_ADMIN:
        subadmin_profile = getattr(user, "subadmin_profile", None)
        if not subadmin_profile:
            from accounts.models import SubAdminPermission
            subadmin_profile = SubAdminPermission.objects.filter(user=user).first()
        if subadmin_profile:
            return subadmin_profile.has_permission(module, action)
    return False


def action_for_request(request) -> str:
    """Map an HTTP method to a permission action: view / edit / delete."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return "view"
    if request.method == "DELETE":
        return "delete"
    return "edit"


class IsSuperAdmin(BasePermission):
    """Only SUPER_ADMIN users."""
    message = "Access restricted to Super Admins only."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_superuser or request.user.role == UserRole.SUPER_ADMIN)
        )


class IsHR(BasePermission):
    """Only HR Managers / Company Admins (or Super Admin) — deliberately excludes
    Sub-Admin/custom-role accounts, which must instead be gated per-module via
    HasModulePermission/IsAdminOrHR. Kept unchanged for endpoints that were
    already HR-only before the dynamic Role system existed."""
    message = "Access restricted to Company HR Managers only."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == UserRole.HR or request.user.role == UserRole.SUPER_ADMIN)
        )


class IsAdminOrHR(BasePermission):
    """SUPER_ADMIN, or HR/Sub-Admin accounts subject to their assigned Role's
    module permissions."""
    message = "You do not have permission to access this module."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == UserRole.SUPER_ADMIN:
            return True
        if user.role in (UserRole.HR, UserRole.SUB_ADMIN):
            module = getattr(view, "permission_module", None)
            if not module:
                return True
            return check_user_module_permission(user, module, action_for_request(request))
        return False


class HasModulePermission(BasePermission):
    """
    Granular permission check driven by view.permission_module and the
    request's HTTP method (GET=view, POST/PUT/PATCH=edit, DELETE=delete).
    """
    module = None
    action = None

    def __init__(self, module=None, action=None):
        if module:
            self.module = module
        if action:
            self.action = action

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == UserRole.SUPER_ADMIN:
            return True
        if user.role in (UserRole.HR, UserRole.SUB_ADMIN):
            module = getattr(view, "permission_module", self.module)
            if not module:
                return True
            action = self.action or action_for_request(request)
            return check_user_module_permission(user, module, action)
        return False


class IsAdminOrEmployeeSelfService(BasePermission):
    """
    For modules where plain Employees have genuine self-service access (e.g.
    managing their own tasks) alongside HR/Sub-Admin management access:
    - SUPER_ADMIN: always allowed.
    - HR / SUB_ADMIN: gated by their assigned Role's module permission
      (view/edit/delete based on HTTP method) — NOT automatically full access.
    - EMPLOYEE: allowed at this layer; the view itself must scope results/
      actions to the employee's own records.
    """
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == UserRole.SUPER_ADMIN:
            return True
        if user.role in (UserRole.HR, UserRole.SUB_ADMIN):
            module = getattr(view, "permission_module", None)
            if not module:
                return True
            return check_user_module_permission(user, module, action_for_request(request))
        return True


class IsEmployee(BasePermission):
    """Only regular Employees."""
    message = "Access restricted to Employees."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == UserRole.EMPLOYEE
        )


class IsOwnerOrAdminOrHR(BasePermission):
    """
    Object-level: the resource owner, or an HR/Sub-Admin/Super Admin account
    with the relevant module permission, may access.
    Attach `user` field on the object for ownership check.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == UserRole.SUPER_ADMIN:
            return True
        if user.role in (UserRole.HR, UserRole.SUB_ADMIN):
            module = getattr(view, "permission_module", None)
            if not module:
                return True
            return check_user_module_permission(user, module, action_for_request(request))
        owner = getattr(obj, "user", None) or getattr(obj, "employee", None)
        if owner is not None:
            user_obj = getattr(owner, "user", owner)
            return user_obj == request.user
        return False
