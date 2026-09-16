from datetime import timedelta, datetime

from django.db import models
from django.utils import timezone

from employees.models import Employee
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
            return

        # Get current system settings for dynamic thresholds
        settings = SystemSettings.get_settings()
        local_check_in = timezone.localtime(self.check_in)
        
        # Parse late cutoff time from settings
        late_cutoff_time = settings.late_cutoff_time
        late_hour, late_minute = map(int, late_cutoff_time.strftime("%H:%M").split(":"))
        late_cutoff = local_check_in.replace(
            hour=late_hour, 
            minute=late_minute, 
            second=0, 
            microsecond=0
        )
        
        # Determine whether the employee is late or should be marked as half day.
        scheduled_shift_start = local_check_in.replace(
            hour=settings.shift_start_time.hour,
            minute=settings.shift_start_time.minute,
            second=settings.shift_start_time.second,
            microsecond=0,
        )
        late_half_day_cutoff = scheduled_shift_start + timedelta(hours=3)

        if local_check_in >= late_half_day_cutoff:
            self.status = AttendanceStatus.HALF_DAY
            self.is_paid = False
        else:
            self.status = AttendanceStatus.LATE if local_check_in > late_cutoff else AttendanceStatus.PRESENT

        approved_half_day_leave = (
            self.leave_request_id
            and self.leave_request.status == LeaveStatus.APPROVED
            and self.leave_request.is_half_day
        )

        # A verified half-day Casual/Sick request is always a half-day record.
        # Its is_paid value is assigned by the leave-balance service.
        if approved_half_day_leave:
            self.status = AttendanceStatus.HALF_DAY

        # An early checkout is a half day, except during the final two hours of
        # the scheduled shift. For example, with an 18:00 shift end, a checkout
        # at 16:00 or later remains Present/Late, while one before 16:00 is Half Day.
        elif self.check_out:
            local_check_out = timezone.localtime(self.check_out)
            scheduled_shift_end = local_check_in.replace(
                hour=settings.shift_end_time.hour,
                minute=settings.shift_end_time.minute,
                second=settings.shift_end_time.second,
                microsecond=0,
            )
            full_day_checkout_cutoff = scheduled_shift_end - timedelta(hours=2)

            if local_check_out < full_day_checkout_cutoff:
                self.status = AttendanceStatus.HALF_DAY
                self.is_paid = False
          
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
