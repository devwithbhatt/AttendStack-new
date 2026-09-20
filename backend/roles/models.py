import uuid

from django.db import models

from .registry import MODULE_KEYS


class Role(models.Model):
    """
    A named, reusable set of permissions (Employee -> Role -> Module -> Permission).

    Assign the same Role to any number of employees; editing the Role's
    permissions immediately changes what every assigned employee can do.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="roles",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    # An Admin role always has full access to every module, regardless of the
    # individual RolePermission rows below (matches "Admin has complete access").
    is_admin = models.BooleanField(default=False)

    # System roles (currently just the seeded "Admin" role for each organization)
    # cannot be deleted, to guarantee every organization always has a working
    # full-access role available.
    is_system = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_admin", "name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "name"], name="unique_role_name_per_organization"),
        ]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"

    def has_permission(self, module: str, action: str = "view") -> bool:
        if self.is_admin:
            return True
        perm = self.module_permissions.filter(module=module).first()
        if not perm:
            return False
        return bool(getattr(perm, f"can_{action}", False))

    def permissions_dict(self):
        """{module_key: {view, edit, delete}} for every module, defaulting closed."""
        if self.is_admin:
            return {key: {"view": True, "edit": True, "delete": True} for key in MODULE_KEYS}
        by_module = {p.module: p for p in self.module_permissions.all()}
        result = {}
        for key in MODULE_KEYS:
            perm = by_module.get(key)
            result[key] = {
                "view": bool(perm.can_view) if perm else False,
                "edit": bool(perm.can_edit) if perm else False,
                "delete": bool(perm.can_delete) if perm else False,
            }
        return result


class RolePermission(models.Model):
    """One row = one module's View/Edit/Delete flags for a given Role."""

    id = models.BigAutoField(primary_key=True)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="module_permissions")
    module = models.CharField(max_length=50)
    can_view = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["role", "module"], name="unique_module_permission_per_role"),
        ]

    def __str__(self):
        return f"{self.role.name} · {self.module} (v={self.can_view} e={self.can_edit} d={self.can_delete})"

    def save(self, *args, **kwargs):
        # Editing something you can't view doesn't make sense; deleting
        # something you can't edit doesn't either. Keep the matrix consistent.
        if self.can_delete:
            self.can_edit = True
        if self.can_edit:
            self.can_view = True
        super().save(*args, **kwargs)
