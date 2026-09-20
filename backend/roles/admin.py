from django.contrib import admin

from .models import Role, RolePermission


class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 0


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "is_admin", "is_system", "created_at")
    list_filter = ("is_admin", "is_system", "organization")
    search_fields = ("name", "organization__name")
    inlines = [RolePermissionInline]
