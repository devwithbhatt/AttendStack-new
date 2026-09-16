from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from rest_framework import serializers

from accounts.permissions import IsAdminOrHR
from accounts.models import UserRole
from django.contrib.auth import get_user_model
from django.db.models import Case, Exists, IntegerField, OuterRef, Value, When
from django.utils import timezone

from organizations.models import Organization
from .models import Employee, EmployeeStatus
from .serializers import (
    EmployeeDirectorySerializer,
    EmployeeListSerializer,
    EmployeeProfileSerializer,
    EmployeeSerializer,
    EmployeeStatusUpdateSerializer,
)
from .services import (
    create_employee_user,
    reset_employee_user_password,
    sync_employee_user_access,
)

User = get_user_model()


class EmployeeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    permission_classes = [IsAdminOrHR]
    permission_module = "employees"
    queryset = Employee.objects.all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["full_name", "email", "employee_id", "department", "designation"]
    ordering_fields = ["full_name", "joining_date", "department", "created_at", "status"]
    ordering = ["status_sort", "full_name"]

    def get_permissions(self):
        if self.action in ("list", "me"):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        user = self.request.user
        is_admin_or_hr = (
            user.is_authenticated
            and (
                user.is_superuser
                or getattr(user, "role", "") in (UserRole.SUPER_ADMIN, UserRole.HR, UserRole.SUB_ADMIN)
                or user.is_staff
            )
        )
        if self.action == "list":
            return EmployeeListSerializer if is_admin_or_hr else EmployeeDirectorySerializer
        if self.action == "me":
            return EmployeeProfileSerializer
        return EmployeeSerializer

    def _organization_for_user(self):
        user = self.request.user
        if not user.is_authenticated or user.is_superuser or getattr(user, 'role', '') == UserRole.SUPER_ADMIN:
            return None
        from organizations.services import get_organization_for_user
        return get_organization_for_user(user)

    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()

        if getattr(user, 'role', '') == UserRole.SUB_ADMIN:
            from accounts.permissions import check_user_module_permission
            if not check_user_module_permission(user, "employees", "view"):
                return queryset.none()

        if not user.is_superuser and getattr(user, 'role', '') != UserRole.SUPER_ADMIN:
            organization = self._organization_for_user()
            if organization is None:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(organization=organization)

        queryset = queryset.annotate(
            account_exists_annotation=Exists(User.objects.filter(email__iexact=OuterRef("email"), role=UserRole.EMPLOYEE)),
            status_sort=Case(
                When(status=EmployeeStatus.ACTIVE, then=Value(0)),
                When(status=EmployeeStatus.PROVISION, then=Value(1)),
                When(status=EmployeeStatus.ON_LEAVE, then=Value(2)),
                When(status=EmployeeStatus.NOTICE_PERIOD, then=Value(3)),
                When(status=EmployeeStatus.INACTIVE, then=Value(4)),
                When(status=EmployeeStatus.TERMINATED, then=Value(5)),
                default=Value(6),
                output_field=IntegerField(),
            ),
        )
        department = self.request.query_params.get("department")
        status_filter = self.request.query_params.get("status")

        if department:
            queryset = queryset.filter(department__iexact=department)
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())

        # Auto-sync status for active date range transitions
        today = timezone.localdate()
        for emp in list(queryset):
            emp.sync_status(today)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        organization = None

        if user.is_superuser or getattr(user, 'role', '') == UserRole.SUPER_ADMIN:
            # For superusers, assign the first organization as a default
            organization = Organization.objects.first()
        else:
            organization = self._organization_for_user()

        serializer.save(organization=organization)

    def get_serializer_class(self):
        if self.action == "list":
            return EmployeeListSerializer
        if self.action == "me":
            return EmployeeProfileSerializer
        return super().get_serializer_class()

    def get_current_employee(self):
        user = self.request.user
        employee = Employee.objects.filter(email__iexact=user.email).first()

        if employee is None and user.employee_id:
            employee = Employee.objects.filter(employee_id=user.employee_id).first()

        return employee

    @action(detail=False, methods=["get", "put", "patch"], url_path="me")
    def me(self, request):
        employee = self.get_current_employee()
        if employee is None:
            raise NotFound("No employee profile is linked to this login account.")

        if request.method in ["PUT", "PATCH"]:
            serializer = self.get_serializer(
                employee,
                data=request.data,
                partial=request.method == "PATCH",
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = EmployeeSerializer(employee, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["get", "patch"], url_path="leave-policy")
    def leave_policy(self, request, pk=None):
        """Admin view of an employee's entitlement, balances, overrides, and leave history."""
        employee = self.get_object()

        if request.method == "PATCH":
            class LeaveOverrideSerializer(serializers.ModelSerializer):
                class Meta:
                    model = Employee
                    fields = ("casual_leave_days_override", "sick_leave_days_override")

            serializer = LeaveOverrideSerializer(employee, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()

            from attendance.services import rebalance_paid_leave_attendance
            rebalance_paid_leave_attendance()
            employee.refresh_from_db()

        from attendance.models import AttendanceRecord, LeaveRequest, LeaveStatus, LeaveType
        from attendance.serializers import LeaveRequestSerializer
        from attendance.services import earned_leave_allocation, leave_units
        from settings.models import SystemSettings

        year = timezone.localdate().year
        settings = SystemSettings.get_settings()
        records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=employee,
            date__year=year,
            is_paid=True,
            leave_request__status=LeaveStatus.APPROVED,
        )
        used_by_type = {}
        for record in records:
            leave_type = record.leave_request.leave_type
            used_by_type[leave_type] = used_by_type.get(leave_type, 0) + leave_units(record.leave_request)

        balances = []
        for leave_type, label in LeaveType.choices:
            entitlement = earned_leave_allocation(settings, leave_type, employee, timezone.localdate())
            used = used_by_type.get(leave_type, 0)
            balances.append({
                "leave_type": leave_type,
                "label": label,
                "entitlement": float(entitlement),
                "used": float(used),
                "remaining": float(max(entitlement - used, 0)),
            })

        requests = LeaveRequest.objects.filter(employee=employee).order_by("-created_at")
        return Response({
            "year": year,
            "joining_date": employee.joining_date,
            "is_prorated": employee.joining_date.year == year,
            "eligible_months": 13 - employee.joining_date.month if employee.joining_date.year == year else 12,
            "casual_leave_days_override": employee.casual_leave_days_override,
            "sick_leave_days_override": employee.sick_leave_days_override,
            "company_casual_leave_days": settings.casual_leave_days,
            "company_sick_leave_days": settings.sick_leave_days,
            "balances": balances,
            "leave_requests": LeaveRequestSerializer(requests, many=True, context={"request": request}).data,
        })

    @action(detail=True, methods=["post"], url_path="create-password")
    def create_password(self, request, pk=None):
        employee = self.get_object()
        user_exists = User.objects.filter(email__iexact=employee.email).exists()

        if user_exists:
            user, employee_password = reset_employee_user_password(
                employee,
                password=request.data.get("password"),
            )
            return Response(
                {
                    "detail": "Login account password updated successfully.",
                    "employee_id": employee.employee_id,
                    "user_id": str(user.id),
                    "email": user.email,
                    "temporary_password": employee_password,
                }
            )

        user, employee_password = create_employee_user(
            employee,
            password=request.data.get("password"),
        )
        return Response(
            {
                "detail": "Login account created successfully.",
                "employee_id": employee.employee_id,
                "user_id": str(user.id),
                "email": user.email,
                "temporary_password": employee_password,
            }
        )

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        employee = self.get_object()
        user, employee_password = reset_employee_user_password(
            employee,
            password=request.data.get("password"),
        )
        return Response(
            {
                "detail": "Password reset successfully.",
                "employee_id": employee.employee_id,
                "user_id": str(user.id),
                "email": user.email,
                "temporary_password": employee_password,
            }
        )

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        employee = self.get_object()
        serializer = EmployeeStatusUpdateSerializer(
            data=request.data,
            context={"employee": employee},
        )
        serializer.is_valid(raise_exception=True)

        employee.status = serializer.validated_data["status"]
        employee.status_end_date = serializer.validated_data.get("end_date")
        employee.auto_transition_status = serializer.validated_data.get("auto_transition_status")
        employee._status_effective_date = serializer.validated_data["effective_date"]

        employee.save(update_fields=["status", "status_end_date", "auto_transition_status", "updated_at"])
        sync_employee_user_access(employee)

        try:
            from payroll.increment_service import sync_employee_increments
            sync_employee_increments(employee)
        except Exception:
            pass

        response_serializer = EmployeeListSerializer(employee, context={"request": request})
        return Response(response_serializer.data)
