from django.contrib import admin
from .models import SystemSettings, SettingsChangeLog


class SettingsChangeLogInline(admin.TabularInline):
    model = SettingsChangeLog
    extra = 0
    readonly_fields = ('field_name', 'old_value', 'new_value', 'changed_at', 'changed_by', 'ip_address')
    can_delete = False
    max_num = 0
    ordering = ['-changed_at']


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'shift_start_time', 'late_cutoff_time', 'shift_end_time', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [SettingsChangeLogInline]
    
    def has_add_permission(self, request):
        # Only allow one instance of settings (singleton)
        if self.model.objects.exists():
            return False
        return super().has_add_permission(request)


@admin.register(SettingsChangeLog)
class SettingsChangeLogAdmin(admin.ModelAdmin):
    list_display = ('field_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'ip_address')
    list_filter = ('changed_at', 'field_name')
    search_fields = ('field_name', 'changed_by__first_name', 'changed_by__last_name', 'ip_address')
    readonly_fields = ('field_name', 'old_value', 'new_value', 'changed_at', 'changed_by', 'ip_address', 'settings')
    ordering = ['-changed_at']