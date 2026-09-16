from django.db import models
from django.utils import timezone
from django.core.validators import MaxValueValidator


class SystemSettings(models.Model):
    """Singleton model to store global system settings"""
    # Attendance Settings
    shift_start_time = models.TimeField(default="10:00:00")
    late_cutoff_time = models.TimeField(default="10:15:00")
    shift_end_time = models.TimeField(default="18:00:00")
    auto_checkout_enabled = models.BooleanField(default=True)
    auto_checkout_time = models.TimeField(default="20:00:00")
    
    # Security Settings
    ip_restriction_enabled = models.BooleanField(default=False)
    allowed_ip_ranges = models.TextField(blank=True, null=True)
    geofencing_enabled = models.BooleanField(default=False)
    office_latitude = models.DecimalField(
        max_digits=12,
        decimal_places=9,
        null=True,
        blank=True,
        help_text="Office latitude for geofencing."
    )
    office_longitude = models.DecimalField(
        max_digits=12,
        decimal_places=9,
        null=True,
        blank=True,
        help_text="Office longitude for geofencing."
    )
    geofence_radius = models.PositiveIntegerField(
        default=100,
        help_text="Allowed geofencing radius in meters."
    )
    
    # Company Settings
    company_name = models.CharField(max_length=255, default="Bhatt Square Pvt. Ltd.")
    company_address = models.TextField(default="123 Business Park, Mumbai, Maharashtra 400001")
    company_email = models.EmailField(default="admin@bhattsquare.com")
    company_phone = models.CharField(max_length=20, default="+91 98765 43210")
    company_website = models.URLField(blank=True, default="")
    industry = models.CharField(max_length=100, blank=True, default="")
    company_size = models.CharField(max_length=50, blank=True, default="")
    registration_number = models.CharField(max_length=100, blank=True, default="")
    tax_id = models.CharField(max_length=50, blank=True, default="")
    company_logo = models.ImageField(upload_to='logos/', null=True, blank=True)
    
    # Company Bank & Payment Details
    company_bank_name = models.CharField(max_length=150, blank=True, default="", help_text="Company primary bank name.")
    company_bank_account_no = models.CharField(max_length=50, blank=True, default="", help_text="Company bank account number.")
    company_bank_ifsc = models.CharField(max_length=30, blank=True, default="", help_text="Company bank IFSC code.")
    company_bank_branch = models.CharField(max_length=150, blank=True, default="", help_text="Company bank branch name.")
    company_upi_id = models.CharField(max_length=100, blank=True, default="", help_text="Company UPI ID for payments.")

    attendance_rules = models.TextField(blank=True, null=True)
    timezone = models.CharField(max_length=50, default="Asia/Kolkata")
    currency = models.CharField(max_length=10, default="INR")
    date_format = models.CharField(max_length=20, default="DD/MM/YYYY")
    working_days = models.JSONField(default=list)  # Stores ["monday", "tuesday", ...]
    
    # Notification Settings
    email_notifications = models.BooleanField(default=True)
    late_entry_alert = models.BooleanField(default=True)
    leave_request_alert = models.BooleanField(default=True)
    salary_processed_alert = models.BooleanField(default=True)
    new_employee_alert = models.BooleanField(default=False)
    browser_notifications = models.BooleanField(default=True)
    weekly_report_enabled = models.BooleanField(default=True)
    weekly_report_day = models.CharField(max_length=20, default="monday")
    
    # Security Settings
    min_password_length = models.IntegerField(default=8)
    password_expiry_enabled = models.BooleanField(default=False)
    two_factor_required = models.BooleanField(default=False)
    session_timeout_enabled = models.BooleanField(default=True)
    
    # Sunday Unpaid Rule (for weekend penalty)
    sunday_unpaid_rule_enabled = models.BooleanField(default=False, help_text="If enabled, Sunday is marked as unpaid when employee is on leave/absent on the day before or after Sunday")
    
    # Burger Rule (for sandwich leave around holidays)
    burger_rule_enabled = models.BooleanField(default=False, help_text="If enabled, a holiday is marked as unpaid if it is sandwiched between two leave days.")
    
    # Increment Management Settings
    increment_enabled = models.BooleanField(default=True, help_text="Enable automatic calculation and scheduling of employee salary increments.")
    default_increment_months = models.PositiveIntegerField(default=12, help_text="Default increment cycle interval in months (e.g. 1, 3, 6, 9, 12, 18, 24).")
    default_increment_type = models.CharField(
        max_length=20,
        default="PERCENTAGE",
        choices=[("PERCENTAGE", "Percentage"), ("FLAT_AMOUNT", "Flat Amount (Rupees)")],
        help_text="Default increment calculation method."
    )
    default_increment_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=10.00,
        help_text="Default increment value (percentage or rupee amount)."
    )

    
    # Annual leave allocations. Each approved leave is paid only while its
    # own leave-type balance remains for that calendar year.
    sick_leave_days = models.PositiveIntegerField(default=12, validators=[MaxValueValidator(365)])
    casual_leave_days = models.PositiveIntegerField(default=6, validators=[MaxValueValidator(365)])
    sick_leave_monthly_limit = models.PositiveIntegerField(
        default=7,
        validators=[MaxValueValidator(31)],
        help_text="Maximum Sick Leave days an employee may request in one calendar month.",
    )
    casual_leave_monthly_limit = models.PositiveIntegerField(
        default=3,
        validators=[MaxValueValidator(31)],
        help_text="Maximum Casual Leave days an employee may request in one calendar month.",
    )
    maternity_leave_days = models.PositiveIntegerField(default=180, validators=[MaxValueValidator(365)])
    paternity_leave_days = models.PositiveIntegerField(default=14, validators=[MaxValueValidator(365)])
    bereavement_leave_days = models.PositiveIntegerField(default=5, validators=[MaxValueValidator(365)])
    marriage_leave_days = models.PositiveIntegerField(default=10, validators=[MaxValueValidator(365)])
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "employees.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="settings_updated"
    )

    class Meta:
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

    def save(self, *args, **kwargs):
        # Ensure only one instance exists (singleton pattern)
        if SystemSettings.objects.exists() and not self.pk:
            self.pk = SystemSettings.objects.first().pk
        
        # Set default working days if not set
        if not self.working_days:
            self.working_days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
            
        super().save(*args, **kwargs)

    @classmethod
    def get_settings(cls):
        """Get the singleton instance, create if it doesn't exist"""
        settings, created = cls.objects.get_or_create(pk=1)
        return settings

    def __str__(self):
        return "Global System Settings"


class SettingsChangeLog(models.Model):
    """Track all changes to system settings for audit purposes"""
    settings = models.ForeignKey(SystemSettings, on_delete=models.CASCADE)
    changed_by = models.ForeignKey(
        "employees.Employee",
        on_delete=models.SET_NULL,
        null=True
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    field_name = models.CharField(max_length=100)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "Settings Change Log"
        verbose_name_plural = "Settings Change Logs"
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.field_name} changed by {self.changed_by} on {self.changed_at}"
