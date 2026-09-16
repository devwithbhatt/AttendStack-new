from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("employee", "date", "check_in", "check_out", "status", "total_hours")
    list_filter = ("status", "date", "employee__department")
    search_fields = ("employee__full_name", "employee__employee_id", "employee__email")
    readonly_fields = ("created_at", "updated_at")

    def save_model(self, request, obj, form, change):
        obj.save(auto_refresh_status="status" not in form.changed_data)
