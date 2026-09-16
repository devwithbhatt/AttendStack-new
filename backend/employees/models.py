import uuid

from django.core.validators import RegexValidator
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models, transaction
from django.db.models.functions import Coalesce
from django.utils import timezone

from organizations.models import Organization



class EmployeeStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    PROVISION = "PROVISION", "Provision"
    ON_LEAVE = "ON_LEAVE", "On Leave"
    NOTICE_PERIOD = "NOTICE_PERIOD", "Notice Period"
    INACTIVE = "INACTIVE", "Inactive"
    TERMINATED = "TERMINATED", "Terminated"


ATTENDANCE_ELIGIBLE_STATUSES = (
    EmployeeStatus.ACTIVE,
    EmployeeStatus.PROVISION,
    EmployeeStatus.ON_LEAVE,
    EmployeeStatus.NOTICE_PERIOD,
)

ATTENDANCE_WORKING_STATUSES = (
    EmployeeStatus.ACTIVE,
    EmployeeStatus.PROVISION,
    EmployeeStatus.NOTICE_PERIOD,
)


class EmployeeQuerySet(models.QuerySet):
    def attendance_eligible_on(self, attendance_date):
        """Employees whose latest status on a date permits attendance."""
        latest_status = EmployeeStatusHistory.objects.filter(
            employee_id=models.OuterRef("pk"),
            effective_date__lte=attendance_date,
        ).order_by("-effective_date", "-created_at", "-pk")

        return self.annotate(
            attendance_status_on_date=Coalesce(
                models.Subquery(latest_status.values("status")[:1]),
                models.F("status"),
                output_field=models.CharField(),
            )
        ).filter(attendance_status_on_date__in=ATTENDANCE_ELIGIBLE_STATUSES)


class EmploymentType(models.TextChoices):
    FULL_TIME = "FULL_TIME", "Full-time"
    PART_TIME = "PART_TIME", "Part-time"
    CONTRACT = "CONTRACT", "Contract"
    INTERN = "INTERN", "Intern"


class PayFrequency(models.TextChoices):
    MONTHLY = "MONTHLY", "Monthly"
    WEEKLY = "WEEKLY", "Weekly"
    BI_WEEKLY = "BI_WEEKLY", "Bi-Weekly"


