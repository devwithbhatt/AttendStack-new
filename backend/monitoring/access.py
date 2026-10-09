"""Who may see which monitored devices.

Full-access admins (Super Admin, the company owner/HR admin, any Role flagged
Full Access) see every device in their company. Anyone else needs the
"monitoring" module on their Role (Settings -> Assign Role) and never sees
the devices of full-access admins — monitoring is a duty over employees,
not over the people who assign it.
"""
from django.db.models import Q

from accounts.permissions import check_user_module_permission

# Devices whose owner is a full-access admin (mirrors User.is_admin_account).
ADMIN_OWNED = (
    Q(user__is_superuser=True)
    | Q(user__role="SUPER_ADMIN")
    | Q(user__custom_role__is_admin=True)
    | Q(user__custom_role__isnull=True, user__role="HR")
)


def is_full_monitor(user) -> bool:
    return bool(user.is_superuser or getattr(user, "role", "") == "SUPER_ADMIN" or getattr(user, "is_admin_account", False))


def can_monitor(user, action: str = "view") -> bool:
    return is_full_monitor(user) or check_user_module_permission(user, "monitoring", action)


def visible_devices(user, queryset):
    """Narrow a MonitoredDevice queryset to what `user` may see."""
    if is_full_monitor(user):
        return queryset
    if not check_user_module_permission(user, "monitoring", "view"):
        return queryset.none()
    return queryset.exclude(ADMIN_OWNED)
