from datetime import datetime
from django.utils import timezone
from rest_framework import serializers

from employees.models import Employee
from .models import AttendanceRecord, LeaveRequest, LeaveStatus
from .services import monthly_leave_limit_error, monthly_leave_limit_snapshot


def parse_time_or_datetime(value, date_val):
    if not value:
        return None
    
    # If already a datetime object, return it
    if isinstance(value, datetime):
        return value
        
    # 1. Try parsing ISO format (e.g. 2026-05-18T09:30:00Z)
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if timezone.is_aware(dt):
            return dt
        return timezone.make_aware(dt)
    except ValueError:
        pass
        
    # 2. Try parsing HH:MM or HH:MM:SS format and combine with date_val
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            t = datetime.strptime(value, fmt).time()
            if isinstance(date_val, str):
                d = datetime.strptime(date_val, "%Y-%m-%d").date()
            else:
                d = date_val
            
            dt = datetime.combine(d, t)
            local_tz = timezone.get_current_timezone()
            return timezone.make_aware(dt, local_tz)
        except ValueError:
            pass
            
    raise serializers.ValidationError("Invalid time format. Expected HH:MM, HH:MM:SS, or full ISO datetime.")


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        write_only=True,
        required=False,
    )
    employee_id = serializers.CharField(source="employee.employee_id", read_only=True)
    employee_uuid = serializers.UUIDField(source="employee.id", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    employee_email = serializers.EmailField(source="employee.email", read_only=True)
    employee_department = serializers.CharField(source="employee.department", read_only=True)
    employee_designation = serializers.CharField(source="employee.designation", read_only=True)
    employee_avatar_url = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    live_status = serializers.CharField(read_only=True)
    total_hours = serializers.CharField(read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "employee",
            "employee_uuid",
            "employee_id",
            "employee_name",
            "employee_email",
            "employee_department",
            "employee_designation",
            "employee_avatar_url",
            "date",
            "check_in",
            "check_out",
            "total_hours",
            "status",
            "status_label",
            "live_status",
            "is_paid",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_uuid",
            "employee_id",
            "employee_name",
            "employee_email",
            "employee_department",
            "employee_designation",
            "employee_avatar_url",
            "total_hours",
            "status_label",
            "live_status",
            "is_paid",
            "created_at",
            "updated_at",
        ]

    def get_employee_avatar_url(self, obj):
        if not obj.employee.profile_photo:
            return None
        request = self.context.get("request")
        url = obj.employee.profile_photo.url
        return request.build_absolute_uri(url) if request else url

    def to_internal_value(self, data):
        data = data.copy()
        
        # Get date
        date_val = data.get("date")
        if not date_val and self.instance:
            date_val = self.instance.date
        if not date_val:
            date_val = timezone.localdate()
            
        if "check_in" in data:
            try:
                data["check_in"] = parse_time_or_datetime(data["check_in"], date_val)
            except Exception as e:
                raise serializers.ValidationError({"check_in": str(e)})
                
        if "check_out" in data:
            try:
                data["check_out"] = parse_time_or_datetime(data["check_out"], date_val)
            except Exception as e:
                raise serializers.ValidationError({"check_out": str(e)})
                
        return super().to_internal_value(data)

    def validate(self, attrs):
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        date_val = attrs.get("date", getattr(self.instance, "date", None))
        
        # If creating a new record
        if not self.instance:
            if not employee:
                raise serializers.ValidationError({"employee": "This field is required for new records."})
            if not date_val:
                date_val = timezone.localdate()
                attrs["date"] = date_val
                
            if AttendanceRecord.objects.filter(employee=employee, date=date_val).exists():
                raise serializers.ValidationError(
                    "An attendance record already exists for this employee on this date."
                )

        if employee and date_val:
            if date_val < employee.joining_date:
                raise serializers.ValidationError(
                    {"date": "Attendance cannot be recorded before the employee's joining date."}
                )
            if not employee.is_attendance_eligible_on(date_val):
                raise serializers.ValidationError(
                    {
                        "employee": (
                            "Attendance cannot be recorded for an employee who was "
                            "Inactive or Terminated on this date."
                        )
                    }
                )
        return attrs

    def create(self, validated_data):
        manual_status = "status" in self.initial_data
        record = AttendanceRecord(**validated_data)
        if manual_status and record.status == "HALF_DAY" and not record.leave_request_id:
            record.is_paid = False
        record.save(auto_refresh_status=not manual_status)
        return record

    def update(self, instance, validated_data):
        manual_status = "status" in self.initial_data
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if manual_status and instance.status == "HALF_DAY" and not instance.leave_request_id:
            instance.is_paid = False
        instance.save(auto_refresh_status=not manual_status)
        return instance


class TodayAttendanceSerializer(serializers.Serializer):
    employee_uuid = serializers.UUIDField()
    employee_id = serializers.CharField()
    employee_name = serializers.CharField()
    employee_email = serializers.EmailField()
    employee_department = serializers.CharField()
    employee_designation = serializers.CharField()
    employee_avatar_url = serializers.CharField(allow_null=True)
    record_id = serializers.IntegerField(allow_null=True)
    date = serializers.DateField()
    check_in = serializers.DateTimeField(allow_null=True)
    check_out = serializers.DateTimeField(allow_null=True)
    total_hours = serializers.CharField(allow_null=True)
    status = serializers.CharField()
    status_label = serializers.CharField()
    live_status = serializers.CharField()


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False
    )
    employee_uuid = serializers.UUIDField(source="employee.id", read_only=True)
    employee_id = serializers.CharField(source="employee.employee_id", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    employee_email = serializers.EmailField(source="employee.email", read_only=True)
    employee_department = serializers.CharField(source="employee.department", read_only=True)
    employee_designation = serializers.CharField(source="employee.designation", read_only=True)
    employee_avatar_url = serializers.SerializerMethodField()
    leave_type_label = serializers.CharField(source="get_leave_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    def get_employee_avatar_url(self, obj):
        if not obj.employee.profile_photo:
            return None
        request = self.context.get("request")
        url = obj.employee.profile_photo.url
        return request.build_absolute_uri(url) if request else url

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "employee",
            "employee_uuid",
            "employee_id",
            "employee_name",
            "employee_email",
            "employee_department",
            "employee_designation",
            "employee_avatar_url",
            "start_date",
            "end_date",
            "leave_type",
            "is_half_day",
            "leave_type_label",
            "attachment",
            "reason",
            "status",
            "status_label",
            "admin_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_uuid",
            "employee_id",
            "employee_name",
            "employee_email",
            "employee_department",
            "employee_designation",
            "leave_type_label",
            "status_label",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        leave_type = attrs.get("leave_type", getattr(self.instance, "leave_type", None))
        is_half_day = attrs.get("is_half_day", getattr(self.instance, "is_half_day", False))

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "End date cannot be before start date."})

        if is_half_day:
            if start_date != end_date:
                raise serializers.ValidationError({"end_date": "A half-day leave must start and end on the same date."})
            if leave_type not in {"CASUAL", "SICK"}:
                raise serializers.ValidationError({"leave_type": "Half-day leave is available only for Casual or Sick leave."})

        if employee and start_date and start_date < employee.joining_date:
            raise serializers.ValidationError({
                "start_date": "Leave cannot start before the employee's joining date."
            })

        if employee and start_date and end_date:
            overlapping_requests = LeaveRequest.objects.filter(
                employee=employee,
                start_date__lte=end_date,
                end_date__gte=start_date,
            ).exclude(status=LeaveStatus.REJECTED)

            if self.instance:
                overlapping_requests = overlapping_requests.exclude(pk=self.instance.pk)

            if overlapping_requests.exists():
                raise serializers.ValidationError(
                    {"detail": "A pending or approved leave request already exists for this date range."}
                )

            target_status = attrs.get(
                "status",
                getattr(self.instance, "status", LeaveStatus.PENDING),
            )
            if target_status != LeaveStatus.REJECTED:
                snapshot = monthly_leave_limit_snapshot(
                    employee,
                    start_date,
                    end_date,
                    leave_type,
                    is_half_day,
                    exclude_request=self.instance,
                )
                leave_type_label = dict(LeaveRequest._meta.get_field("leave_type").choices).get(
                    leave_type,
                    leave_type,
                )
                policy_error = monthly_leave_limit_error(snapshot, leave_type_label)
                if policy_error:
                    raise serializers.ValidationError({"detail": policy_error})

        return attrs

    def validate_attachment(self, value):
        allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}
        filename = value.name.lower()
        extension = filename[filename.rfind("."):] if "." in filename else ""

        if extension not in allowed_extensions:
            raise serializers.ValidationError(
                "Upload a PDF, image, Word document, or supported document file."
            )
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Attachment size cannot exceed 5 MB.")
        return value
