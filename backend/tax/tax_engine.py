"""
Indian Income Tax & Statutory Deduction Engine for ZuperHR.

Supports:
- New Tax Regime (IT Act 2025, effective FY 2026-27) — 7 slabs
- Old Tax Regime — 3 slabs + Chapter VI-A deductions
- Monthly TDS computation (Section 192 averaging method)
- EPF (employee + employer)
- ESI (employee + employer)
- Professional Tax (state-specific slab lookup)

Tax slab data is stored as configuration, not hardcoded in logic,
so annual budget changes require only a data update.
"""

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

MONEY = Decimal("0.01")
ZERO = Decimal("0")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


# ──────────────────────────────────────────────────────────────────────────────
# Tax Slab Configuration (FY 2026-27)
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class TaxSlab:
    lower: Decimal
    upper: Optional[Decimal]  # None = no upper limit
    rate: Decimal  # as percentage, e.g. 5 for 5%


NEW_REGIME_SLABS_2026_27: list[TaxSlab] = [
    TaxSlab(Decimal("0"), Decimal("400000"), Decimal("0")),
    TaxSlab(Decimal("400000"), Decimal("800000"), Decimal("5")),
    TaxSlab(Decimal("800000"), Decimal("1200000"), Decimal("10")),
    TaxSlab(Decimal("1200000"), Decimal("1600000"), Decimal("15")),
    TaxSlab(Decimal("1600000"), Decimal("2000000"), Decimal("20")),
    TaxSlab(Decimal("2000000"), Decimal("2400000"), Decimal("25")),
    TaxSlab(Decimal("2400000"), None, Decimal("30")),
]

OLD_REGIME_SLABS_2026_27: list[TaxSlab] = [
    TaxSlab(Decimal("0"), Decimal("250000"), Decimal("0")),
    TaxSlab(Decimal("250000"), Decimal("500000"), Decimal("5")),
    TaxSlab(Decimal("500000"), Decimal("1000000"), Decimal("20")),
    TaxSlab(Decimal("1000000"), None, Decimal("30")),
]

NEW_REGIME_STANDARD_DEDUCTION = Decimal("75000")
OLD_REGIME_STANDARD_DEDUCTION = Decimal("50000")
NEW_REGIME_87A_REBATE_LIMIT = Decimal("1200000")  # taxable income limit
NEW_REGIME_87A_REBATE_MAX = Decimal("60000")
OLD_REGIME_87A_REBATE_LIMIT = Decimal("500000")
OLD_REGIME_87A_REBATE_MAX = Decimal("12500")

CESS_RATE = Decimal("4")  # 4% Health & Education Cess

SURCHARGE_SLABS = [
    (Decimal("5000000"), Decimal("10000000"), Decimal("10")),
    (Decimal("10000000"), Decimal("20000000"), Decimal("15")),
    (Decimal("20000000"), None, Decimal("25")),
]


# ──────────────────────────────────────────────────────────────────────────────
# Core Tax Computation
# ──────────────────────────────────────────────────────────────────────────────

def compute_tax_on_slabs(taxable_income: Decimal, slabs: list[TaxSlab]) -> Decimal:
    """Apply progressive slab rates to a taxable income amount."""
    tax = ZERO
    for slab in slabs:
        if taxable_income <= slab.lower:
            break
        upper = slab.upper if slab.upper is not None else taxable_income
        taxable_in_slab = min(taxable_income, upper) - slab.lower
        if taxable_in_slab > 0:
            tax += taxable_in_slab * slab.rate / Decimal("100")
    return money(tax)


