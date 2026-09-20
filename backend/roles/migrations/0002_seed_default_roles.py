"""
Data migration: bring existing accounts onto the new dynamic Role system
without changing anyone's effective permissions.

- Every Organization gets a seeded, non-deletable "Admin" role (full access).
- Every existing HR user (who today gets blanket full access via hardcoded
  role checks) is assigned that Admin role, so they keep full access.
- Every existing SubAdminPermission (the old one-role-per-user system) becomes
  a proper, named, reusable Role with the same permission matrix, and that
  user is linked to it — so nothing about what they can already do changes.
"""
from django.db import migrations


MODULE_KEY_ALIASES = {
    # Old SubAdminPermission.get_default_permissions() used "increments" as its
    # own key; the new registry folds that into "payroll".
    "increments": "payroll",
}


def seed_default_roles(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    User = apps.get_model("accounts", "User")
    Role = apps.get_model("roles", "Role")
    RolePermission = apps.get_model("roles", "RolePermission")
    SubAdminPermission = apps.get_model("accounts", "SubAdminPermission")

    HR = "HR"
    SUPER_ADMIN = "SUPER_ADMIN"

    admin_role_by_org = {}

    def get_or_create_admin_role(organization):
        if organization.id in admin_role_by_org:
            return admin_role_by_org[organization.id]
        role, _ = Role.objects.get_or_create(
            organization=organization,
            name="Admin",
            defaults={"description": "Complete access to every module.", "is_admin": True, "is_system": True},
        )
        if not role.is_admin or not role.is_system:
            role.is_admin = True
            role.is_system = True
            role.save(update_fields=["is_admin", "is_system"])
        admin_role_by_org[organization.id] = role
        return role

    # 1. Seed an Admin role for every organization that already exists.
    for organization in Organization.objects.all():
        get_or_create_admin_role(organization)

    # 2. Existing HR users -> their organization's Admin role (preserves their
    #    current blanket full-access behavior exactly).
    for user in User.objects.filter(role=HR, custom_role__isnull=True):
        organization = Organization.objects.filter(owner=user).first()
        if not organization:
            continue
        user.custom_role = get_or_create_admin_role(organization)
        user.save(update_fields=["custom_role"])

    # 3. Existing per-user SubAdminPermission records -> proper reusable Roles.
    for sub_perm in SubAdminPermission.objects.select_related("user", "organization").all():
        if sub_perm.user.custom_role_id:
            continue
        base_name = (sub_perm.custom_role_title or "Sub-Admin").strip() or "Sub-Admin"
        name = base_name
        suffix = 2
        while Role.objects.filter(organization=sub_perm.organization, name__iexact=name).exists():
            name = f"{base_name} ({suffix})"
            suffix += 1

        role = Role.objects.create(
            organization=sub_perm.organization,
            name=name,
            description=f"Migrated from legacy sub-admin permissions for {sub_perm.user.email}.",
        )
        permissions = sub_perm.permissions or {}
        for module, flags in permissions.items():
            module_key = MODULE_KEY_ALIASES.get(module, module)
            if not isinstance(flags, dict):
                continue
            existing = RolePermission.objects.filter(role=role, module=module_key).first()
            can_view = bool(flags.get("view", False)) or (existing.can_view if existing else False)
            can_edit = bool(flags.get("edit", False)) or (existing.can_edit if existing else False)
            can_delete = bool(flags.get("delete", False)) or (existing.can_delete if existing else False)
            RolePermission.objects.update_or_create(
                role=role,
                module=module_key,
                defaults={"can_view": can_view, "can_edit": can_edit, "can_delete": can_delete},
            )

        sub_perm.user.custom_role_id = role.id
        sub_perm.user.save(update_fields=["custom_role"])


def noop_reverse(apps, schema_editor):
    # Intentionally not reversed: unpicking which roles were auto-generated
    # vs. hand-created afterward isn't safe to infer.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("roles", "0001_initial"),
        ("accounts", "0005_user_custom_role"),
        ("organizations", "0007_plan_allows_attendance_plan_allows_chat_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_default_roles, noop_reverse),
    ]
