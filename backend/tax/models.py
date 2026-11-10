from decimal import Decimal

from django.core.validators import RegexValidator, MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone

from employees.models import Employee
from organizations.models import Organization


# ──────────────────────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────────────────────

class TaxRegime(models.TextChoices):
    NEW = "NEW", "New Regime (Default)"
    OLD = "OLD", "Old Regime"


class FinancialYear(models.TextChoices):
    FY_2025_26 = "2025-26", "FY 2025-26"
    FY_2026_27 = "2026-27", "FY 2026-27"
    FY_2027_28 = "2027-28", "FY 2027-28"
    FY_2028_29 = "2028-29", "FY 2028-29"


class Quarter(models.TextChoices):
    Q1 = "Q1", "Q1 (Apr–Jun)"
    Q2 = "Q2", "Q2 (Jul–Sep)"
    Q3 = "Q3", "Q3 (Oct–Dec)"
    Q4 = "Q4", "Q4 (Jan–Mar)"


class ChallanStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PAID = "PAID", "Paid"
    VERIFIED = "VERIFIED", "Verified"
    FAILED = "FAILED", "Failed"


class ReturnStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    VALIDATED = "VALIDATED", "Validated"
    FILED = "FILED", "Filed"
    ACCEPTED = "ACCEPTED", "Accepted"
    REJECTED = "REJECTED", "Rejected"


class DeclarationStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    VERIFIED = "VERIFIED", "Verified by Admin"
    LOCKED = "LOCKED", "Locked for FY"


# ──────────────────────────────────────────────────────────────────────────────
# Company Tax Configuration (per organization)
# ──────────────────────────────────────────────────────────────────────────────

class CompanyTaxConfig(models.Model):
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="tax_config",
    )
    tan_number = models.CharField(
        max_length=10,
        blank=True,
        validators=[RegexValidator(
            r"^[A-Z]{4}[0-9]{5}[A-Z]$",
            "TAN must be 4 letters + 5 digits + 1 letter (e.g. MUMB12345A).",
        )],
        help_text="Tax Deduction and Collection Account Number.",
    )
    default_tax_regime = models.CharField(
        max_length=3,
        choices=TaxRegime.choices,
        default=TaxRegime.NEW,
    )

    # Statutory toggles
    epf_enabled = models.BooleanField(default=True)
    epf_employer_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("12.00"),
        help_text="Employer EPF contribution % on Basic + DA (wage ceiling applies).",
    )
    epf_employee_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("12.00"),
        help_text="Employee EPF contribution % on Basic + DA.",
    )
    epf_wage_ceiling = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("15000.00"),
        help_text="Monthly wage ceiling for EPF computation.",
    )

    esi_enabled = models.BooleanField(default=False)
    esi_employer_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("3.25"),
    )
    esi_employee_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.75"),
    )
    esi_wage_ceiling = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("21000.00"),
        help_text="Monthly wage ceiling for ESI applicability.",
    )

    professional_tax_enabled = models.BooleanField(default=False)
    pt_state = models.CharField(
        max_length=50, blank=True,
        help_text="State for Professional Tax slab lookup.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Company Tax Configuration"

    def __str__(self):
        return f"Tax Config – {self.organization}"


# ──────────────────────────────────────────────────────────────────────────────
# Salary Structure (CTC component breakdown per employee)
# ──────────────────────────────────────────────────────────────────────────────

class SalaryStructure(models.Model):
    employee = models.OneToOneField(
        Employee,
        on_delete=models.CASCADE,
        related_name="salary_structure",
    )
    effective_date = models.DateField(default=timezone.localdate)
    annual_ctc = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Monthly components (stored as monthly amounts)
    basic = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hra = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    da = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Dearness Allowance")
    special_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    conveyance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    medical_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    lta = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Leave Travel Allowance (annual)")
    other_allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Employer contributions (not part of employee's gross)
    employer_pf = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    employer_esi = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Salary Structure"

    def __str__(self):
        return f"Salary Structure – {self.employee.full_name}"

    @property
    def monthly_gross(self):
        return (
            self.basic + self.hra + self.da + self.special_allowance
            + self.conveyance + self.medical_allowance + self.other_allowance
        )

    @property
    def annual_gross(self):
        return self.monthly_gross * 12 + self.lta


# ──────────────────────────────────────────────────────────────────────────────
# Employee Tax Declaration (Form 12BB equivalent)
# ──────────────────────────────────────────────────────────────────────────────

class TaxDeclaration(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="tax_declarations",
    )
    financial_year = models.CharField(max_length=7, choices=FinancialYear.choices)
    tax_regime = models.CharField(max_length=3, choices=TaxRegime.choices, default=TaxRegime.NEW)
    status = models.CharField(
        max_length=10,
        choices=DeclarationStatus.choices,
        default=DeclarationStatus.DRAFT,
    )

    # Old regime deductions (Chapter VI-A and exemptions)
    section_80c = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="PPF, ELSS, LIC, etc. Max 1.5L")
    section_80ccd_1b = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="NPS additional. Max 50K")
    section_80d_self = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Health insurance – self/family")
    section_80d_parents = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Health insurance – parents")
    section_80e = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Education loan interest")
    section_80g = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Donations")
    section_80tta = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Savings interest. Max 10K")

    hra_claimed = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    home_loan_interest = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Section 24(b). Max 2L for self-occupied")
    home_loan_principal = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Included in 80C limit")

    # Additional income declared by employee
    other_income = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Income from other sources")
    previous_employer_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    previous_employer_tds = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_declarations",
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("employee", "financial_year")
        ordering = ["-financial_year", "employee__full_name"]

    def __str__(self):
        return f"{self.employee.full_name} – {self.financial_year} ({self.get_tax_regime_display()})"

    @property
    def total_chapter_via_deductions(self):
        return (
            min(self.section_80c + self.home_loan_principal, Decimal("150000"))
            + min(self.section_80ccd_1b, Decimal("50000"))
            + self.section_80d_self
            + self.section_80d_parents
            + self.section_80e
            + self.section_80g
            + min(self.section_80tta, Decimal("10000"))
        )


