from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserRole
from employees.models import ATTENDANCE_ELIGIBLE_STATUSES, Employee
from organizations.models import Organization
from .models import Project, Task, TaskStatus
from .serializers import (
    EmployeeTaskStatusSerializer,
    ProjectSerializer,
    TaskSerializer,
    project_status_choices,
    task_priority_choices,
    task_status_choices,
)


class TaskPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    # The workspace performs client-side project/status filtering and therefore
    # needs the complete company workload for medium-sized organizations.
    max_page_size = 500


class WorkspaceAccessMixin:
    """Organization-aware access helpers shared by projects and tasks."""

    def _is_admin_or_hr(self, user):
        return user.role in (UserRole.SUPER_ADMIN, UserRole.HR, UserRole.SUB_ADMIN) or user.is_staff

    def _current_employee(self, required=True):
        employee = Employee.objects.filter(email__iexact=self.request.user.email).first()
        if employee is None and self.request.user.employee_id:
            employee = Employee.objects.filter(employee_id=self.request.user.employee_id).first()
        if employee is None and required:
            raise NotFound("No employee profile is linked to this login account.")
        return employee

    def _organization_for_user(self, required=True):
        from organizations.services import get_organization_for_user
        organization = get_organization_for_user(self.request.user)
        if organization is not None:
            return organization
        if not required:
            return None
        raise PermissionDenied("Set up a company workspace before managing projects and tasks.")

    def _organization_for_project_creation(self):
        try:
            return self._organization_for_user()
        except PermissionDenied:
            # Preserve existing system-admin workspaces created before
            # organizations were introduced. They remain unscoped until a
            # company workspace is created in Security Settings.
            if self.request.user.is_superuser:
                return None
            raise

    def _validate_employee_scope(self, employee):
        if self.request.user.is_superuser:
            return
        organization = self._organization_for_user(required=False)
        if organization is None:
            if employee.organization_id is None:
                return
            raise PermissionDenied("Set up a company workspace before assigning employees from a company workspace.")
        if employee.organization_id != organization.id:
            raise PermissionDenied("You can only assign work within your organization.")

    def _ensure_work_eligible(self, employee):
        if employee.status not in ATTENDANCE_ELIGIBLE_STATUSES:
            raise PermissionDenied(
                "Project tasks are unavailable while your employment status is Inactive or Terminated."
            )

    def _validate_project_scope(self, project):
        if self.request.user.is_superuser:
            return
        if not self._is_admin_or_hr(self.request.user):
            # Legacy employee records can legitimately have no organization yet.
            # They may still work in projects they own or already participate in.
            employee = self._current_employee()
            has_project_access = (
                project.owner_id == employee.id
                or Task.objects.filter(project=project).filter(
                    Q(assignee=employee) | Q(assignees=employee) | Q(assigned_by=self.request.user)
                ).exists()
            )
            if has_project_access:
                return
            raise PermissionDenied("You do not have access to this project.")
        organization = self._organization_for_user(required=False)
        if organization is None:
            if project.organization_id is None:
                return
            raise PermissionDenied("Set up a company workspace before managing projects and tasks.")
        if project.organization_id != organization.id:
            raise PermissionDenied("This project is outside your organization.")


