import logging

from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework import serializers

from accounts.permissions import IsAdminOrHR
from accounts.models import UserRole
from accounts.services import generate_secure_temp_password, send_employee_welcome_email
from django.contrib.auth import get_user_model
from django.db.models import Case, Exists, IntegerField, OuterRef, Value, When
from django.utils import timezone

from organizations.models import Organization
from .models import Employee, EmployeeStatus, MERGE_REQUEST_SOURCE
from .serializers import (
    EmployeeDirectorySerializer,
    EmployeeListSerializer,
    EmployeeProfileSerializer,
    EmployeeSerializer,
    EmployeeStatusUpdateSerializer,
)
from .services import (
    create_employee_user,
    delete_employee_user,
    reset_employee_user_password,
    sync_employee_user_access,
)

User = get_user_model()
logger = logging.getLogger(__name__)


def request_user_is_full_admin(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or user.is_admin_account))


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

    def create(self, request, *args, **kwargs):
        self._welcome_email_warning = None
        response = super().create(request, *args, **kwargs)
        if self._welcome_email_warning:
            response.data["warning"] = self._welcome_email_warning
        return response

    def get_serializer_class(self):
        user = self.request.user
        from accounts.permissions import check_user_module_permission
        can_view_employees_module = (
            user.is_authenticated
            and (
                user.is_superuser
                or getattr(user, "role", "") == UserRole.SUPER_ADMIN
                or (
                    getattr(user, "role", "") in (UserRole.HR, UserRole.SUB_ADMIN)
                    and check_user_module_permission(user, "employees", "view")
                )
            )
        )
        if self.action == "list":
            return EmployeeListSerializer if can_view_employees_module else EmployeeDirectorySerializer
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

        # Note: `is_staff` deliberately excluded — create_hr()/create_sub_admin()
        # both default it to True for ordinary, org-scoped company accounts,
        # so it is not a reliable "platform-wide admin" signal here.
        is_platform_admin = (
            user.is_superuser
            or getattr(user, 'role', '') == UserRole.SUPER_ADMIN
        )

        if is_platform_admin:
            # Bulk listing is where cross-tenant data actually leaked —
            # require an explicit company before showing a roster. Single-
            # object actions (retrieve/update/delete/status/create-password/
            # etc.) are identified by an unguessable UUID already, so
            # platform admins keep acting on any specific employee without
            # first selecting a company context, same as Django's own admin
            # site — only `list` needs this gate.
            if self.action == "list":
                from organizations.services import resolve_organization_for_request

                organization = resolve_organization_for_request(self.request)
                queryset = queryset.filter(organization=organization) if organization else queryset.none()
        else:
            organization = self._organization_for_user()
            queryset = queryset.filter(organization=organization) if organization else queryset.none()

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

        if self.action == "list":
            # Pending "Merge with existing company" requests get their own
            # Approve/Deny section (see merge_requests below) rather than
            # cluttering the main directory as ordinary Inactive employees.
            queryset = queryset.exclude(external_source=MERGE_REQUEST_SOURCE)

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
            # The company the Super Admin is working in (?organization_id, or
            # the one they own) — never just "the first company".
            from organizations.services import resolve_organization_for_request

            organization = resolve_organization_for_request(self.request)
        else:
            organization = self._organization_for_user()

        employee = serializer.save(organization=organization)

        # Every employee added by HR/Admin needs a way to actually sign in.
        # Provision a login account with a random, never-disclosed password
        # (same pattern as the Company Admin onboarding flow) and email them
        # instructions to set their own via "Forgot password" — rather than
        # leaving them invisible everywhere in Chat/attendance until someone
        # remembers to run "Create Password" manually.
        if not User.objects.filter(email__iexact=employee.email).exists():
            try:
                account_user, _ = create_employee_user(
                    employee, password=generate_secure_temp_password()
                )
            except Exception:
                logger.exception("Unable to create login account for employee %s", employee.id)
                self._welcome_email_warning = (
                    f"Employee created, but a login account could not be provisioned for "
                    f"{employee.email}. Use \"Create Password\" from the employee's profile."
                )
            else:
                try:
                    send_employee_welcome_email(account_user, employee, organization)
                except Exception:
                    logger.exception("Unable to send welcome email for employee %s", employee.id)
                    self._welcome_email_warning = (
                        f"Employee created, but the welcome email could not be sent to "
                        f"{employee.email}. Please share the sign-in link with them manually."
                    )

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
        settings = SystemSettings.get_settings(employee.organization)
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

    def _ensure_may_set_password(self, employee):
        """Employees-module rights must not become an admin takeover: only a
        full-access admin may set the password of an admin's login."""
        if request_user_is_full_admin(self.request.user):
            return
        target = User.objects.filter(email__iexact=employee.email).first()
        if target is not None and target.pk != self.request.user.pk and (
            target.is_admin_account or target.role == UserRole.SUPER_ADMIN
        ):
            raise PermissionDenied("Only a full-access admin can reset an admin's password.")

    @action(detail=True, methods=["post"], url_path="create-password")
    def create_password(self, request, pk=None):
        employee = self.get_object()
        self._ensure_may_set_password(employee)
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

    @action(detail=True, methods=["get", "post"], url_path="assign-role")
    def assign_role(self, request, pk=None):
        """
        GET: the employee's current role assignment (or null if plain Employee).
        POST {role_id}: assign a dynamic Role to this employee's login account.
                         POST {role_id: null} reverts them to a plain Employee.
        """
        employee = self.get_object()
        user = User.objects.filter(email__iexact=employee.email).first()

        if request.method == "GET":
            if not user:
                return Response({"role": None, "has_account": False})
            from roles.serializers import RoleSerializer
            return Response({
                "role": RoleSerializer(user.custom_role).data if user.custom_role_id else None,
                "user_role": user.role,
                "has_account": True,
            })

        if not user:
            raise serializers.ValidationError({
                "detail": "This employee doesn't have a login account yet. Create one first (Create Password action) before assigning a role."
            })

        from roles.models import Role
        from roles.services import assign_role_to_user, unassign_role_from_user

        role_id = request.data.get("role_id")
        if not role_id:
            unassign_role_from_user(user, acting_user=request.user)
            return Response({"detail": f"{employee.full_name} is now a plain Employee with no custom role."})

        role = Role.objects.filter(id=role_id).first()
        if not role:
            raise NotFound("Role not found.")
        assign_role_to_user(request.user, user, role)
        from roles.serializers import RoleSerializer
        return Response({
            "detail": f"{employee.full_name} has been assigned the '{role.name}' role.",
            "role": RoleSerializer(role).data,
        })

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        employee = self.get_object()
        self._ensure_may_set_password(employee)
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

    @action(detail=False, methods=["get"], url_path="merge-requests")
    def merge_requests(self, request):
        """Pending 'Merge with existing company' signups awaiting this
        organization's admin to approve (join as a full teammate) or deny
        (remove the request entirely) — see accounts.OrganizationMergeJoinSerializer."""
        queryset = Employee.objects.filter(external_source=MERGE_REQUEST_SOURCE)

        from organizations.services import resolve_organization_for_request

        organization = resolve_organization_for_request(request)
        queryset = queryset.filter(organization=organization) if organization else queryset.none()

        queryset = queryset.order_by("-created_at")
        serializer = EmployeeListSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="approve-merge-request")
    def approve_merge_request(self, request, pk=None):
        employee = self.get_object()
        if employee.external_source != MERGE_REQUEST_SOURCE:
            raise NotFound("This employee has no pending join request.")

        employee.status = EmployeeStatus.ACTIVE
        employee.external_source = ""
        employee.save(update_fields=["status", "external_source", "updated_at"])
        sync_employee_user_access(employee)

        serializer = EmployeeListSerializer(employee, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="deny-merge-request")
    def deny_merge_request(self, request, pk=None):
        employee = self.get_object()
        if employee.external_source != MERGE_REQUEST_SOURCE:
            raise NotFound("This employee has no pending join request.")

        delete_employee_user(employee)
        employee.delete()
        return Response({"detail": "Join request denied and removed."})
