"""
accounts – permissions
Custom DRF permission classes for multi-tenant role-based access control (RBAC).
Roles: SUPER_ADMIN | HR | SUB_ADMIN | EMPLOYEE
"""

from rest_framework.permissions import BasePermission
from accounts.models import UserRole


def check_user_module_permission(user, module: str, action: str = "view") -> bool:
    """Check whether a user has permission to view, edit, or delete a specific module."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.role in (UserRole.SUPER_ADMIN, UserRole.HR):
        return True
    if user.role == UserRole.SUB_ADMIN:
        subadmin_profile = getattr(user, "subadmin_profile", None)
        if not subadmin_profile:
            from accounts.models import SubAdminPermission
            subadmin_profile = SubAdminPermission.objects.filter(user=user).first()
        if subadmin_profile:
            return subadmin_profile.has_permission(module, action)
    return False


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
    """Only HR Managers / Company Admins."""
    message = "Access restricted to Company HR Managers only."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == UserRole.HR or request.user.role == UserRole.SUPER_ADMIN)
        )


class IsAdminOrHR(BasePermission):
    """SUPER_ADMIN, HR Managers, or Sub-Admins with module access."""
    message = "Access restricted to Admin or HR roles."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or request.user.role in (UserRole.SUPER_ADMIN, UserRole.HR):
            return True
        if request.user.role == UserRole.SUB_ADMIN:
            module = getattr(view, "permission_module", None)
            if not module:
                return True
            action = "view" if request.method in ("GET", "HEAD", "OPTIONS") else ("delete" if request.method == "DELETE" else "edit")
            return check_user_module_permission(request.user, module, action)
        return False


class HasModulePermission(BasePermission):
    """
    Granular permission check for Sub-Admins.
    Checks view.permission_module and request HTTP method (GET=view, POST/PUT/PATCH=edit, DELETE=delete).
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
        if user.is_superuser or user.role in (UserRole.SUPER_ADMIN, UserRole.HR):
            return True
        if user.role == UserRole.SUB_ADMIN:
            module = getattr(view, "permission_module", self.module)
            if not module:
                return True
            action = self.action
            if not action:
                if request.method in ("GET", "HEAD", "OPTIONS"):
                    action = "view"
                elif request.method == "DELETE":
                    action = "delete"
                else:
                    action = "edit"
            return check_user_module_permission(user, module, action)
        return False


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
    Object-level: the resource owner, any HR, Sub-Admin, or Super Admin may access.
    Attach `user` field on the object for ownership check.
    """

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role in (UserRole.SUPER_ADMIN, UserRole.HR):
            return True
        if request.user.role == UserRole.SUB_ADMIN:
            module = getattr(view, "permission_module", None)
            if not module:
                return True
            action = "view" if request.method in ("GET", "HEAD", "OPTIONS") else ("delete" if request.method == "DELETE" else "edit")
            return check_user_module_permission(request.user, module, action)
        owner = getattr(obj, "user", None) or getattr(obj, "employee", None)
        if owner is not None:
            user_obj = getattr(owner, "user", owner)
            return user_obj == request.user
        return False