class ProjectViewSet(WorkspaceAccessMixin, viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]
    permission_module = "tasks"
    pagination_class = TaskPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "key", "description", "department", "owner__full_name"]
    ordering_fields = ["name", "created_at", "updated_at", "due_date", "status"]
    ordering = ["status", "due_date", "name"]

    def get_queryset(self):
        queryset = Project.objects.select_related("owner", "created_by", "organization").annotate(
            task_count=Count("tasks", distinct=True),
            completed_task_count=Count(
                "tasks", filter=Q(tasks__status__in=[TaskStatus.COMPLETED, TaskStatus.CLOSED]), distinct=True
            ),
        )
        user = self.request.user
        if self._is_admin_or_hr(user) and not user.is_superuser:
            organization = self._organization_for_user(required=False)
            queryset = queryset.filter(organization=organization)
        elif not user.is_superuser:
            # Employees see projects that contain their assigned/created work, even
            # when a legacy employee profile has no organization relationship yet.
            employee = self._current_employee()
            queryset = queryset.filter(
                Q(owner=employee) | Q(tasks__assignee=employee) | Q(tasks__assignees=employee) | Q(tasks__assigned_by=user)
            ).distinct()

        project_status = self.request.query_params.get("status")
        department = self.request.query_params.get("department")
        if project_status:
            queryset = queryset.filter(status=project_status.upper())
        if department:
            queryset = queryset.filter(department__iexact=department)
        return queryset

    def perform_create(self, serializer):
        owner = serializer.validated_data.get("owner")
        if self._is_admin_or_hr(self.request.user):
            organization = self._organization_for_project_creation()
            if owner:
                self._validate_employee_scope(owner)
                organization = owner.organization
        else:
            # Employees can start shared projects, but cannot make another person the owner.
            owner = self._current_employee()
            self._ensure_work_eligible(owner)
            organization = owner.organization
        if Project.objects.filter(organization=organization, key=serializer.validated_data["key"]).exists():
            raise ValidationError({"key": "This project key is already in use in your organization."})
        serializer.save(organization=organization, owner=owner, created_by=self.request.user)

    def perform_update(self, serializer):
        project = serializer.instance
        if not self._is_admin_or_hr(self.request.user) and project.created_by_id != self.request.user.id:
            raise PermissionDenied("You can edit only projects you created.")
        if not self._is_admin_or_hr(self.request.user):
            self._ensure_work_eligible(self._current_employee())
        if not self._is_admin_or_hr(self.request.user) and "owner" in serializer.validated_data:
            raise PermissionDenied("Employees cannot change the project owner.")
        owner = serializer.validated_data.get("owner")
        if owner:
            self._validate_employee_scope(owner)
        key = serializer.validated_data.get("key", project.key)
        organization = owner.organization if owner else project.organization
        if Project.objects.filter(organization=organization, key=key).exclude(pk=project.pk).exists():
            raise ValidationError({"key": "This project key is already in use in your organization."})
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        project = self.get_object()
        if not self._is_admin_or_hr(request.user) and project.created_by_id != request.user.id:
            raise PermissionDenied("You can delete only projects you created.")
        if not self._is_admin_or_hr(request.user):
            self._ensure_work_eligible(self._current_employee())
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="choices")
    def choices(self, request):
        return Response({"statuses": project_status_choices()})


