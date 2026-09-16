import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from employees.models import Employee
from organizations.models import Organization


class TaskPriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


class TaskStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    TODO = "TODO", "To Do"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    ON_HOLD = "ON_HOLD", "On Hold"
    COMPLETED = "COMPLETED", "Completed"
    CLOSED = "CLOSED", "Closed"
    CANCELLED = "CANCELLED", "Cancelled"


class ProjectStatus(models.TextChoices):
    PLANNING = "PLANNING", "Planning"
    ACTIVE = "ACTIVE", "Active"
    ON_HOLD = "ON_HOLD", "On Hold"
    COMPLETED = "COMPLETED", "Completed"
    ARCHIVED = "ARCHIVED", "Archived"


class Project(models.Model):
    """A shared work container. Tasks always belong to one project going forward."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="projects", null=True, blank=True
    )
    name = models.CharField(max_length=160)
    key = models.CharField(max_length=12, db_index=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=ProjectStatus.choices, default=ProjectStatus.ACTIVE, db_index=True)
    owner = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="owned_projects")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_projects")
    department = models.CharField(max_length=120, blank=True, db_index=True)
    start_date = models.DateField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True, db_index=True)
    color = models.CharField(max_length=7, default="#4f46e5")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "due_date", "name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "key"], name="unique_project_key_per_organization"),
        ]
        indexes = [models.Index(fields=["organization", "status"]), models.Index(fields=["owner", "status"])]

    def __str__(self):
        return f"{self.key} · {self.name}"


class Task(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks", blank=True, null=True)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, related_name="subtasks", blank=True, null=True)
    assignee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="assigned_tasks",
    )
    assignees = models.ManyToManyField(
        Employee,
        related_name="collaborative_tasks",
        blank=True,
        help_text="All employees responsible for this task. The primary assignee is retained for legacy workflows.",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
    )
    priority = models.CharField(
        max_length=20,
        choices=TaskPriority.choices,
        default=TaskPriority.MEDIUM,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=TaskStatus.choices,
        default=TaskStatus.PENDING,
        db_index=True,
    )
    due_date = models.DateField(blank=True, null=True, db_index=True)
    start_date = models.DateField(blank=True, null=True)
    position = models.PositiveIntegerField(default=0)
    department = models.CharField(max_length=120, blank=True, db_index=True)
    project_category = models.CharField(max_length=120, blank=True, db_index=True)
    attachment = models.FileField(upload_to="tasks/attachments/", blank=True, null=True)
    employee_attachment = models.FileField(
        upload_to="tasks/employee-attachments/",
        blank=True,
        null=True,
    )
    employee_notes = models.TextField(blank=True)
    admin_notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "due_date", "-created_at"]
        indexes = [
            models.Index(fields=["project", "parent", "status"]),
            models.Index(fields=["assignee", "status"]),
            models.Index(fields=["priority", "due_date"]),
            models.Index(fields=["department", "project_category"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.title} - {self.assignee.full_name}"

    @property
    def is_overdue(self):
        return (
            self.due_date is not None
            and self.status not in (TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELLED)
            and self.due_date < timezone.localdate()
        )

    def save(self, *args, **kwargs):
        if self.status in (TaskStatus.COMPLETED, TaskStatus.CLOSED) and self.completed_at is None:
            self.completed_at = timezone.now()
        elif self.status not in (TaskStatus.COMPLETED, TaskStatus.CLOSED):
            self.completed_at = None
        super().save(*args, **kwargs)
