from django.contrib import admin
from .models import Payroll

@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
    list_display = ("employee", "month", "year", "basic_salary", "allowances", "deductions", "net_salary", "status", "paid_on")
    list_filter = ("status", "year", "month")
    search_fields = ("employee__full_name",)
    ordering = ("-year", "-month", "employee__full_name")