class Employee(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="employees", null=True
    )
    external_source = models.CharField(max_length=40, blank=True)
    external_application_id = models.CharField(
        max_length=64,
        unique=True,
        blank=True,
        null=True,
        db_index=True,
    )
    external_payload = models.JSONField(default=dict, blank=True)
    employee_id = models.CharField(max_length=30, unique=True, db_index=True, blank=True)

    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True, db_index=True)
    phone = models.CharField(
        max_length=15,
        validators=[RegexValidator(r"^\+?[0-9]{10,15}$", "Enter a valid phone number.")],
    )
    date_of_birth = models.DateField(blank=True, null=True)
    aadhaar_number = models.CharField(
        max_length=12,
        unique=True,
        blank=True,
        null=True,
        validators=[RegexValidator(r"^[0-9]{12}$", "Aadhaar number must be 12 digits.")],
    )
    address = models.TextField(blank=True)
    profile_photo = models.ImageField(upload_to="employees/photos/", blank=True, null=True)
    aadhaar_document = models.FileField(upload_to="employees/aadhaar/", blank=True, null=True)
    pan_card_document = models.FileField(upload_to="employees/pan/", blank=True, null=True)
    cv_document = models.FileField(upload_to="employees/cv/", blank=True, null=True)

    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_relationship = models.CharField(max_length=80, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)

    joining_date = models.DateField(default=timezone.localdate)
    department = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=120, blank=True)
    employment_type = models.CharField(
        max_length=20,
        choices=EmploymentType.choices,
        default=EmploymentType.FULL_TIME,
    )
    reporting_manager = models.CharField(max_length=150, blank=True)
    status = models.CharField(
        max_length=20,
        choices=EmployeeStatus.choices,
        default=EmployeeStatus.ACTIVE,
        db_index=True,
    )
    status_end_date = models.DateField(
        null=True, blank=True,
        help_text="Optional end date for status period (e.g. end of notice period or provision)."
    )
    auto_transition_status = models.CharField(
        max_length=20,
        choices=EmployeeStatus.choices,
        null=True, blank=True,
        help_text="Status to automatically transition to after status_end_date expires."
    )

    annual_salary = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    casual_leave_days_override = models.DecimalField(
        max_digits=5, decimal_places=1, blank=True, null=True,
        validators=[MinValueValidator(0), MaxValueValidator(365)],
        help_text="Optional annual Casual/PL entitlement. Blank uses company policy.",
    )
    sick_leave_days_override = models.DecimalField(
        max_digits=5, decimal_places=1, blank=True, null=True,
        validators=[MinValueValidator(0), MaxValueValidator(365)],
        help_text="Optional annual Sick Leave entitlement. Blank uses company policy.",
    )

    # Increment Management Override & Schedule Fields
    override_increment_policy = models.BooleanField(
        default=False,
        help_text="If checked, this employee uses custom increment settings instead of company defaults."
    )
    custom_increment_months = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Custom increment cycle interval in months."
    )
    custom_increment_type = models.CharField(
        max_length=20,
        choices=[("PERCENTAGE", "Percentage"), ("FLAT_AMOUNT", "Flat Amount (Rupees)")],
        null=True, blank=True,
        help_text="Custom calculation method for employee increment."
    )
    custom_increment_value = models.DecimalField(
        max_digits=10, decimal_places=2,
        null=True, blank=True,
        help_text="Custom increment value (percentage or rupee amount)."
    )
    increment_status = models.CharField(
        max_length=20,
        choices=[("ENABLED", "Enabled"), ("DISABLED", "Disabled")],
        default="ENABLED",
        help_text="Controls if increment processing is active for this employee."
    )
    last_increment_date = models.DateField(null=True, blank=True, help_text="Date of last approved increment.")
    next_increment_date = models.DateField(null=True, blank=True, help_text="Next expected due date for increment.")

    pay_frequency = models.CharField(
        max_length=20,
        choices=PayFrequency.choices,
        default=PayFrequency.MONTHLY,
    )
    bank_name = models.CharField(max_length=120, blank=True)
    bank_account_number = models.CharField(max_length=40, blank=True)
    ifsc_code = models.CharField(
        max_length=11,
        blank=True,
        validators=[RegexValidator(r"^$|^[A-Z]{4}0[A-Z0-9]{6}$", "Enter a valid 11-character IFSC code.")],
    )
    tax_id = models.CharField(max_length=20, blank=True)
    pan_number = models.CharField(max_length=20, blank=True, help_text="Permanent Account Number (PAN)")
    pf_number = models.CharField(max_length=50, blank=True, help_text="Provident Fund (PF) Account Number")
    uan_number = models.CharField(max_length=20, blank=True, help_text="Universal Account Number (UAN)")
    esic_number = models.CharField(max_length=30, blank=True, help_text="ESIC Insurance Number")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = EmployeeQuerySet.as_manager()

    class Meta:
        ordering = ["full_name"]
        indexes = [
            models.Index(fields=["department", "status"]),
            models.Index(fields=["joining_date"]),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.employee_id})"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        update_fields = kwargs.get("update_fields")
        status_is_saved = update_fields is None or "status" in update_fields
        previous_status = None
        if not is_new and status_is_saved:
            previous_status = Employee.objects.filter(pk=self.pk).values_list("status", flat=True).first()

        if not self.employee_id:
            last_emp = Employee.objects.filter(employee_id__startswith="EMP-").order_by("-employee_id").first()
            if last_emp:
                try:
                    last_num = int(last_emp.employee_id.split("-")[1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            while True:
                candidate_id = f"EMP-{new_num:05d}"
                if not Employee.objects.filter(employee_id=candidate_id).exists():
                    self.employee_id = candidate_id
                    break
                new_num += 1
                
        status_has_changed = is_new or (status_is_saved and previous_status != self.status) or hasattr(self, "_status_effective_date") or hasattr(self, "_status_end_date")
        if status_has_changed:
            end_date = getattr(self, "_status_end_date", self.status_end_date)
            auto_transition = getattr(self, "_auto_transition_status", self.auto_transition_status)
            if end_date and not auto_transition:
                if self.status == EmployeeStatus.NOTICE_PERIOD:
                    auto_transition = EmployeeStatus.INACTIVE
                elif self.status == EmployeeStatus.PROVISION:
                    auto_transition = EmployeeStatus.ACTIVE
            self.status_end_date = end_date
            self.auto_transition_status = auto_transition

            if update_fields is not None:
                update_fields_set = set(update_fields)
                update_fields_set.add("status_end_date")
                update_fields_set.add("auto_transition_status")
                kwargs["update_fields"] = list(update_fields_set)

        with transaction.atomic():
            super().save(*args, **kwargs)

            if status_has_changed or hasattr(self, "_status_effective_date"):
                default_effective_date = self.joining_date if is_new else timezone.localdate()
                effective_date = getattr(self, "_status_effective_date", default_effective_date)
                effective_date = max(effective_date, self.joining_date)
                end_date = self.status_end_date
                auto_transition = self.auto_transition_status

                # Delete any obsolete/conflicting records on or after effective_date for this employee
                EmployeeStatusHistory.objects.filter(
                    employee=self,
                    effective_date__gte=effective_date,
                ).delete()

                # Also delete any older duplicate records with the exact same status to prevent stale duplicates
                EmployeeStatusHistory.objects.filter(
                    employee=self,
                    status=self.status,
                ).delete()

                EmployeeStatusHistory.objects.create(
                    employee=self,
                    status=self.status,
                    effective_date=effective_date,
                    end_date=end_date,
                    auto_transition_status=auto_transition,
                )

                if end_date and auto_transition:
                    transition_date = end_date + timezone.timedelta(days=1)
                    EmployeeStatusHistory.objects.filter(
                        employee=self,
                        effective_date=transition_date,
                    ).delete()

                    EmployeeStatusHistory.objects.create(
                        employee=self,
                        status=auto_transition,
                        effective_date=transition_date,
                    )

            if hasattr(self, "_status_effective_date"):
                del self._status_effective_date
            if hasattr(self, "_status_end_date"):
                del self._status_end_date
            if hasattr(self, "_auto_transition_status"):
                del self._auto_transition_status

    def sync_status(self, today=None):
        """Syncs cached status fields on Employee with active status in status history for today."""
        if today is None:
            today = timezone.localdate()
        latest_history = (
            self.status_history.filter(effective_date__lte=today)
            .order_by("-effective_date", "-created_at", "-pk")
            .first()
        )
        if latest_history:
            updated_fields = []
            if self.status != latest_history.status:
                self.status = latest_history.status
                updated_fields.append("status")
            if self.status_end_date != latest_history.end_date:
                self.status_end_date = latest_history.end_date
                updated_fields.append("status_end_date")
            if self.auto_transition_status != latest_history.auto_transition_status:
                self.auto_transition_status = latest_history.auto_transition_status
                updated_fields.append("auto_transition_status")
            if updated_fields:
                updated_fields.append("updated_at")
                super().save(update_fields=updated_fields)
        return self.status

    def status_on(self, effective_date):
        prefetched_history = getattr(self, "_prefetched_objects_cache", {}).get("status_history")
        if prefetched_history is not None:
            matching_history = [
                entry for entry in prefetched_history if entry.effective_date <= effective_date
            ]
            if matching_history:
                return max(
                    matching_history,
                    key=lambda entry: (entry.effective_date, entry.created_at, entry.pk),
                ).status
            return self.status

        status = (
            self.status_history.filter(effective_date__lte=effective_date)
            .order_by("-effective_date", "-created_at", "-pk")
            .values_list("status", flat=True)
            .first()
        )
        return status or self.status

    def is_attendance_eligible_on(self, attendance_date):
        return self.status_on(attendance_date) in ATTENDANCE_ELIGIBLE_STATUSES


class EmployeeStatusHistory(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="status_history",
    )
    status = models.CharField(max_length=20, choices=EmployeeStatus.choices)
    effective_date = models.DateField(db_index=True)
    end_date = models.DateField(null=True, blank=True)
    auto_transition_status = models.CharField(
        max_length=20, choices=EmployeeStatus.choices, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["effective_date", "created_at", "pk"]
        indexes = [
            models.Index(fields=["employee", "effective_date"]),
        ]

    def __str__(self):
        return f"{self.employee.employee_id}: {self.get_status_display()} from {self.effective_date}"