def compute_tax_on_slabs_detailed(taxable_income: Decimal, slabs: list[TaxSlab]) -> list[dict]:
    """Return slab-by-slab breakdown for display purposes."""
    breakdown = []
    for slab in slabs:
        if taxable_income <= slab.lower:
            breakdown.append({
                "from": str(slab.lower),
                "to": str(slab.upper) if slab.upper else "Above",
                "rate": str(slab.rate),
                "taxable_in_slab": "0",
                "tax": "0",
            })
            continue
        upper = slab.upper if slab.upper is not None else taxable_income
        taxable_in_slab = min(taxable_income, upper) - slab.lower
        tax_in_slab = money(max(ZERO, taxable_in_slab) * slab.rate / Decimal("100"))
        breakdown.append({
            "from": str(slab.lower),
            "to": str(slab.upper) if slab.upper else "Above",
            "rate": str(slab.rate),
            "taxable_in_slab": str(max(ZERO, taxable_in_slab)),
            "tax": str(tax_in_slab),
        })
    return breakdown


def compute_surcharge(total_income: Decimal, base_tax: Decimal) -> Decimal:
    """Compute surcharge based on total income. Capped at 25% for new regime."""
    surcharge_rate = ZERO
    for lower, upper, rate in SURCHARGE_SLABS:
        if upper is None:
            if total_income > lower:
                surcharge_rate = rate
        elif lower < total_income <= upper:
            surcharge_rate = rate
    if surcharge_rate > Decimal("25"):
        surcharge_rate = Decimal("25")
    return money(base_tax * surcharge_rate / Decimal("100"))


def compute_marginal_relief(total_income: Decimal, base_tax: Decimal, surcharge: Decimal, threshold: Decimal) -> Decimal:
    """Apply marginal relief so tax + surcharge doesn't exceed income over the threshold."""
    if total_income <= threshold or surcharge == ZERO:
        return surcharge
    excess_income = total_income - threshold
    tax_at_threshold = base_tax  # approximate — could recompute at threshold
    if base_tax + surcharge > excess_income + tax_at_threshold:
        return max(ZERO, excess_income)
    return surcharge


@dataclass
class AnnualTaxResult:
    gross_salary: Decimal = ZERO
    standard_deduction: Decimal = ZERO
    chapter_via_deductions: Decimal = ZERO
    hra_exemption: Decimal = ZERO
    other_exemptions: Decimal = ZERO
    taxable_income: Decimal = ZERO
    base_tax: Decimal = ZERO
    surcharge: Decimal = ZERO
    cess: Decimal = ZERO
    rebate_87a: Decimal = ZERO
    total_tax: Decimal = ZERO
    regime: str = "NEW"
    other_income: Decimal = ZERO
    previous_employer_income: Decimal = ZERO


def compute_annual_tax(
    annual_gross: Decimal,
    regime: str = "NEW",
    chapter_via_deductions: Decimal = ZERO,
    hra_exemption: Decimal = ZERO,
    other_exemptions: Decimal = ZERO,
    other_income: Decimal = ZERO,
    previous_employer_salary: Decimal = ZERO,
    employee_epf_annual: Decimal = ZERO,
) -> AnnualTaxResult:
    """Compute annual income tax for an employee under the selected regime."""
    result = AnnualTaxResult(regime=regime)
    result.gross_salary = annual_gross
    result.other_income = other_income
    result.previous_employer_income = previous_employer_salary

    total_income = annual_gross + other_income + previous_employer_salary

    if regime == "NEW":
        result.standard_deduction = min(NEW_REGIME_STANDARD_DEDUCTION, annual_gross)
        # New regime: no Chapter VI-A (except 80CCD(2) employer NPS — not implemented yet)
        result.chapter_via_deductions = ZERO
        result.hra_exemption = ZERO
        result.other_exemptions = ZERO
        taxable = total_income - result.standard_deduction
    else:
        result.standard_deduction = min(OLD_REGIME_STANDARD_DEDUCTION, annual_gross)
        result.chapter_via_deductions = chapter_via_deductions
        result.hra_exemption = hra_exemption
        result.other_exemptions = other_exemptions
        # Employee EPF contribution counts toward 80C in old regime
        taxable = (
            total_income
            - result.standard_deduction
            - result.chapter_via_deductions
            - result.hra_exemption
            - result.other_exemptions
        )

    taxable = max(ZERO, money(taxable))
    result.taxable_income = taxable

    # Select slabs
    slabs = NEW_REGIME_SLABS_2026_27 if regime == "NEW" else OLD_REGIME_SLABS_2026_27
    result.base_tax = compute_tax_on_slabs(taxable, slabs)

    # Surcharge
    result.surcharge = compute_surcharge(total_income, result.base_tax)

    # Section 87A rebate
    if regime == "NEW" and taxable <= NEW_REGIME_87A_REBATE_LIMIT:
        result.rebate_87a = min(result.base_tax + result.surcharge, NEW_REGIME_87A_REBATE_MAX)
    elif regime == "OLD" and taxable <= OLD_REGIME_87A_REBATE_LIMIT:
        result.rebate_87a = min(result.base_tax + result.surcharge, OLD_REGIME_87A_REBATE_MAX)

    tax_after_rebate = max(ZERO, result.base_tax + result.surcharge - result.rebate_87a)

    # Cess
    result.cess = money(tax_after_rebate * CESS_RATE / Decimal("100"))

    result.total_tax = money(tax_after_rebate + result.cess)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Monthly TDS Calculation
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class MonthlyTDSResult:
    tds_this_month: Decimal = ZERO
    estimated_annual_income: Decimal = ZERO
    estimated_annual_tax: Decimal = ZERO
    cumulative_tds: Decimal = ZERO
    tax_regime: str = "NEW"


