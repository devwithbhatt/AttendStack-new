from django.db import models
from django.utils import timezone
from employees.models import Employee

class PayrollStatus(models.TextChoices):
    PAID = "PAID", "Paid"
    PENDING = "PENDING", "Pending"

class Payroll(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="payrolls"
    )
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    deduction_details = models.JSONField(default=dict, blank=True, null=True)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(
        max_length=20,
        choices=PayrollStatus.choices,
        default=PayrollStatus.PENDING
    )
    paid_on = models.DateTimeField(null=True, blank=True)
    modification_reason = models.TextField(blank=True, default="")
    modified_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="modified_payrolls"
    )
    is_modified_after_payment = models.BooleanField(default=False)
    modification_history = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("employee", "month", "year")
        ordering = ["-year", "-month", "employee__full_name"]

    def __str__(self):
        return f"{self.employee.full_name} - {self.month}/{self.year} ({self.status})"

    def save(self, *args, **kwargs):
        from decimal import Decimal
        # Ensure high-precision Decimal types to eliminate Python float type conflicts
        self.basic_salary = Decimal(str(self.basic_salary or 0))
        self.allowances = Decimal(str(self.allowances or 0))
        self.deductions = Decimal(str(self.deductions or 0))
        
        # Calculate net salary
        self.net_salary = self.basic_salary + self.allowances - self.deductions
        if self.status == PayrollStatus.PAID and not self.paid_on:
            self.paid_on = timezone.now()
        super().save(*args, **kwargs)


class IncrementStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    RESCHEDULED = "RESCHEDULED", "Rescheduled"


class IncrementType(models.TextChoices):
    PERCENTAGE = "PERCENTAGE", "Percentage"
    FLAT_AMOUNT = "FLAT_AMOUNT", "Flat Amount"


class EmployeeIncrement(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="increments"
    )
    due_date = models.DateField(db_index=True)
    current_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    increment_type = models.CharField(
        max_length=20,
        choices=IncrementType.choices,
        default=IncrementType.PERCENTAGE
    )
    increment_value = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    calculated_increment_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    new_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(
        max_length=20,
        choices=IncrementStatus.choices,
        default=IncrementStatus.PENDING,
        db_index=True
    )
    rescheduled_date = models.DateField(null=True, blank=True)
    action_date = models.DateTimeField(null=True, blank=True)
    action_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_increments"
    )
    notes = models.TextField(blank=True, default="")
    is_custom = models.BooleanField(
        default=False,
        help_text="True if this increment has custom raise amount/type overridden from company default."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date", "-created_at"]
        indexes = [
            models.Index(fields=["status", "due_date"]),
        ]

    def __str__(self):
        return f"{self.employee.full_name} - {self.due_date} ({self.status})"