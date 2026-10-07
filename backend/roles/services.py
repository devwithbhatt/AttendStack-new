from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import UserRole
from organizations.services import get_organization_for_user

from .models import Role
from .registry import MODULE_LABELS


def ensure_can_grant(acting_user, *, is_admin=False, matrix=None):
    """A manager without full access may only hand out access they hold
    themselves — never full access, never a module/action their own Role
    lacks. Stops someone with only "Employees" or "Roles" rights from
    promoting themselves (or a friend) to Admin."""
    if acting_user.is_admin_account:
        return
    if is_admin:
        raise PermissionDenied("Only a full-access admin can grant full access.")
    from accounts.permissions import check_user_module_permission

    for module, flags in (matrix or {}).items():
        for action in ("view", "edit", "delete"):
            if flags.get(action) and not check_user_module_permission(acting_user, module, action):
                label = MODULE_LABELS.get(module, module)
                raise PermissionDenied(f"You can't grant {action} access to {label} — your own role doesn't have it.")


def _ensure_may_change(acting_user, target_user):
    if acting_user.is_admin_account:
        return
    if acting_user.pk == target_user.pk:
        raise PermissionDenied("You can't change your own role. Ask a full-access admin.")
    if target_user.is_admin_account:
        raise PermissionDenied("Only a full-access admin can change another admin's role.")


def assign_role_to_user(acting_user, target_user, role: Role):
    """Assign `role` to `target_user`, enforcing the same-organization and
    Super-Admin-is-untouchable rules regardless of which endpoint calls this."""
    if target_user.role == UserRole.SUPER_ADMIN:
        raise ValidationError({"detail": "Super Admin accounts cannot be reassigned a role."})
    _ensure_may_change(acting_user, target_user)
    ensure_can_grant(acting_user, is_admin=role.is_admin, matrix=role.permissions_dict())

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


def unassign_role_from_user(target_user, acting_user=None):
    if target_user.role == UserRole.SUPER_ADMIN:
        raise ValidationError({"detail": "Super Admin accounts cannot be modified here."})
    if acting_user is not None:
        _ensure_may_change(acting_user, target_user)
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