def compute_monthly_tds(
    annual_gross: Decimal,
    regime: str,
    current_month: int,  # 1-12 (calendar month)
    financial_year_start_month: int = 4,  # April
    tds_already_deducted: Decimal = ZERO,
    chapter_via_deductions: Decimal = ZERO,
    hra_exemption: Decimal = ZERO,
    other_exemptions: Decimal = ZERO,
    other_income: Decimal = ZERO,
    previous_employer_salary: Decimal = ZERO,
    previous_employer_tds: Decimal = ZERO,
) -> MonthlyTDSResult:
    """Compute monthly TDS using Section 192 averaging method.

    TDS = (Estimated Annual Tax - TDS already deducted - Previous employer TDS) / Remaining months
    """
    # Determine how many months remain in the FY (including current)
    if current_month >= financial_year_start_month:
        month_index = current_month - financial_year_start_month  # 0 for April, 11 for March
    else:
        month_index = current_month + (12 - financial_year_start_month)
    remaining_months = 12 - month_index
    if remaining_months <= 0:
        remaining_months = 1

    annual_tax_result = compute_annual_tax(
        annual_gross=annual_gross,
        regime=regime,
        chapter_via_deductions=chapter_via_deductions,
        hra_exemption=hra_exemption,
        other_exemptions=other_exemptions,
        other_income=other_income,
        previous_employer_salary=previous_employer_salary,
    )

    total_tds_needed = annual_tax_result.total_tax
    tds_balance = max(ZERO, total_tds_needed - tds_already_deducted - previous_employer_tds)
    monthly_tds = money(tds_balance / Decimal(str(remaining_months)))

    return MonthlyTDSResult(
        tds_this_month=monthly_tds,
        estimated_annual_income=annual_tax_result.taxable_income,
        estimated_annual_tax=annual_tax_result.total_tax,
        cumulative_tds=tds_already_deducted + monthly_tds,
        tax_regime=regime,
    )


# ──────────────────────────────────────────────────────────────────────────────
# EPF Computation
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class EPFResult:
    employee_contribution: Decimal = ZERO
    employer_contribution: Decimal = ZERO
    wage_used: Decimal = ZERO


def compute_epf(
    monthly_basic_plus_da: Decimal,
    employer_rate: Decimal = Decimal("12"),
    employee_rate: Decimal = Decimal("12"),
    wage_ceiling: Decimal = Decimal("15000"),
) -> EPFResult:
    """Compute EPF contributions. Applied on min(Basic+DA, wage ceiling)."""
    wage = min(monthly_basic_plus_da, wage_ceiling)
    return EPFResult(
        employee_contribution=money(wage * employee_rate / Decimal("100")),
        employer_contribution=money(wage * employer_rate / Decimal("100")),
        wage_used=wage,
    )


