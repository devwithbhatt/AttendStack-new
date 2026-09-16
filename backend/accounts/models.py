"""
AttendStack – Custom User Model
Roles: SUPER_ADMIN | HR | EMPLOYEE
"""

import uuid
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserRole(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
    HR          = "HR",          "HR Manager / Company Admin"
    SUB_ADMIN   = "SUB_ADMIN",   "Sub-Admin / Limited Access"
    EMPLOYEE    = "EMPLOYEE",    "Employee"


class UserManager(BaseUserManager):
    """Custom manager that uses email as the unique identifier."""

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email address is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", UserRole.EMPLOYEE)
        return self._create_user(email, password, **extra_fields)

    def create_hr(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields["role"] = UserRole.HR
        return self._create_user(email, password, **extra_fields)

    def create_sub_admin(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields["role"] = UserRole.SUB_ADMIN
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields["role"] = UserRole.SUPER_ADMIN
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    AttendStack custom user model.
    Roles: SUPER_ADMIN, HR, SUB_ADMIN, EMPLOYEE
    """

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email      = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name  = models.CharField(max_length=100, blank=True)
    role       = models.CharField(
        max_length=20, choices=UserRole.choices, default=UserRole.EMPLOYEE
    )
    phone      = models.CharField(max_length=15, blank=True, null=True)
    avatar     = models.ImageField(upload_to="avatars/", blank=True, null=True)

    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)

    date_joined = models.DateTimeField(default=timezone.now)
    last_login  = models.DateTimeField(blank=True, null=True)

    # Employee gets an auto-generated employee_id (set by employees app signal)
    employee_id = models.CharField(max_length=20, unique=True, blank=True, null=True)

    objects = UserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name        = "User"
        verbose_name_plural = "Users"
        ordering            = ["-date_joined"]

    def __str__(self):
        return f"{self.get_full_name()} <{self.email}> [{self.role}]"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self):
        return self.first_name

    @property
    def is_super_admin(self):
        return self.role == UserRole.SUPER_ADMIN

    @property
    def is_hr(self):
        return self.role == UserRole.HR

    @property
    def is_company_admin(self):
        return self.role == UserRole.HR

    @property
    def is_sub_admin(self):
        return self.role == UserRole.SUB_ADMIN

    @property
    def is_employee(self):
        return self.role == UserRole.EMPLOYEE


class SubAdminPermission(models.Model):
    """
    Multi-tenant Granular Role-Based Access Control (RBAC) permissions.
    Assigned to a SUB_ADMIN User for a specific Organization workspace.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subadmin_profile",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="subadmin_permissions",
    )
    custom_role_title = models.CharField(
        max_length=120,
        default="HR Manager",
        help_text="Display title e.g. HR Manager, Attendance Supervisor, Payroll Officer"
    )
    permissions = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Sub-Admin Permission"
        verbose_name_plural = "Sub-Admin Permissions"

    def __str__(self):
        return f"{self.user.email} - {self.custom_role_title} ({self.organization.name})"

    @classmethod
    def get_default_permissions(cls):
        return {
            "dashboard": {"view": True, "edit": False, "delete": False},
            "employees": {"view": True, "edit": True, "delete": False},
            "attendance": {"view": True, "edit": True, "delete": False},
            "leaves": {"view": True, "edit": True, "delete": False},
            "holidays": {"view": True, "edit": True, "delete": False},
            "payroll": {"view": False, "edit": False, "delete": False},
            "increments": {"view": False, "edit": False, "delete": False},
            "tasks": {"view": True, "edit": True, "delete": False},
            "chat": {"view": True, "edit": True, "delete": False},
            "settings": {"view": False, "edit": False, "delete": False},
        }

    def save(self, *args, **kwargs):
        if not self.permissions:
            self.permissions = self.get_default_permissions()
        super().save(*args, **kwargs)

    def has_permission(self, module: str, action: str = "view") -> bool:
        if not self.permissions or not isinstance(self.permissions, dict):
            return False
        mod_perms = self.permissions.get(module, {})
        if isinstance(mod_perms, dict):
            return bool(mod_perms.get(action, False))
        return bool(mod_perms)


class PasswordResetOTP(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_otps",
    )
    otp_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False, db_index=True)
    requested_ip = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    used_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_used", "created_at"]),
        ]

    def __str__(self):
        return f"Password reset request for {self.user.email}"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at
