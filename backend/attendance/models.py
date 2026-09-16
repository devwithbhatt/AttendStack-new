import uuid
from datetime import timedelta, datetime

from django.db import models
from django.utils import timezone

from employees.models import Employee
from organizations.models import Organization
from settings.models import SystemSettings


AUTO_PRESERVED_STATUSES = frozenset([
    "LEAVE",
    "PAID_LEAVE",
    "HOLIDAY",
    "SUNDAY_PAID",
    "SUNDAY_UNPAID",
])


class AttendanceStatus(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    LATE = "LATE", "Late Entry"
    HALF_DAY = "HALF_DAY", "Half Day"
    ABSENT = "ABSENT", "Absent"
    LEAVE = "LEAVE", "Leave"
    PAID_LEAVE = "PAID_LEAVE", "Paid Leave"
    HOLIDAY = "HOLIDAY", "Holiday"
    SUNDAY_PAID = "SUNDAY_PAID", "Sunday"
    SUNDAY_UNPAID = "SUNDAY_UNPAID", "Sunday Unpaid"


class EarlyCheckoutPolicy(models.TextChoices):
    HALF_DAY = "HALF_DAY", "Half Day"
    PRO_RATED = "PRO_RATED", "Pro-Rated Salary Deduction"
    NONE = "NONE", "No Penalty"


class Shift(models.Model):
    """Company Shift model for multi-shift management."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="shifts",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=100, help_text="e.g. General Shift, Morning Shift, Night Shift")
    code = models.CharField(max_length=30, blank=True, help_text="e.g. GEN, MORN, NIGHT")
    start_time = models.TimeField(default="10:00:00")
    end_time = models.TimeField(default="18:00:00")
    late_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Grace period in minutes after shift start before marked late."
    )
    early_checkout_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Minutes before shift end allowed without early checkout penalty."
    )
    early_checkout_penalty = models.CharField(
        max_length=20,
        choices=EarlyCheckoutPolicy.choices,
        default=EarlyCheckoutPolicy.HALF_DAY,
        help_text="Policy applied when employee checks out before early checkout grace period."
    )
    min_hours_half_day = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=4.00,
        help_text="Minimum working hours required for half day credit."
    )
    min_hours_full_day = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=8.00,
        help_text="Minimum working hours required for full day credit."
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Designates this shift as the default for employees with no shift assigned."
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        s_time = self.start_time.strftime("%H:%M") if hasattr(self.start_time, "strftime") else str(self.start_time)
        e_time = self.end_time.strftime("%H:%M") if hasattr(self.end_time, "strftime") else str(self.end_time)
        return f"{self.name} ({s_time} - {e_time})"

    @classmethod
    def get_default_shift(cls, organization=None):
        """Returns default shift for organization or fallback active default, creating one if none exists."""
        qs = cls.objects.filter(is_active=True)
        if organization:
            org_default = qs.filter(organization=organization, is_default=True).first()
            if org_default:
                return org_default

        system_default = qs.filter(is_default=True).first()
        if system_default:
            return system_default

        # Auto-bootstrap default General Shift from SystemSettings if no default shift exists
        try:
            settings = SystemSettings.get_settings()
            return cls.objects.create(
                organization=organization,
                name="General Shift",
                code="GEN",
                start_time=settings.shift_start_time,
                end_time=settings.shift_end_time,
                late_grace_minutes=15,
                early_checkout_grace_minutes=getattr(settings, "early_checkout_grace_minutes", 15),
                early_checkout_penalty=getattr(settings, "early_checkout_penalty", EarlyCheckoutPolicy.HALF_DAY),
                min_hours_half_day=getattr(settings, "min_hours_half_day", 4.00),
                min_hours_full_day=getattr(settings, "min_hours_full_day", 8.00),
                is_default=True,
                is_active=True,
            )
        except Exception:
            return qs.first()


class AttendanceRecord(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )
    date = models.DateField(db_index=True)
    check_in = models.DateTimeField(blank=True, null=True)
    check_out = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=AttendanceStatus.choices,
        default=AttendanceStatus.PRESENT,
        db_index=True,
    )
    notes = models.TextField(blank=True)
    is_paid = models.BooleanField(default=True, help_text="Whether this day is paid in payroll")

    # Audit trail — security & compliance
    check_in_ip = models.GenericIPAddressField(
        null=True, blank=True,
        help_text="IP address used when employee checked in"
    )
    check_in_latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="GPS latitude at the time of check-in"
    )
    check_in_longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="GPS longitude at the time of check-in"
    )
    check_out_ip = models.GenericIPAddressField(
        null=True, blank=True,
        help_text="IP address used when employee checked out"
    )
    check_out_latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="GPS latitude at the time of check-out"
    )
    check_out_longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="GPS longitude at the time of check-out"
    )
    leave_request = models.ForeignKey(
        "attendance.LeaveRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_records",
        help_text="Leave request that created this attendance entry, when applicable",
    )
    shift = models.ForeignKey(
        "attendance.Shift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_records",
        help_text="Shift assigned for this attendance day",
    )
    early_departure_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Shortfall minutes if employee checked out before shift completion grace period."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "employee__full_name"]
        constraints = [
            models.UniqueConstraint(fields=["employee", "date"], name="unique_employee_attendance_date"),
        ]
        indexes = [
            models.Index(fields=["date", "status"]),
            models.Index(fields=["employee", "date"]),
        ]

    def __str__(self):
        return f"{self.employee.full_name} - {self.date}"

    @property
    def total_duration(self):
        if not self.check_in or not self.check_out:
            return None
        return self.check_out - self.check_in

    @property
    def total_hours(self):
        duration = self.total_duration
        if duration is None:
            return None
        total_minutes = int(duration.total_seconds() // 60)
        hours, minutes = divmod(total_minutes, 60)
        return f"{hours}h {minutes}m"

    @property
    def live_status(self):
        if self.status in [AttendanceStatus.ABSENT, AttendanceStatus.LEAVE, AttendanceStatus.PAID_LEAVE, AttendanceStatus.HOLIDAY, AttendanceStatus.SUNDAY_UNPAID]:
            return self.get_status_display()
        if self.check_in and not self.check_out:
            return "Clocked In"
        if self.check_in and self.check_out:
            return "Clocked Out"
        return self.get_status_display()

    def refresh_status(self):
        """Auto-compute status from check-in/check-out times.
        Only runs for time-based statuses. Admin-override statuses
        (Leave, Paid Leave, Holiday, Sunday Unpaid) are never touched."""
        if not self.check_in:
            self.status = AttendanceStatus.ABSENT
            self.is_paid = False
            return

        # Get current system settings for dynamic thresholds
        settings = SystemSettings.get_settings()
        local_check_in = timezone.localtime(self.check_in)
        
        # Helper to safely obtain a datetime.time object
        def to_time(val, default_h, default_m):
            if hasattr(val, "hour") and hasattr(val, "minute"):
                return val
            if isinstance(val, str):
                try:
                    parts = [int(p) for p in val.strip().split(":")[:2]]
                    from datetime import time as dt_time
                    return dt_time(parts[0], parts[1])
                except Exception:
                    pass
            from datetime import time as dt_time
            return dt_time(default_h, default_m)

        # Resolve effective shift:
        effective_shift = self.shift
        if not effective_shift and self.employee:
            effective_shift = getattr(self.employee, "shift", None)
        if not effective_shift:
            org = getattr(self.employee, "organization", None) if self.employee else None
            effective_shift = Shift.get_default_shift(organization=org)

        if effective_shift:
            self.shift = effective_shift
            shift_start = to_time(effective_shift.start_time, 10, 0)
            shift_end = to_time(effective_shift.end_time, 18, 0)
            late_grace = effective_shift.late_grace_minutes
            early_checkout_grace = effective_shift.early_checkout_grace_minutes
            early_policy = effective_shift.early_checkout_penalty
            min_half_day_hrs = float(effective_shift.min_hours_half_day or 4.0)
            min_full_day_hrs = float(effective_shift.min_hours_full_day or 8.0)
        else:
            shift_start = to_time(settings.shift_start_time, 10, 0)
            shift_end = to_time(settings.shift_end_time, 18, 0)
            late_cutoff_raw = to_time(settings.late_cutoff_time, 10, 15)
            late_grace = max(0, (late_cutoff_raw.hour * 60 + late_cutoff_raw.minute) - (shift_start.hour * 60 + shift_start.minute))
            early_checkout_grace = getattr(settings, "early_checkout_grace_minutes", 15)
            early_policy = getattr(settings, "early_checkout_penalty", "HALF_DAY")
            min_half_day_hrs = float(getattr(settings, "min_hours_half_day", 4.0))
            min_full_day_hrs = float(getattr(settings, "min_hours_full_day", 8.0))

        scheduled_shift_start = local_check_in.replace(
            hour=shift_start.hour,
            minute=shift_start.minute,
            second=getattr(shift_start, "second", 0),
            microsecond=0,
        )
        late_cutoff = scheduled_shift_start + timedelta(minutes=late_grace)
        late_half_day_cutoff = scheduled_shift_start + timedelta(hours=3)

        if local_check_in >= late_half_day_cutoff:
            self.status = AttendanceStatus.HALF_DAY
            self.is_paid = False
        else:
            self.status = AttendanceStatus.LATE if local_check_in > late_cutoff else AttendanceStatus.PRESENT
            self.is_paid = True

        approved_half_day_leave = (
            self.leave_request_id
            and self.leave_request.status == LeaveStatus.APPROVED
            and self.leave_request.is_half_day
        )

        # A verified half-day Casual/Sick request is always a half-day record.
        # Its is_paid value is assigned by the leave-balance service.
        if approved_half_day_leave:
            self.status = AttendanceStatus.HALF_DAY

        elif self.check_out:
            local_check_out = timezone.localtime(self.check_out)
            scheduled_shift_end = local_check_in.replace(
                hour=shift_end.hour,
                minute=shift_end.minute,
                second=getattr(shift_end, "second", 0),
                microsecond=0,
            )
            if shift_end < shift_start:
                # Overnight shift support
                scheduled_shift_end += timedelta(days=1)

            # Full day credit cutoff = shift_end - early_checkout_grace (e.g. 18:00 - 15m = 17:45)
            full_day_checkout_cutoff = scheduled_shift_end - timedelta(minutes=early_checkout_grace)

            if local_check_out >= full_day_checkout_cutoff:
                # Checked out on time or within early grace period -> Full day!
                self.early_departure_minutes = 0
            else:
                # Left before grace period cutoff
                shortfall_seconds = (full_day_checkout_cutoff - local_check_out).total_seconds()
                shortfall_minutes = max(0, int(shortfall_seconds // 60))
                self.early_departure_minutes = shortfall_minutes

                worked_duration = local_check_out - local_check_in
                worked_hours = max(0.0, worked_duration.total_seconds() / 3600.0)

                if early_policy == EarlyCheckoutPolicy.HALF_DAY:
                    self.status = AttendanceStatus.HALF_DAY
                    self.is_paid = False
                    self.notes = f"Early checkout: Left {shortfall_minutes} min(s) early (Policy: Half Day)"
                elif early_policy == EarlyCheckoutPolicy.PRO_RATED:
                    if worked_hours < min_half_day_hrs:
                        self.status = AttendanceStatus.HALF_DAY
                        self.is_paid = False
                        self.notes = f"Early checkout: Worked only {worked_hours:.1f}h (< {min_half_day_hrs}h) (Policy: Half Day)"
                    else:
                        self.status = AttendanceStatus.LATE if local_check_in > late_cutoff else AttendanceStatus.PRESENT
                        self.is_paid = True
                        self.notes = f"Early checkout: Left {shortfall_minutes} min(s) early (Policy: Pro-rated deduction)"
                elif early_policy == EarlyCheckoutPolicy.NONE:
                    self.early_departure_minutes = 0
                    self.notes = f"Early checkout: Left {shortfall_minutes} min(s) early (No penalty)"
          
        # Apply Sunday Unpaid Rule if enabled
        if settings.sunday_unpaid_rule_enabled:
            # Get the date of this attendance record
            attendance_date = local_check_in.date()
            
            # Check if this is a Sunday
            if attendance_date.weekday() == 6:  # 6 = Sunday
                # Check previous day (Saturday) and next day (Monday)
                prev_day = attendance_date - timedelta(days=1)
                next_day = attendance_date + timedelta(days=1)
                
                # Check if there's an absence/leave on Saturday OR Monday
                prev_day_absent = AttendanceRecord.objects.filter(
                    employee=self.employee,
                    check_in__date=prev_day,
                    status__in=[AttendanceStatus.ABSENT, AttendanceStatus.LEAVE]
                ).exists()
                
                next_day_absent = AttendanceRecord.objects.filter(
                    employee=self.employee,
                    check_in__date=next_day,
                    status__in=[AttendanceStatus.ABSENT, AttendanceStatus.LEAVE]
                ).exists()
                
                # If either previous or next day is absent/leave, mark this Sunday as unpaid
                if prev_day_absent or next_day_absent:
                    self.status = AttendanceStatus.SUNDAY_UNPAID
                    self.is_paid = False

    def save(self, *args, **kwargs):
        auto_refresh_status = kwargs.pop("auto_refresh_status", True)
        if auto_refresh_status and self.status not in AUTO_PRESERVED_STATUSES:
            self.refresh_status()
        super().save(*args, **kwargs)


class LeaveType(models.TextChoices):
    CASUAL = "CASUAL", "Casual Leave"
    SICK   = "SICK",   "Sick Leave"
    MATERNITY = "MATERNITY", "Maternity Leave"
    PATERNITY = "PATERNITY", "Paternity Leave"
    BEREAVEMENT = "BEREAVEMENT", "Bereavement Leave"
    MARRIAGE = "MARRIAGE", "Marriage Leave"


class LeaveStatus(models.TextChoices):
    PENDING  = "PENDING",  "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class LeaveRequest(models.Model):
    employee = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="leave_requests"
    )
    start_date = models.DateField()
    end_date   = models.DateField()
    leave_type = models.CharField(
        max_length=20, choices=LeaveType.choices, default=LeaveType.CASUAL
    )
    is_half_day = models.BooleanField(
        default=False,
        help_text="Whether this is a half-day Casual or Sick leave request.",
    )
    attachment = models.FileField(
        upload_to="leave_attachments/%Y/%m/",
        blank=True,
        null=True,
        help_text="Supporting document supplied with the leave request.",
    )
    reason     = models.TextField()
    status     = models.CharField(
        max_length=20, choices=LeaveStatus.choices, default=LeaveStatus.PENDING
    )
    admin_notes = models.TextField(blank=True, null=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering            = ["-created_at"]
        verbose_name        = "Leave Request"
        verbose_name_plural = "Leave Requests"

    def __str__(self):
        return f"{self.employee.full_name} - {self.get_leave_type_display()} ({self.status})"