# ──────────────────────────────────────────────────────────────────────────────
# Monthly TDS Record
# ──────────────────────────────────────────────────────────────────────────────

class MonthlyTDS(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="monthly_tds",
    )
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    year = models.PositiveIntegerField()
    financial_year = models.CharField(max_length=7, choices=FinancialYear.choices)
    tax_regime = models.CharField(max_length=3, choices=TaxRegime.choices)

    estimated_annual_income = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    estimated_annual_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cumulative_tds = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Total TDS deducted so far this FY")
    tds_this_month = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    epf_employee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    epf_employer = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    esi_employee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    esi_employer = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    professional_tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    total_statutory_deduction = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="TDS + EPF employee + ESI employee + PT",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("employee", "month", "year")
        ordering = ["-year", "-month"]
        verbose_name = "Monthly TDS"
        verbose_name_plural = "Monthly TDS"

    def __str__(self):
        return f"{self.employee.full_name} – {self.month}/{self.year} TDS ₹{self.tds_this_month}"


# ──────────────────────────────────────────────────────────────────────────────
# Professional Tax Slabs (state-specific)
# ──────────────────────────────────────────────────────────────────────────────

class ProfessionalTaxSlab(models.Model):
    state = models.CharField(max_length=50, db_index=True)
    salary_from = models.DecimalField(max_digits=10, decimal_places=2)
    salary_to = models.DecimalField(max_digits=10, decimal_places=2, help_text="Use 9999999 for no upper limit")
    monthly_tax = models.DecimalField(max_digits=8, decimal_places=2)
    gender = models.CharField(
        max_length=10,
        blank=True,
        help_text="Leave blank if same for all genders.",
    )

    class Meta:
        ordering = ["state", "salary_from"]
        verbose_name = "Professional Tax Slab"

    def __str__(self):
        return f"{self.state}: ₹{self.salary_from}–₹{self.salary_to} → ₹{self.monthly_tax}/mo"


# ──────────────────────────────────────────────────────────────────────────────
# TDS Challan (government payment record)
# ──────────────────────────────────────────────────────────────────────────────

class TDSChallan(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="tds_challans",
    )
    financial_year = models.CharField(max_length=7, choices=FinancialYear.choices)
    assessment_year = models.CharField(max_length=7, help_text="e.g. 2027-28")
    quarter = models.CharField(max_length=2, choices=Quarter.choices)
    month = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text="Month for which TDS is being deposited.",
    )

    total_tds_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    interest = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_deposit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    cin = models.CharField(max_length=20, blank=True, help_text="Challan Identification Number")
    bsr_code = models.CharField(max_length=7, blank=True, help_text="BSR code of the collecting bank branch")
    challan_serial = models.CharField(max_length=10, blank=True)
    payment_date = models.DateField(null=True, blank=True)
    payment_mode = models.CharField(max_length=20, blank=True, help_text="Net Banking / UPI / NEFT / RTGS")

    status = models.CharField(max_length=10, choices=ChallanStatus.choices, default=ChallanStatus.PENDING)
    due_date = models.DateField(help_text="7th of the following month (30th April for March)")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-financial_year", "-month"]
        verbose_name = "TDS Challan"

    def __str__(self):
        return f"Challan {self.financial_year} {self.get_quarter_display()} M{self.month} – ₹{self.total_deposit}"


# ──────────────────────────────────────────────────────────────────────────────
# TDS Return (Form 24Q filing record)
# ──────────────────────────────────────────────────────────────────────────────

class TDSReturn(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="tds_returns",
    )
    financial_year = models.CharField(max_length=7, choices=FinancialYear.choices)
    quarter = models.CharField(max_length=2, choices=Quarter.choices)
    form_type = models.CharField(max_length=10, default="24Q")

    status = models.CharField(max_length=10, choices=ReturnStatus.choices, default=ReturnStatus.DRAFT)
    filing_date = models.DateField(null=True, blank=True)
    acknowledgement_number = models.CharField(max_length=30, blank=True)
    token_number = models.CharField(max_length=20, blank=True)
    correction_count = models.PositiveSmallIntegerField(default=0)

    total_tds_deposited = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_employees = models.PositiveIntegerField(default=0)

    due_date = models.DateField(help_text="Statutory filing deadline for this quarter")
    filed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="filed_returns",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "financial_year", "quarter", "form_type")
        ordering = ["-financial_year", "-quarter"]
        verbose_name = "TDS Return"

    def __str__(self):
        return f"24Q {self.financial_year} {self.get_quarter_display()} – {self.get_status_display()}"
