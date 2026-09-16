from rest_framework import serializers

from employees.models import ATTENDANCE_ELIGIBLE_STATUSES, Employee
from .models import Project, ProjectStatus, Task, TaskPriority, TaskStatus


class ProjectSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    created_by_role = serializers.CharField(source="created_by.get_role_display", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    task_count = serializers.IntegerField(read_only=True, default=0)
    completed_task_count = serializers.IntegerField(read_only=True, default=0)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "name", "key", "description", "status", "status_label", "owner", "owner_name", "created_by_name", "created_by_role",
            "department", "start_date", "due_date", "color", "task_count", "completed_task_count",
            "progress", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status_label", "owner_name", "task_count", "completed_task_count", "progress", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name() or obj.created_by.email

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Project name must be at least 3 characters.")
        return value

    def validate_key(self, value):
        value = value.strip().upper().replace(" ", "-")
        if not value or len(value) > 12 or not value.replace("-", "").isalnum():
            raise serializers.ValidationError("Use up to 12 letters, numbers, or hyphens for the project key.")
        return value

    def validate_color(self, value):
        value = value.strip()
        if len(value) != 7 or not value.startswith("#"):
            raise serializers.ValidationError("Use a hex color in the form #4f46e5.")
        return value

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        due_date = attrs.get("due_date", getattr(self.instance, "due_date", None))

        if start_date and due_date and due_date < start_date:
            raise serializers.ValidationError({"due_date": "Project due date cannot be before the start date."})
        return attrs

    def get_progress(self, obj):
        total = getattr(obj, "task_count", 0)
        complete = getattr(obj, "completed_task_count", 0)
        return round((complete / total) * 100) if total else 0


class TaskSerializer(serializers.ModelSerializer):
    assignee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False)
    assignees = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), many=True, required=False)
    assignee_uuid = serializers.UUIDField(source="assignee.id", read_only=True)
    assignee_id = serializers.CharField(source="assignee.employee_id", read_only=True)
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True)
    assignee_names = serializers.SerializerMethodField()
    assignee_email = serializers.EmailField(source="assignee.email", read_only=True)
    assignee_department = serializers.CharField(source="assignee.department", read_only=True)
    assignee_designation = serializers.CharField(source="assignee.designation", read_only=True)
    assignee_avatar_url = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    project_name = serializers.CharField(source="project.name", read_only=True, default=None)
    project_key = serializers.CharField(source="project.key", read_only=True, default=None)
    project_color = serializers.CharField(source="project.color", read_only=True, default=None)
    parent_title = serializers.CharField(source="parent.title", read_only=True, default=None)
    subtask_count = serializers.IntegerField(read_only=True, default=0)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()
    employee_attachment_url = serializers.SerializerMethodField()
    employee_attachment_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "project",
            "project_name",
            "project_key",
            "project_color",
            "parent",
            "parent_title",
            "subtask_count",
            "assignee",
            "assignees",
            "assignee_uuid",
            "assignee_id",
            "assignee_name",
            "assignee_names",
            "assignee_email",
            "assignee_department",
            "assignee_designation",
            "assignee_avatar_url",
            "assigned_by_name",
            "priority",
            "priority_label",
            "status",
            "status_label",
            "due_date",
            "start_date",
            "position",
            "department",
            "project_category",
            "attachment",
            "attachment_url",
            "attachment_name",
            "employee_attachment",
            "employee_attachment_url",
            "employee_attachment_name",
            "employee_notes",
            "admin_notes",
            "completed_at",
            "is_overdue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "assignee_uuid",
            "assignee_id",
            "assignee_name",
            "assignee_names",
            "assignee_email",
            "assignee_department",
            "assignee_designation",
            "assignee_avatar_url",
            "assigned_by_name",
            "project_name",
            "project_key",
            "project_color",
            "parent_title",
            "subtask_count",
            "priority_label",
            "status_label",
            "attachment_url",
            "attachment_name",
            "employee_attachment_url",
            "employee_attachment_name",
            "completed_at",
            "is_overdue",
            "created_at",
            "updated_at",
        ]

    def get_assignee_avatar_url(self, obj):
        if not obj.assignee.profile_photo:
            return None
        request = self.context.get("request")
        url = obj.assignee.profile_photo.url
        return request.build_absolute_uri(url) if request else url

    def get_assignee_names(self, obj):
        return [employee.full_name for employee in obj.assignees.all()]

    def create(self, validated_data):
        assignees = validated_data.pop("assignees", [])
        task = super().create(validated_data)
        task.assignees.set(assignees or [task.assignee])
        return task

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        task = super().update(instance, validated_data)
        if assignees is None:
            task.assignees.add(task.assignee)
        else:
            task.assignees.set(assignees)
        return task

    def get_assigned_by_name(self, obj):
        if obj.assigned_by is None:
            return None
        return obj.assigned_by.get_full_name() or obj.assigned_by.email

    def get_attachment_url(self, obj):
        return self._absolute_file_url(obj.attachment)

    def get_attachment_name(self, obj):
        return self._file_name(obj.attachment)

    def get_employee_attachment_url(self, obj):
        return self._absolute_file_url(obj.employee_attachment)

    def get_employee_attachment_name(self, obj):
        return self._file_name(obj.employee_attachment)

    def _absolute_file_url(self, file_field):
        if not file_field:
            return None
        request = self.context.get("request")
        url = file_field.url
        return request.build_absolute_uri(url) if request else url

    def _file_name(self, file_field):
        if not file_field:
            return None
        return file_field.name.rsplit("/", 1)[-1]

    def validate_attachment(self, value):
        if value and value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Attachment size cannot exceed 10 MB.")
        return value

    def validate_employee_attachment(self, value):
        if value and value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Employee attachment size cannot exceed 10 MB.")
        return value

    def validate_title(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Task title must be at least 3 characters.")
        return value

    def validate(self, attrs):
        assignees = attrs.get("assignees")
        assignee = attrs.get("assignee", getattr(self.instance, "assignee", None))
        if assignees is not None:
            if not assignees:
                # Employee task creation supplies the logged-in employee in the view.
                # HTML multipart forms may represent an omitted multi-value field as [].
                if assignee is None:
                    attrs.pop("assignees", None)
                else:
                    attrs["assignees"] = [assignee]
            elif assignee not in assignees:
                attrs["assignee"] = assignees[0]
        elif self.instance is None and assignee is not None:
            attrs["assignees"] = [assignee]
        project = attrs.get("project", getattr(self.instance, "project", None))
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        due_date = attrs.get("due_date", getattr(self.instance, "due_date", None))

        employees_to_validate = attrs.get("assignees") or ([attrs.get("assignee", assignee)] if attrs.get("assignee", assignee) else [])
        blocked = [
            employee.full_name
            for employee in employees_to_validate
            if employee.status not in ATTENDANCE_ELIGIBLE_STATUSES
        ]
        if blocked:
            raise serializers.ValidationError({
                "assignees": (
                    "Tasks cannot be assigned to Inactive or Terminated employees: "
                    + ", ".join(blocked)
                    + "."
                )
            })

        if self.instance is None and project is None:
            raise serializers.ValidationError({"project": "Choose a project before creating a task."})
        if parent:
            if parent == self.instance:
                raise serializers.ValidationError({"parent": "A task cannot be its own parent."})
            if project and parent.project_id != project.id:
                raise serializers.ValidationError({"parent": "A subtask must belong to the same project as its parent."})
            # Allow unlimited nested subtasks while preventing an ancestor cycle.
            ancestor = parent
            while ancestor is not None:
                if self.instance and ancestor.pk == self.instance.pk:
                    raise serializers.ValidationError({"parent": "A task cannot be moved below one of its own subtasks."})
                ancestor = ancestor.parent
        if start_date and due_date and due_date < start_date:
            raise serializers.ValidationError({"due_date": "Task due date cannot be before the start date."})
        return attrs

    def validate_department(self, value):
        return value.strip()

    def validate_project_category(self, value):
        return value.strip()


class EmployeeTaskStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            TaskStatus.PENDING,
            TaskStatus.TODO,
            TaskStatus.IN_PROGRESS,
            TaskStatus.ON_HOLD,
            TaskStatus.COMPLETED,
            TaskStatus.CLOSED,
        ]
    )
    employee_notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    employee_attachment = serializers.FileField(required=False, allow_empty_file=False)
    priority = serializers.ChoiceField(choices=TaskPriority.choices, required=False)

    def validate_employee_attachment(self, value):
        if value and value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Employee attachment size cannot exceed 10 MB.")
        return value


class TaskChoiceSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


def task_status_choices():
    return [{"value": value, "label": label} for value, label in TaskStatus.choices]


def task_priority_choices():
    return [{"value": value, "label": label} for value, label in TaskPriority.choices]


def project_status_choices():
    return [{"value": value, "label": label} for value, label in ProjectStatus.choices]
