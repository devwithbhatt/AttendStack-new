from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import UserRole
from organizations.services import get_organization_for_user

from .models import Role


def assign_role_to_user(acting_user, target_user, role: Role):
    """Assign `role` to `target_user`, enforcing the same-organization and
    Super-Admin-is-untouchable rules regardless of which endpoint calls this."""
    if target_user.role == UserRole.SUPER_ADMIN:
        raise ValidationError({"detail": "Super Admin accounts cannot be reassigned a role."})

    acting_org = get_organization_for_user(acting_user)
    if acting_org and role.organization_id != acting_org.id:
        raise PermissionDenied("That role does not belong to your organization.")

    target_org = get_organization_for_user(target_user)
    if acting_org and target_org and target_org.id != acting_org.id:
        raise PermissionDenied("That user belongs to a different organization.")

    target_user.role = UserRole.SUB_ADMIN
    target_user.is_staff = True
    target_user.custom_role = role
    target_user.save(update_fields=["role", "is_staff", "custom_role"])
    return target_user


def unassign_role_from_user(target_user):
    if target_user.role == UserRole.SUPER_ADMIN:
        raise ValidationError({"detail": "Super Admin accounts cannot be modified here."})
    target_user.custom_role = None
    target_user.role = UserRole.EMPLOYEE
    target_user.save(update_fields=["role", "custom_role"])
    return target_user


def ensure_admin_role(organization) -> Role:
    """Get-or-create the seeded, non-deletable full-access Admin role for an organization."""
    role, _ = Role.objects.get_or_create(
        organization=organization,
        name="Admin",
        defaults={"description": "Complete access to every module.", "is_admin": True, "is_system": True},
    )
    if not role.is_admin or not role.is_system:
        role.is_admin = True
        role.is_system = True
        role.save(update_fields=["is_admin", "is_system"])
    return role
