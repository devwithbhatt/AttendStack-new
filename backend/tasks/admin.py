from django.contrib import admin

from .models import Project, Task


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "organization", "owner", "status", "due_date")
    list_filter = ("status", "organization", "department")
    search_fields = ("key", "name", "description", "owner__full_name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "project",
        "parent",
        "assignee",
        "department",
        "project_category",
        "priority",
        "status",
        "due_date",
        "assigned_by",
    )
    list_filter = ("project", "status", "priority", "due_date", "department", "project_category", "assignee__department")
    search_fields = (
        "title",
        "department",
        "project_category",
        "project__name",
        "assignee__full_name",
        "assignee__employee_id",
        "assignee__email",
    )
    readonly_fields = ("completed_at", "created_at", "updated_at")