# ──────────────────────────────────────────────────────────────────────────────
# ESI Computation
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ESIResult:
    employee_contribution: Decimal = ZERO
    employer_contribution: Decimal = ZERO
    applicable: bool = False


def compute_esi(
    monthly_gross: Decimal,
    employer_rate: Decimal = Decimal("3.25"),
    employee_rate: Decimal = Decimal("0.75"),
    wage_ceiling: Decimal = Decimal("21000"),
) -> ESIResult:
    """Compute ESI contributions. Applicable only when gross <= wage ceiling."""
    if monthly_gross > wage_ceiling:
        return ESIResult(applicable=False)
    return ESIResult(
        employee_contribution=money(monthly_gross * employee_rate / Decimal("100")),
        employer_contribution=money(monthly_gross * employer_rate / Decimal("100")),
        applicable=True,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Professional Tax Lookup
# ──────────────────────────────────────────────────────────────────────────────

def compute_professional_tax(monthly_gross: Decimal, state: str) -> Decimal:
    """Look up Professional Tax from the ProfessionalTaxSlab table."""
    from .models import ProfessionalTaxSlab

    slab = (
        ProfessionalTaxSlab.objects
        .filter(
            state__iexact=state,
            salary_from__lte=monthly_gross,
            salary_to__gte=monthly_gross,
        )
        .first()
    )
    return slab.monthly_tax if slab else ZERO


# ──────────────────────────────────────────────────────────────────────────────
# Unified Monthly Statutory Deduction Computation
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class StatutoryDeductionResult:
    tds: Decimal = ZERO
    epf_employee: Decimal = ZERO
    epf_employer: Decimal = ZERO
    esi_employee: Decimal = ZERO
    esi_employer: Decimal = ZERO
    professional_tax: Decimal = ZERO
    total_employee_deduction: Decimal = ZERO  # sum deducted from employee's salary
    total_employer_cost: Decimal = ZERO  # additional employer liability

    estimated_annual_income: Decimal = ZERO
    estimated_annual_tax: Decimal = ZERO
    cumulative_tds: Decimal = ZERO


def compute_all_statutory_deductions(
    employee,
    month: int,
    year: int,
) -> StatutoryDeductionResult:
    """Compute all statutory deductions for an employee for a given month.

    Pulls configuration from CompanyTaxConfig, SalaryStructure, and TaxDeclaration.
    Falls back gracefully if any data is missing.
    """
    from .models import CompanyTaxConfig, SalaryStructure, TaxDeclaration, MonthlyTDS

    result = StatutoryDeductionResult()
    org = employee.organization
    if not org:
        return result

    # Load company tax config
    try:
        config = CompanyTaxConfig.objects.get(organization=org)
    except CompanyTaxConfig.DoesNotExist:
        return result

    # Load salary structure — auto-derive from annual_salary if none exists
    try:
        structure = SalaryStructure.objects.get(employee=employee)
    except SalaryStructure.DoesNotExist:
        annual = employee.annual_salary
        if not annual or annual <= 0:
            return result
        monthly_ctc = money(Decimal(str(annual)) / Decimal("12"))
        basic = money(monthly_ctc * Decimal("0.40"))
        hra = money(basic * Decimal("0.50"))
        special = money(monthly_ctc - basic - hra)
        structure = SalaryStructure(
            employee=employee,
            annual_ctc=annual,
            basic=basic,
            hra=hra,
            da=ZERO,
            special_allowance=special,
            conveyance=ZERO,
            medical_allowance=ZERO,
            lta=ZERO,
            other_allowance=ZERO,
            employer_pf=ZERO,
            employer_esi=ZERO,
        )
        structure.save()

    # Determine financial year
    fy = f"{year}-{str(year + 1)[2:]}" if month >= 4 else f"{year - 1}-{str(year)[2:]}"

    # Load or auto-create tax declaration (defaults to company's regime)
    declaration = (
        TaxDeclaration.objects
        .filter(employee=employee, financial_year=fy)
        .first()
    )
    if not declaration:
        declaration = TaxDeclaration.objects.create(
            employee=employee,
            financial_year=fy,
            tax_regime=config.default_tax_regime,
        )

    regime = declaration.tax_regime

    # ── EPF ──
    if config.epf_enabled and getattr(employee, 'epf_applicable', False):
        basic_plus_da = structure.basic + structure.da
        epf = compute_epf(
            monthly_basic_plus_da=basic_plus_da,
            employer_rate=config.epf_employer_rate,
            employee_rate=config.epf_employee_rate,
            wage_ceiling=config.epf_wage_ceiling,
        )
        result.epf_employee = epf.employee_contribution
        result.epf_employer = epf.employer_contribution

    # ── ESI ──
    if config.esi_enabled and getattr(employee, 'esi_applicable', False):
        esi = compute_esi(
            monthly_gross=structure.monthly_gross,
            employer_rate=config.esi_employer_rate,
            employee_rate=config.esi_employee_rate,
            wage_ceiling=config.esi_wage_ceiling,
        )
        result.esi_employee = esi.employee_contribution
        result.esi_employer = esi.employer_contribution

    # ── Professional Tax ──
    if config.professional_tax_enabled and config.pt_state and getattr(employee, 'pt_applicable', False):
        result.professional_tax = compute_professional_tax(structure.monthly_gross, config.pt_state)

    # ── TDS ──
    if getattr(employee, 'tds_applicable', False):
        # Gather cumulative TDS already deducted this FY
        tds_already = (
            MonthlyTDS.objects
            .filter(employee=employee, financial_year=fy)
            .exclude(month=month, year=year)
        )
        tds_already_deducted = sum(
            (t.tds_this_month for t in tds_already), ZERO
        )

        # Build declaration-based deductions for old regime
        chapter_via = ZERO
        hra_exemption = ZERO
        previous_employer_salary = ZERO
        previous_employer_tds = ZERO
        other_income = ZERO

        if declaration:
            if regime == "OLD":
                chapter_via = declaration.total_chapter_via_deductions
                hra_exemption = declaration.hra_claimed
            previous_employer_salary = declaration.previous_employer_salary
            previous_employer_tds = declaration.previous_employer_tds
            other_income = declaration.other_income

        annual_gross = structure.annual_gross
        # Add annual EPF employee contribution for old-regime 80C
        annual_epf_employee = result.epf_employee * 12

        tds_result = compute_monthly_tds(
            annual_gross=annual_gross,
            regime=regime,
            current_month=month,
            tds_already_deducted=tds_already_deducted,
            chapter_via_deductions=chapter_via,
            hra_exemption=hra_exemption,
            other_income=other_income,
            previous_employer_salary=previous_employer_salary,
            previous_employer_tds=previous_employer_tds,
        )
        result.tds = tds_result.tds_this_month
        result.estimated_annual_income = tds_result.estimated_annual_income
        result.estimated_annual_tax = tds_result.estimated_annual_tax
        result.cumulative_tds = tds_result.cumulative_tds

    # ── Totals ──
    result.total_employee_deduction = money(
        result.tds + result.epf_employee + result.esi_employee + result.professional_tax
    )
    result.total_employer_cost = money(result.epf_employer + result.esi_employer)

    return result


def _fy_months_before(month: int, year: int) -> list[tuple[int, int]]:
    """Return (month, year) tuples for FY months before the given month."""
    if month >= 4:
        return [(m, year) for m in range(4, month)]
    else:
        return (
            [(m, year - 1) for m in range(4, 13)]
            + [(m, year) for m in range(1, month)]
        )


def get_financial_year(month: int, year: int) -> str:
    """Return FY string like '2026-27' for a given calendar month/year."""
    if month >= 4:
        return f"{year}-{str(year + 1)[2:]}"
    return f"{year - 1}-{str(year)[2:]}"


def get_quarter(month: int) -> str:
    """Return quarter code for a calendar month."""
    if month in (4, 5, 6):
        return "Q1"
    elif month in (7, 8, 9):
        return "Q2"
    elif month in (10, 11, 12):
        return "Q3"
    else:
        return "Q4"
