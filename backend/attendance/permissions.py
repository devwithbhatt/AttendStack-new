from rest_framework.permissions import BasePermission, SAFE_METHODS
from accounts.models import UserRole
from accounts.permissions import check_user_module_permission, action_for_request


class IsAdminOrReadOnly(BasePermission):
    """
    Write access is gated by the acting user's module permission (dynamic Role,
    or legacy HR/Sub-Admin fallback); everyone authenticated can read (actual
    row-level scoping — e.g. an employee only ever seeing their own records —
    happens in each view's get_queryset).
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or request.user.role == UserRole.SUPER_ADMIN:
            return True
        if request.user.role in (UserRole.HR, UserRole.SUB_ADMIN):
            module = getattr(view, "permission_module", "attendance")
            return check_user_module_permission(request.user, module, action_for_request(request))
        if request.method in SAFE_METHODS:
            return True
        return False
