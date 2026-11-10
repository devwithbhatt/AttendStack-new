from decimal import Decimal

from rest_framework import serializers

from employees.models import Employee
from .models import (
    CompanyTaxConfig,
    SalaryStructure,
    TaxDeclaration,
    MonthlyTDS,
    TDSChallan,
    TDSReturn,
    ProfessionalTaxSlab,
)


class CompanyTaxConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyTaxConfig
        fields = [
            "id",
            "organization",
            "tan_number",
            "default_tax_regime",
            "epf_enabled",
            "epf_employer_rate",
            "epf_employee_rate",
            "epf_wage_ceiling",
            "esi_enabled",
            "esi_employer_rate",
            "esi_employee_rate",
            "esi_wage_ceiling",
            "professional_tax_enabled",
            "pt_state",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SalaryStructureSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    monthly_gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    annual_gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = SalaryStructure
        fields = [
            "id",
            "employee",
            "employee_name",
            "effective_date",
            "annual_ctc",
            "basic",
            "hra",
            "da",
            "special_allowance",
            "conveyance",
            "medical_allowance",
            "lta",
            "other_allowance",
            "employer_pf",
            "employer_esi",
            "monthly_gross",
            "annual_gross",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "monthly_gross", "annual_gross", "created_at", "updated_at"]


class TaxDeclarationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    total_chapter_via_deductions = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True,
    )

    class Meta:
        model = TaxDeclaration
        fields = [
            "id",
            "employee",
            "employee_name",
            "financial_year",
            "tax_regime",
            "status",
            "section_80c",
            "section_80ccd_1b",
            "section_80d_self",
            "section_80d_parents",
            "section_80e",
            "section_80g",
            "section_80tta",
            "hra_claimed",
            "home_loan_interest",
            "home_loan_principal",
            "other_income",
            "previous_employer_salary",
            "previous_employer_tds",
            "total_chapter_via_deductions",
            "submitted_at",
            "verified_by",
            "verified_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "total_chapter_via_deductions",
            "submitted_at",
            "verified_by",
            "verified_at",
            "created_at",
            "updated_at",
        ]


class MonthlyTDSSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = MonthlyTDS
        fields = [
            "id",
            "employee",
            "employee_name",
            "month",
            "year",
            "financial_year",
            "tax_regime",
            "estimated_annual_income",
            "estimated_annual_tax",
            "cumulative_tds",
            "tds_this_month",
            "epf_employee",
            "epf_employer",
            "esi_employee",
            "esi_employer",
            "professional_tax",
            "total_statutory_deduction",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "employee", "employee_name", "month", "year",
            "financial_year", "tax_regime", "estimated_annual_income",
            "estimated_annual_tax", "cumulative_tds", "tds_this_month",
            "epf_employee", "epf_employer", "esi_employee", "esi_employer",
            "professional_tax", "total_statutory_deduction",
            "created_at", "updated_at",
        ]


class TDSChallanSerializer(serializers.ModelSerializer):
    quarter_display = serializers.CharField(source="get_quarter_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TDSChallan
        fields = [
            "id",
            "organization",
            "financial_year",
            "assessment_year",
            "quarter",
            "quarter_display",
            "month",
            "total_tds_amount",
            "interest",
            "fee",
            "total_deposit",
            "cin",
            "bsr_code",
            "challan_serial",
            "payment_date",
            "payment_mode",
            "status",
            "status_display",
            "due_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TDSReturnSerializer(serializers.ModelSerializer):
    quarter_display = serializers.CharField(source="get_quarter_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TDSReturn
        fields = [
            "id",
            "organization",
            "financial_year",
            "quarter",
            "quarter_display",
            "form_type",
            "status",
            "status_display",
            "filing_date",
            "acknowledgement_number",
            "token_number",
            "correction_count",
            "total_tds_deposited",
            "total_employees",
            "due_date",
            "filed_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TaxComputationRequestSerializer(serializers.Serializer):
    annual_gross = serializers.DecimalField(max_digits=12, decimal_places=2)
    regime = serializers.ChoiceField(choices=["NEW", "OLD"], default="NEW")
    chapter_via_deductions = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    hra_exemption = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    other_income = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))


class ProfessionalTaxSlabSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfessionalTaxSlab
        fields = ["id", "state", "salary_from", "salary_to", "monthly_tax", "gender"]
