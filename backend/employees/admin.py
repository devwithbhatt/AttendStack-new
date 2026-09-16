from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_id",
        "full_name",
        "email",
        "department",
        "designation",
        "status",
    )
    list_filter = ("department", "status", "employment_type", "pay_frequency")
    search_fields = ("employee_id", "full_name", "email", "phone", "aadhaar_number")
    ordering = ("full_name",)
    readonly_fields = ("id", "created_at", "updated_at")