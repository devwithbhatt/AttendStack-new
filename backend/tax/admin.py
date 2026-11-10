from django.contrib import admin

from .models import (
    CompanyTaxConfig,
    SalaryStructure,
    TaxDeclaration,
    MonthlyTDS,
    ProfessionalTaxSlab,
    TDSChallan,
    TDSReturn,
)


@admin.register(CompanyTaxConfig)
class CompanyTaxConfigAdmin(admin.ModelAdmin):
    list_display = ("organization", "tan_number", "default_tax_regime", "epf_enabled", "esi_enabled", "professional_tax_enabled")
    list_filter = ("default_tax_regime", "epf_enabled", "esi_enabled")


@admin.register(SalaryStructure)
class SalaryStructureAdmin(admin.ModelAdmin):
    list_display = ("employee", "annual_ctc", "basic", "hra", "effective_date")
    search_fields = ("employee__full_name",)


@admin.register(TaxDeclaration)
class TaxDeclarationAdmin(admin.ModelAdmin):
    list_display = ("employee", "financial_year", "tax_regime", "status", "section_80c")
    list_filter = ("financial_year", "tax_regime", "status")
    search_fields = ("employee__full_name",)


@admin.register(MonthlyTDS)
class MonthlyTDSAdmin(admin.ModelAdmin):
    list_display = ("employee", "month", "year", "tds_this_month", "epf_employee", "professional_tax", "total_statutory_deduction")
    list_filter = ("financial_year", "year", "month")
    search_fields = ("employee__full_name",)


@admin.register(ProfessionalTaxSlab)
class ProfessionalTaxSlabAdmin(admin.ModelAdmin):
    list_display = ("state", "salary_from", "salary_to", "monthly_tax", "gender")
    list_filter = ("state",)


@admin.register(TDSChallan)
class TDSChallanAdmin(admin.ModelAdmin):
    list_display = ("organization", "financial_year", "quarter", "month", "total_deposit", "status", "due_date")
    list_filter = ("financial_year", "status", "quarter")


@admin.register(TDSReturn)
class TDSReturnAdmin(admin.ModelAdmin):
    list_display = ("organization", "financial_year", "quarter", "status", "total_employees", "total_tds_deposited", "due_date")
    list_filter = ("financial_year", "status", "quarter")
