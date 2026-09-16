import secrets
from django.conf import settings
from django.db import models
from django.utils import timezone


def generate_invite_code():
    """Generate a short, human-friendly code employees can use to join."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "ORG-" + "".join(secrets.choice(alphabet) for _ in range(8))


def generate_api_key():
    """Generate a secure prefixed API Key for external integrations."""
    return "astk_live_" + secrets.token_hex(20)


class Organization(models.Model):
    class PlanStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        EXPIRING_SOON = "EXPIRING_SOON", "Expiring Soon"
        EXPIRED = "EXPIRED", "Expired"

    name = models.CharField(max_length=255)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="owned_organizations",
        blank=True,
        null=True,
    )
    external_source = models.CharField(max_length=40, blank=True)
    external_company_id = models.CharField(
        max_length=64,
        unique=True,
        blank=True,
        null=True,
        db_index=True,
    )
    api_key = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        db_index=True,
        default=generate_api_key,
    )
    phone = models.CharField(max_length=40, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    website = models.URLField(blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    industry = models.CharField(max_length=120, blank=True, null=True)
    plan_name = models.CharField(max_length=100, blank=True, null=True, default="Standard Plan")
    plan_expires_at = models.DateTimeField(blank=True, null=True)
    plan_status = models.CharField(
        max_length=20,
        choices=PlanStatus.choices,
        default=PlanStatus.ACTIVE,
    )
    plan_source = models.CharField(max_length=40, default="ATTENDSTACK_DIRECT", blank=True)
    max_employees = models.IntegerField(default=50)
    invite_code = models.CharField(
        max_length=12,
        unique=True,
        db_index=True,
        default=generate_invite_code,
        editable=False,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def _get_parsed_expiry(self):
        if not self.plan_expires_at:
            return None
        if isinstance(self.plan_expires_at, str):
            from django.utils.dateparse import parse_datetime
            return parse_datetime(self.plan_expires_at)
        return self.plan_expires_at

    @property
    def is_plan_expired(self) -> bool:
        exp = self._get_parsed_expiry()
        if not exp:
            return False
        return timezone.now() > exp

    @property
    def days_until_plan_expiry(self) -> int | None:
        exp = self._get_parsed_expiry()
        if not exp:
            return None
        diff = (exp - timezone.now()).total_seconds()
        return max(0, int(diff // 86400))

    @property
    def is_plan_expiring_soon(self) -> bool:
        if not self.plan_expires_at:
            return False
        days = self.days_until_plan_expiry
        return days is not None and 0 <= days <= 7 and not self.is_plan_expired

    @property
    def computed_plan_status(self) -> str:
        if self.is_plan_expired:
            return "EXPIRED"
        if self.is_plan_expiring_soon:
            return "EXPIRING_SOON"
        return "ACTIVE"

    def save(self, *args, **kwargs):
        if not self.api_key:
            self.api_key = generate_api_key()
        # Automatically update plan_status based on plan_expires_at
        self.plan_status = self.computed_plan_status
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Plan(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    max_employees = models.IntegerField(default=50, help_text="-1 for unlimited")
    badge_text = models.CharField(max_length=50, blank=True, default="")
    is_popular = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    # Granular Feature Access Controls (matching AttendStack Sidebar Modules)
    allows_employees = models.BooleanField(default=True, help_text="Employees Directory & Profiles")
    allows_attendance = models.BooleanField(default=True, help_text="Daily Attendance & Live Punches")
    allows_geofencing = models.BooleanField(default=False, help_text="Office IP Shield & GPS Geofencing")
    allows_holidays = models.BooleanField(default=True, help_text="Holiday Calendar Management")
    allows_payroll_reports = models.BooleanField(default=False, help_text="Salary & Payroll Processing")
    allows_leaves = models.BooleanField(default=True, help_text="Leave Requests & Approval Workflow")
    allows_projects_tasks = models.BooleanField(default=False, help_text="Projects & Tasks Workspace")
    allows_chat = models.BooleanField(default=False, help_text="Team Chat & Direct Messaging (Beta)")
    allows_custom_shifts = models.BooleanField(default=False, help_text="Multi-Shift & Late Rulebooks")
    allows_auto_checkout = models.BooleanField(default=False, help_text="Auto-Checkout & Shift Logic")
    allows_dedicated_api = models.BooleanField(default=False, help_text="Dedicated API Key & Webhooks")
    allows_simplyjob_sync = models.BooleanField(default=True, help_text="SimplyJob Candidate Sync Engine")

    # Custom Feature bullets JSON / text list
    features_list = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "monthly_price"]

    def __str__(self):
        return f"{self.name} (₹{self.monthly_price}/mo)"