class TaskViewSet(WorkspaceAccessMixin, viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    permission_module = "tasks"
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = TaskPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "title", "description", "project__name", "project__key", "parent__title",
        "assignee__full_name", "assignee__employee_id", "assignee__department", "assignees__full_name", "assignees__employee_id", "assignees__department", "department", "project_category",
    ]
    ordering_fields = ["created_at", "updated_at", "due_date", "priority", "status", "position"]
    ordering = ["position", "status", "due_date", "-created_at"]

    def get_queryset(self):
        queryset = Task.objects.select_related("assignee", "assigned_by", "project", "parent").prefetch_related("assignees").annotate(
            subtask_count=Count("subtasks", distinct=True)
        )
        user = self.request.user
        if self._is_admin_or_hr(user):
            if not user.is_superuser:
                organization = self._organization_for_user(required=False)
                queryset = queryset.filter(
                    Q(project__organization=organization) |
                    Q(assignee__organization=organization) |
                    Q(assignees__organization=organization)
                )
        else:
            employee = self._current_employee()
            queryset = queryset.filter(Q(assignee=employee) | Q(assignees=employee) | Q(assigned_by=user))

        params = self.request.query_params
        status_filter = params.get("status")
        priority = params.get("priority")
        assignee = params.get("assignee")
        department = params.get("department")
        project_category = params.get("project_category")
        project = params.get("project")
        parent = params.get("parent")
        due_from = params.get("due_from")
        due_to = params.get("due_to")
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())
        if priority:
            queryset = queryset.filter(priority=priority.upper())
        if assignee and self._is_admin_or_hr(user):
            queryset = queryset.filter(Q(assignee_id=assignee) | Q(assignees__id=assignee))
        if department:
            queryset = queryset.filter(department__iexact=department)
        if project_category:
            queryset = queryset.filter(project_category__icontains=project_category)
        if project:
            queryset = queryset.filter(project_id=project)
        if parent == "root":
            queryset = queryset.filter(parent__isnull=True)
        elif parent:
            queryset = queryset.filter(parent_id=parent)
        if due_from:
            queryset = queryset.filter(due_date__gte=due_from)
        if due_to:
            queryset = queryset.filter(due_date__lte=due_to)
        return queryset.distinct()

    def _validate_parent_access(self, parent, employee):
        if not parent:
            return
        if self._is_admin_or_hr(self.request.user):
            return
        if parent.assignee_id != employee.id and not parent.assignees.filter(id=employee.id).exists() and parent.assigned_by_id != self.request.user.id:
            raise PermissionDenied("You can add subtasks only to work you own or are assigned.")

    def perform_create(self, serializer):
        project = serializer.validated_data["project"]
        parent = serializer.validated_data.get("parent")
        self._validate_project_scope(project)

        if self._is_admin_or_hr(self.request.user):
            assignees = serializer.validated_data.get("assignees") or [serializer.validated_data["assignee"]]
            for assignee in assignees:
                self._validate_employee_scope(assignee)
            employee = self._current_employee(required=False)
            self._validate_parent_access(parent, employee)
        else:
            employee = self._current_employee()
            self._ensure_work_eligible(employee)
            self._validate_parent_access(parent, employee)
            requested_assignees = serializer.validated_data.get("assignees") or [serializer.validated_data.get("assignee", employee)]
            for assignee in requested_assignees:
                self._validate_employee_scope(assignee)
        primary_assignee = serializer.validated_data.get("assignee") or (serializer.validated_data.get("assignees") or [employee])[0]
        save_fields = {
            "assigned_by": self.request.user,
            "department": serializer.validated_data.get("department") or primary_assignee.department,
        }
        serializer.save(**save_fields)

    def perform_update(self, serializer):
        task = serializer.instance
        if not self._is_admin_or_hr(self.request.user):
            employee = self._current_employee()
            self._ensure_work_eligible(employee)
            assignees = serializer.validated_data.get("assignees") or [serializer.validated_data.get("assignee", task.assignee)]
            for assignee in assignees:
                self._validate_employee_scope(assignee)
            self._validate_parent_access(serializer.validated_data.get("parent", task.parent), employee)
        project = serializer.validated_data.get("project", task.project)
        if project:
            self._validate_project_scope(project)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        if not self._is_admin_or_hr(request.user) and task.assigned_by_id != request.user.id:
            raise PermissionDenied("You can delete only tasks you created.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        task = self.get_object()
        user = request.user
        if not self._is_admin_or_hr(user):
            employee = self._current_employee()
            self._ensure_work_eligible(employee)
            if task.assignee_id != employee.id and not task.assignees.filter(id=employee.id).exists():
                raise PermissionDenied("You can update only your assigned tasks.")
            if task.status == TaskStatus.CANCELLED:
                raise ValidationError({"detail": "Cancelled tasks cannot be updated by employees."})

        allowed_fields = {"status", "priority", "employee_notes", "employee_attachment"}
        unexpected = set(request.data.keys()) - allowed_fields
        if unexpected:
            raise ValidationError({"detail": "Only status, priority, employee notes, and employee attachment can be updated here."})
        serializer = EmployeeTaskStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task.status = serializer.validated_data["status"]
        if "priority" in serializer.validated_data:
            task.priority = serializer.validated_data["priority"]
        if "employee_notes" in serializer.validated_data:
            task.employee_notes = serializer.validated_data["employee_notes"]
        if "employee_attachment" in serializer.validated_data:
            task.employee_attachment = serializer.validated_data["employee_attachment"]
        task.save(update_fields=["status", "priority", "employee_notes", "employee_attachment", "completed_at", "updated_at"])
        return Response(TaskSerializer(task, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="choices")
    def choices(self, request):
        return Response({"statuses": task_status_choices(), "priorities": task_priority_choices()})

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        queryset = self.get_queryset()
        counts = queryset.values("status").annotate(total=Count("id"))
        by_status = {row["status"]: row["total"] for row in counts}
        overdue = queryset.filter(due_date__isnull=False, due_date__lt=timezone.localdate()).exclude(
            status__in=[TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELLED]
        )
        return Response({
            "total": queryset.count(), "pending": by_status.get(TaskStatus.PENDING, 0),
            "todo": by_status.get(TaskStatus.TODO, 0), "in_progress": by_status.get(TaskStatus.IN_PROGRESS, 0),
            "on_hold": by_status.get(TaskStatus.ON_HOLD, 0), "completed": by_status.get(TaskStatus.COMPLETED, 0),
            "closed": by_status.get(TaskStatus.CLOSED, 0), "cancelled": by_status.get(TaskStatus.CANCELLED, 0),
            "overdue": overdue.count(),
        }, status=status.HTTP_200_OK)
