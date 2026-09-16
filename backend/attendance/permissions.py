from rest_framework.permissions import BasePermission, SAFE_METHODS
from accounts.models import UserRole


class IsAdminOrReadOnly(BasePermission):
    """
    Custom permission to only allow admins or HR (or authorized sub-admins) to edit attendance records.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or request.user.role in (UserRole.SUPER_ADMIN, UserRole.HR) or request.user.is_staff:
            return True
        if request.user.role == UserRole.SUB_ADMIN:
            module = getattr(view, "permission_module", "attendance")
            action = "view" if request.method in SAFE_METHODS else ("delete" if request.method == "DELETE" else "edit")
            from accounts.permissions import check_user_module_permission
            return check_user_module_permission(request.user, module, action)
        if request.method in SAFE_METHODS:
            return True
        return False