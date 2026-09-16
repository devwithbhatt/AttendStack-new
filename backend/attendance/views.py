import ipaddress
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from django.apps import apps
from rest_framework.response import Response
from ipware import get_client_ip
from geopy.distance import geodesic

from accounts.permissions import IsAdminOrHR, check_user_module_permission
from accounts.models import UserRole
from organizations.models import Organization
from employees.models import (
    ATTENDANCE_ELIGIBLE_STATUSES,
    ATTENDANCE_WORKING_STATUSES,
    Employee,
    EmployeeStatus,
)
from settings.models import SystemSettings
from .eligibility import attendance_eligible_records
from .models import AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveStatus, LeaveType
from .permissions import IsAdminOrReadOnly
from .serializers import AttendanceRecordSerializer, TodayAttendanceSerializer, LeaveRequestSerializer
from .services import (
    auto_mark_calendar_days,
    earned_leave_allocation,
    leave_allocation,
    leave_units,
    monthly_leave_limit_error,
    monthly_leave_limit_snapshot,
    sync_leave_request_attendance,
)


def get_ip_address(request):
    """Get the real client IP address, respecting proxies and load balancers."""
    ip, _ = get_client_ip(request)
    return ip or "0.0.0.0"


def ip_is_allowed(client_ip: str, allowed_ranges: str) -> bool:
    """
    Check whether client_ip is permitted by the configured allowed_ip_ranges.
    Supports both exact IPs (e.g. 203.0.113.5) and CIDR notation (e.g. 192.168.1.0/24).
    Returns True if any range matches.
    """
    try:
        client = ipaddress.ip_address(client_ip)
    except ValueError:
        return False

    for raw in allowed_ranges.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            # Handles both single IPs and CIDR ranges uniformly
            network = ipaddress.ip_network(raw, strict=False)
            if client in network:
                return True
        except ValueError:
            # Invalid entry in the allow-list — skip it safely
            continue
    return False


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 31
    page_size_query_param = 'page_size'
    max_page_size = 100


class AttendanceRecordViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAdminOrReadOnly]
    permission_module = "attendance"
    queryset = AttendanceRecord.objects.select_related("employee").all()
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.action in ["check_in", "check_out"]:
            return [IsAuthenticated()]
        return super().get_permissions()

    def _organization_for_user(self):
        from organizations.services import get_organization_for_user
        return get_organization_for_user(self.request.user)

    def get_queryset(self):
        queryset = attendance_eligible_records(super().get_queryset())
        user = self.request.user
        
        params = self.request.query_params

        date_from = params.get("date_from")
        date_to = params.get("date_to")
        year = params.get("year")
        month = params.get("month")
        day = params.get("day")
        status_filter = params.get("status")
        search = params.get("search")

        # By default, only return today's records unless specific filters are provided
        if self.action == "list" and not any([date_from, date_to, year, month, day, search]):
            queryset = queryset.filter(date=timezone.now().date())

        # Enforce organization data isolation
        if not (user.is_superuser or getattr(user, 'role', '') == "SUPER_ADMIN"):
            org = self._organization_for_user()
            if org:
                queryset = queryset.filter(employee__organization=org)
            else:
                queryset = queryset.none()

        # Enforce data isolation: Employees can only view their own records
        if user.is_authenticated and getattr(user, 'role', '') == "EMPLOYEE":
            queryset = queryset.filter(employee__email__iexact=user.email)

        queryset = queryset.filter(
            date__lte=timezone.now().date(),
            date__gte=F("employee__joining_date"),
        )

        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        if year:
            queryset = queryset.filter(date__year=year)
        if month:
            queryset = queryset.filter(date__month=month)
        if day:
            queryset = queryset.filter(date__day=day)
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())
        if search:
            queryset = queryset.filter(
                Q(employee__full_name__icontains=search)
                | Q(employee__employee_id__icontains=search)
                | Q(employee__email__icontains=search)
            )

        return queryset

    def paginate_queryset(self, queryset):
        # If filtering by month, return all results for that month without pagination.
        if 'month' in self.request.query_params:
            return None
        return super().paginate_queryset(queryset)

    def _current_employee(self, require_working_status=True):
        employee = Employee.objects.filter(email__iexact=self.request.user.email).first()
        if employee is None and self.request.user.employee_id:
            employee = Employee.objects.filter(employee_id=self.request.user.employee_id).first()
        if employee is None:
            raise NotFound("No employee profile is linked to this login account.")
        if not require_working_status:
            return employee

        today = timezone.localdate()
        employment_status = employee.status_on(today)
        if employment_status not in ATTENDANCE_ELIGIBLE_STATUSES:
            raise ValidationError(
                {"detail": "Attendance is unavailable while your employment status is Inactive or Terminated."}
            )
        if employment_status not in ATTENDANCE_WORKING_STATUSES:
            raise ValidationError(
                {"detail": "Check-in and check-out are unavailable while your status is On Leave."}
            )
        if today < employee.joining_date:
            raise ValidationError({"detail": "Attendance is available from your joining date."})
        return employee

    def _today_record(self, employee):
        today = timezone.localdate()
        return AttendanceRecord.objects.filter(employee=employee, date=today).first()

    def _avatar_url(self, employee):
        if not employee.profile_photo:
            return None
        return self.request.build_absolute_uri(employee.profile_photo.url)

    def _today_payload(self, employee, record=None):
        today = timezone.localdate()
        employment_status = getattr(employee, "attendance_status_on_date", employee.status)
        default_status = (
            AttendanceStatus.LEAVE
            if employment_status == EmployeeStatus.ON_LEAVE
            else AttendanceStatus.ABSENT
        )
        default_status_label = "Leave" if default_status == AttendanceStatus.LEAVE else "Absent"
        return {
            "employee_uuid": employee.id,
            "employee_id": employee.employee_id,
            "employee_name": employee.full_name,
            "employee_email": employee.email,
            "employee_department": employee.department,
            "employee_designation": employee.designation,
            "employee_avatar_url": self._avatar_url(employee),
            "record_id": record.id if record else None,
            "date": record.date if record else today,
            "check_in": record.check_in if record else None,
            "check_out": record.check_out if record else None,
            "total_hours": record.total_hours if record else None,
            "status": record.status if record else default_status,
            "status_label": record.get_status_display() if record else default_status_label,
            "live_status": record.live_status if record else default_status_label,
        }

    @action(detail=False, methods=["get"], url_path="today")
    def today(self, request):
        today = timezone.localdate()
        auto_mark_calendar_days(today.month, today.year)
        
        user = request.user
        org = self._organization_for_user()

        records_qs = AttendanceRecord.objects.select_related("employee").filter(date=today)
        employees_qs = Employee.objects.attendance_eligible_on(today).filter(
            joining_date__lte=today,
        ).order_by("full_name")

        if org:
            records_qs = records_qs.filter(employee__organization=org)
            employees_qs = employees_qs.filter(organization=org)
        elif not (user.is_superuser or getattr(user, 'role', '') == "SUPER_ADMIN"):
            records_qs = records_qs.none()
            employees_qs = employees_qs.none()

        records = {
            record.employee.id: record
            for record in records_qs
        }
        payload = [self._today_payload(employee, records.get(employee.id)) for employee in employees_qs]
        serializer = TodayAttendanceSerializer(payload, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        # Employment-status restrictions apply to punching attendance, not to
        # read-only access to the employee's own historical records.
        employee = self._current_employee(require_working_status=False)
        queryset = self.get_queryset().filter(employee=employee)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="me/today")
    def me_today(self, request):
        employee = self._current_employee()
        today = timezone.localdate()
        auto_mark_calendar_days(today.month, today.year)
        record = self._today_record(employee)
        serializer = TodayAttendanceSerializer(self._today_payload(employee, record))
        return Response(serializer.data)

    def _validate_location_and_ip(self, request, action_label: str = "attendance"):
        """
        Shared validator for both check-in and check-out.
        Enforces IP restriction (with full CIDR support) and geofencing.
        When both are enabled, either a whitelisted IP or a valid location is accepted.
        Returns a dict of location data captured (may be empty if restrictions are off).
        Raises ValidationError with a clear, user-friendly message on any violation.
        """
        SystemSettings = apps.get_model('settings', 'SystemSettings')
        settings = SystemSettings.get_settings()
        location_data = {}

        # Detect client IP
        client_ip = get_ip_address(request)
        location_data["ip"] = client_ip

        allowed_ranges = settings.allowed_ip_ranges or ""
        on_office_network = False
        if allowed_ranges.strip():
            on_office_network = ip_is_allowed(client_ip, allowed_ranges)
        ip_restriction_required = settings.ip_restriction_enabled and not settings.geofencing_enabled

        # ―――――――――― IP Restriction ――――――――――
        if ip_restriction_required:
            if not allowed_ranges.strip():
                raise ValidationError({
                    "detail": (
                        f"IP restriction is enabled but no allowed IPs are configured. "
                        f"Please contact your administrator."
                    )
                })

            if not on_office_network:
                raise ValidationError({
                    "detail": (
                        f"Access denied: Your current IP address ({client_ip}) is not authorised "
                        f"to mark {action_label}. Please connect to the office network and try again."
                    ),
                    "code": "IP_RESTRICTED",
                    "client_ip": client_ip,
                })

        # ―――――――――― Geofencing ――――――――――
        if settings.geofencing_enabled:
            # If the user is connected to the office network (whitelisted IP),
            # we automatically bypass geofence restriction since they are physically in the office.
            if settings.ip_restriction_enabled and on_office_network:
                raw_lat = request.data.get("latitude")
                raw_lon = request.data.get("longitude")
                if raw_lat is not None and raw_lon is not None:
                    try:
                        location_data["latitude"] = float(raw_lat)
                        location_data["longitude"] = float(raw_lon)
                    except (ValueError, TypeError):
                        pass
                return location_data

            if settings.office_latitude is None or settings.office_longitude is None:
                raise ValidationError({
                    "detail": (
                        "Geofencing is enabled but office coordinates are not set. "
                        "Please contact your administrator."
                    )
                })

            raw_lat = request.data.get("latitude")
            raw_lon = request.data.get("longitude")
            # Optional: client-provided accuracy in meters (from Geolocation API)
            raw_acc = request.data.get("accuracy")

            if raw_lat is None or raw_lon is None:
                raise ValidationError({
                    "detail": (
                        f"Your GPS location is required to mark {action_label}. "
                        f"Please allow location access in your browser and try again."
                    ),
                    "code": "LOCATION_REQUIRED",
                })

            try:
                user_lat = float(raw_lat)
                user_lon = float(raw_lon)
                accuracy_m = float(raw_acc) if raw_acc is not None else None
            except (ValueError, TypeError):
                raise ValidationError({
                    "detail": "Invalid location coordinates received. Please try again."
                })

            office_lat = float(settings.office_latitude)
            office_lon = float(settings.office_longitude)
            if not (-90.0 <= office_lat <= 90.0) or not (-180.0 <= office_lon <= 180.0):
                raise ValidationError({
                    "detail": (
                        "Configured office coordinates are invalid. Please contact your administrator."
                    )
                })

            if not (-90.0 <= user_lat <= 90.0) or not (-180.0 <= user_lon <= 180.0):
                raise ValidationError({
                    "detail": "Invalid GPS coordinates received. Please try again."
                })

            office_location = (office_lat, office_lon)
            user_location = (user_lat, user_lon)
            distance_m = int(geodesic(user_location, office_location).meters)
            # Also compute distance if user coordinates were accidentally swapped (lat<->lon)
            try:
                swapped_distance_m = int(geodesic((user_lon, user_lat), office_location).meters)
            except Exception:
                swapped_distance_m = distance_m

            # Use the smallest plausible distance (handles accidental swap)
            effective_distance_m = min(distance_m, swapped_distance_m)

            allowed_radius = getattr(settings, "geofence_radius", None) or 100

            # If the device reports poor accuracy that exceeds reasonable bounds, ask user to improve
            if accuracy_m is not None and accuracy_m > 5000:
                raise ValidationError({
                    "detail": (
                        "Location accuracy is too low for a reliable geofence check. "
                        "Ensure device location mode is set to high accuracy (GPS) and try again."
                    ),
                    "code": "LOW_ACCURACY",
                    "reported_accuracy_meters": int(accuracy_m),
                })

            # Accept if within allowed radius OR if reported accuracy covers the distance
            within_radius = effective_distance_m <= allowed_radius
            covered_by_accuracy = (accuracy_m is not None) and (effective_distance_m <= (allowed_radius + accuracy_m))

            if not (within_radius or covered_by_accuracy):
                raise ValidationError({
                    "detail": (
                        f"Location check failed: You are {effective_distance_m}m away from the office. "
                        f"{action_label.capitalize()} is only allowed within {allowed_radius}m of the office. "
                        f"Please move closer and try again."
                    ),
                    "code": "OUTSIDE_GEOFENCE",
                    "distance_meters": effective_distance_m,
                    "allowed_radius_meters": allowed_radius,
                    "office_location": {
                        "latitude": office_lat,
                        "longitude": office_lon,
                    },
                    "user_location": {
                        "latitude": user_lat,
                        "longitude": user_lon,
                        "accuracy_meters": int(accuracy_m) if accuracy_m is not None else None,
                        "swapped_distance_meters": swapped_distance_m if swapped_distance_m != distance_m else None,
                    },
                })

            location_data["latitude"] = user_lat
            location_data["longitude"] = user_lon

        return location_data

    # Keep backward-compatible alias
    def _validate_check_in(self, request):
        return self._validate_location_and_ip(request, action_label="check-in")

    @action(detail=False, methods=["post"], url_path="check-in")
    def check_in(self, request):
        # 1. Validate location & IP restrictions
        location_data = self._validate_location_and_ip(request, action_label="check-in")

        # 2. Get or create today's record
        employee = self._current_employee()
        today = timezone.localdate()
        record, created = AttendanceRecord.objects.get_or_create(employee=employee, date=today)

        if (
            record.leave_request_id
            and record.leave_request.status == LeaveStatus.APPROVED
            and not record.leave_request.is_half_day
        ):
            raise ValidationError({
                "detail": (
                    "Check-in is unavailable because approved full-day leave is recorded for today. "
                    "Contact HR if the leave should be cancelled."
                )
            })
        if record.check_in:
            raise ValidationError({"detail": "You have already checked in today."})

        # 3. Save the check-in with audit trail
        record.check_in = timezone.now()
        record.check_in_ip = location_data.get("ip")
        record.check_in_latitude = location_data.get("latitude")
        record.check_in_longitude = location_data.get("longitude")
        record.refresh_status()
        record.save(auto_refresh_status=False)

        serializer = self.get_serializer(record)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="check-out")
    def check_out(self, request):
        # 1. Validate location & IP restrictions (same rules as check-in)
        location_data = self._validate_location_and_ip(request, action_label="check-out")

        # 2. Verify the employee has an open check-in
        employee = self._current_employee()
        record = self._today_record(employee)

        if record is None or not record.check_in:
            raise ValidationError({"detail": "Please check in before checking out."})
        if record.check_out:
            raise ValidationError({"detail": "You have already checked out today."})

        # 3. Save the check-out with audit trail
        record.check_out = timezone.now()
        record.check_out_ip = location_data.get("ip")
        record.check_out_latitude = location_data.get("latitude")
        record.check_out_longitude = location_data.get("longitude")
        record.refresh_status()
        record.save(auto_refresh_status=False)

        serializer = self.get_serializer(record)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="auto-mark")
    def auto_mark(self, request):
        """Create missing Sunday and holiday records without overriding edits."""

        month = request.data.get("month")
        year = request.data.get("year")

        if not month or not year:
            return Response(
                {"detail": "Both month and year are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            month = int(month)
            year = int(year)
        except ValueError:
            return Response(
                {"detail": "Month and year must be valid integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()
        if year > today.year or (year == today.year and month > today.month):
            return Response(
                {"detail": "Cannot auto-mark attendance for future months."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = auto_mark_calendar_days(month, year)

        return Response(
            {
                "detail": "Auto-marking completed successfully.",
                "created": result["created"],
                "updated": result.get("updated", 0),
                "skipped": result["skipped"],
            },
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = self.request.user

        if getattr(user, 'role', '') == UserRole.SUB_ADMIN:
            if not check_user_module_permission(user, "attendance", "delete"):
                return Response(
                    {"detail": "You do not have permission to delete attendance records."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        elif user.role not in ["SUPER_ADMIN", "HR"] and instance.employee.email != user.email:
            return Response(
                {"detail": "You do not have permission to delete this record."},
                status=status.HTTP_403_FORBIDDEN,
            )

        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="my-ip", permission_classes=[IsAuthenticated])
    def my_ip(self, request):
        """
        Returns the detected IP address of the requesting client.
        Used by the admin settings page to easily find the correct IP to whitelist.
        """
        SystemSettings = apps.get_model('settings', 'SystemSettings')
        settings = SystemSettings.get_settings()
        client_ip = get_ip_address(request)

        # Check if this IP is already in the allow-list
        allowed_ranges = settings.allowed_ip_ranges or ""
        is_allowed = ip_is_allowed(client_ip, allowed_ranges) if settings.ip_restriction_enabled else None

        return Response({
            "client_ip": client_ip,
            "ip_restriction_enabled": settings.ip_restriction_enabled,
            "is_currently_allowed": is_allowed,
            "allowed_ranges": allowed_ranges,
        })


class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.select_related("employee").all()
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]
    permission_module = "leaves"
    pagination_class = StandardResultsSetPagination

    def _is_admin_or_hr(self, user):
        return user.role in ["SUPER_ADMIN", "HR", "SUB_ADMIN"] or user.is_staff

    def _current_employee(self):
        employee = Employee.objects.filter(email__iexact=self.request.user.email).first()
        if employee is None and self.request.user.employee_id:
            employee = Employee.objects.filter(employee_id=self.request.user.employee_id).first()
        if employee is None:
            raise ValidationError({"detail": "No employee profile is linked to this user account."})
        return employee

    def _ensure_leave_eligible(self, employee):
        if employee.status_on(timezone.localdate()) not in ATTENDANCE_ELIGIBLE_STATUSES:
            raise PermissionDenied(
                "Leave requests are unavailable while your employment status is Inactive or Terminated."
            )

    @action(detail=False, methods=["get"], url_path="types")
    def get_leave_types(self, request):
        """
        Returns a list of all available leave types.
        """
        return Response([
            {"value": choice[0], "label": choice[1]}
            for choice in LeaveType.choices
        ])

    @action(detail=False, methods=["get"], url_path="balance")
    def balance(self, request):
        """Return the authenticated employee's authoritative prorated leave balance."""
        employee = self._current_employee()
        year = timezone.localdate().year
        settings = SystemSettings.get_settings()
        paid_records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=employee, date__year=year, is_paid=True,
            leave_request__status=LeaveStatus.APPROVED,
        )
        used_by_type = {}
        for record in paid_records:
            leave_type = record.leave_request.leave_type
            used_by_type[leave_type] = used_by_type.get(leave_type, Decimal("0")) + leave_units(record.leave_request)

        balances = []
        for leave_type, label in LeaveType.choices:
            entitlement = earned_leave_allocation(settings, leave_type, employee, timezone.localdate())
            used = used_by_type.get(leave_type, Decimal("0"))
            balances.append({
                "leave_type": leave_type, "label": label,
                "entitlement": float(entitlement), "used": float(used),
                "remaining": float(max(entitlement - used, Decimal("0"))),
            })
        return Response({
            "year": year,
            "is_prorated": employee.joining_date.year == year,
            "eligible_months": 13 - employee.joining_date.month if employee.joining_date.year == year else 12,
            "balances": balances,
        })

    @action(detail=False, methods=["get"], url_path="preview")
    def preview(self, request):
        """Return a non-persisted paid-leave and payroll impact estimate for an employee."""
        try:
            start_date = date.fromisoformat(request.query_params["start_date"])
            end_date = date.fromisoformat(request.query_params["end_date"])
        except (KeyError, ValueError):
            raise ValidationError({"detail": "Provide valid start_date and end_date values."})
        if start_date > end_date:
            raise ValidationError({"detail": "End date cannot be before start date."})
        leave_type = request.query_params.get("leave_type", LeaveType.CASUAL)
        if leave_type not in LeaveType.values:
            raise ValidationError({"leave_type": "Choose a valid leave type."})

        is_half_day = request.query_params.get("is_half_day", "false").lower() in {"1", "true", "yes"}
        if is_half_day and start_date != end_date:
            raise ValidationError({"end_date": "A half-day leave must start and end on the same date."})
        if is_half_day and leave_type not in {LeaveType.CASUAL, LeaveType.SICK}:
            raise ValidationError({"leave_type": "Half-day leave is available only for Casual or Sick leave."})

        employee = self._current_employee()
        self._ensure_leave_eligible(employee)
        excluded_request = None
        exclude_id = request.query_params.get("exclude_id")
        if exclude_id:
            excluded_request = LeaveRequest.objects.filter(pk=exclude_id, employee=employee).first()
        settings = SystemSettings.get_settings()
        monthly_snapshot = monthly_leave_limit_snapshot(
            employee,
            start_date,
            end_date,
            leave_type,
            is_half_day,
            exclude_request=excluded_request,
        )
        selected_dates = []
        current = start_date
        while current <= end_date:
            selected_dates.append(current)
            current += timedelta(days=1)

        used_by_year: dict[int, Decimal] = {}
        paid_leave_records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=employee,
            leave_request__status=LeaveStatus.APPROVED,
            leave_request__leave_type=leave_type,
            is_paid=True,
        )
        if excluded_request:
            paid_leave_records = paid_leave_records.exclude(leave_request=excluded_request)
        for record in paid_leave_records:
            used_by_year[record.date.year] = used_by_year.get(record.date.year, Decimal("0")) + leave_units(record.leave_request)

        units_per_day = Decimal("0.5") if is_half_day else Decimal("1")
        paid_days = Decimal("0")
        unpaid_days = Decimal("0")
        deduction = Decimal("0")
        selected_years = {leave_date.year for leave_date in selected_dates}
        available_before = sum(
            max(
                earned_leave_allocation(settings, leave_type, employee, start_date if year == start_date.year else date(year, 1, 1))
                - used_by_year.get(year, Decimal("0")),
                Decimal("0"),
            )
            for year in selected_years
        )
        for leave_date in selected_dates:
            used = used_by_year.get(leave_date.year, Decimal("0"))
            earned = earned_leave_allocation(settings, leave_type, employee, leave_date)
            if used + units_per_day <= earned:
                paid_days += units_per_day
                used_by_year[leave_date.year] = used + units_per_day
            else:
                unpaid_days += units_per_day
                monthly_salary = Decimal(str(employee.annual_salary or 0)) / Decimal("12")
                days_in_month = (leave_date.replace(day=28) + timedelta(days=4)).replace(day=1) - leave_date.replace(day=1)
                deduction += (monthly_salary / Decimal(str(days_in_month.days))) * units_per_day
        monthly_periods = [
            {
                **period,
                "limit": float(period["limit"]),
                "used": float(period["used"]),
                "requested": float(period["requested"]),
                "remaining": float(period["remaining"]),
                "remaining_after_request": float(period["remaining_after_request"]),
                "projected": float(period["projected"]),
            }
            for period in monthly_snapshot["periods"]
        ]
        monthly_policy_error = monthly_leave_limit_error(
            monthly_snapshot,
            dict(LeaveType.choices).get(leave_type, leave_type),
        )
        return Response({
            "total_days": float(Decimal(len(selected_dates)) * units_per_day),
            "paid_leave_available": float(available_before),
            "paid_leave_used": float(paid_days),
            "unpaid_leave_days": float(unpaid_days),
            "estimated_salary_deduction": str(deduction.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "currency": "INR",
            "monthly_limit": float(monthly_snapshot["limit"]) if monthly_snapshot["limit"] is not None else None,
            "monthly_periods": monthly_periods,
            "monthly_limit_exceeded": bool(monthly_snapshot["violations"]),
            "monthly_limit_message": monthly_policy_error,
            "note": "Estimate only. Casual and Sick Leave are paid only from credits earned through the request month; unused credits accumulate during the calendar year. Future credits cannot be used in advance.",
        })

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        # Isolation: Employees only see their own leave requests
        if user.is_authenticated and not self._is_admin_or_hr(user):
            queryset = queryset.filter(
                Q(employee__email__iexact=user.email) | Q(employee__employee_id=user.employee_id)
            )
        elif user.is_authenticated and not (user.is_superuser or getattr(user, 'role', '') == "SUPER_ADMIN"):
            if getattr(user, 'role', '') == UserRole.SUB_ADMIN:
                if not check_user_module_permission(user, "leaves", "view"):
                    return queryset.none()
            from organizations.services import get_organization_for_user
            org = get_organization_for_user(user)
            if org:
                queryset = queryset.filter(employee__organization=org)
            else:
                queryset = queryset.none()

        return queryset.filter(end_date__gte=F("employee__joining_date"))

    def _raise_if_leave_overlaps(self, employee, start_date, end_date, instance=None):
        overlapping_requests = LeaveRequest.objects.filter(
            employee=employee,
            start_date__lte=end_date,
            end_date__gte=start_date,
        ).exclude(status=LeaveStatus.REJECTED)
        if instance:
            overlapping_requests = overlapping_requests.exclude(pk=instance.pk)
        if overlapping_requests.exists():
            raise ValidationError(
                {"detail": "A pending or approved leave request already exists for this date range."}
            )

    def _validate_half_day_approval(self, serializer):
        """Validate attendance prerequisites before approving a leave request."""
        instance = serializer.instance
        target_status = serializer.validated_data.get("status", instance.status if instance else LeaveStatus.PENDING)
        is_half_day = serializer.validated_data.get("is_half_day", instance.is_half_day if instance else False)
        start_date = serializer.validated_data.get("start_date", instance.start_date if instance else None)
        end_date = serializer.validated_data.get("end_date", instance.end_date if instance else None)

        if target_status != LeaveStatus.APPROVED or not start_date or not end_date:
            return

        employee = serializer.validated_data.get("employee", instance.employee if instance else None)
        if not is_half_day:
            punched_record_exists = AttendanceRecord.objects.filter(
                employee=employee,
                date__range=(start_date, end_date),
            ).filter(Q(check_in__isnull=False) | Q(check_out__isnull=False)).exists()
            if punched_record_exists:
                raise ValidationError({
                    "detail": (
                        "Full-day leave cannot be approved for a date that already has attendance punches. "
                        "Use a half-day request or correct the attendance record first."
                    )
                })
            return

        # Only require checkout if the half-day is for today or a past date
        from django.utils import timezone
        today = timezone.localdate()
        if start_date <= today:
            record = AttendanceRecord.objects.filter(employee=employee, date=start_date).first()
            if record is None or not record.check_out:
                raise ValidationError({
                    "detail": "A half-day leave for today or a past date can only be approved after the employee has checked out."
                })

    def _validate_monthly_policy(self, serializer, employee):
        instance = serializer.instance
        target_status = serializer.validated_data.get(
            "status",
            instance.status if instance else LeaveStatus.PENDING,
        )
        if target_status == LeaveStatus.REJECTED:
            return
        start_date = serializer.validated_data.get(
            "start_date",
            instance.start_date if instance else None,
        )
        end_date = serializer.validated_data.get(
            "end_date",
            instance.end_date if instance else None,
        )
        leave_type = serializer.validated_data.get(
            "leave_type",
            instance.leave_type if instance else LeaveType.CASUAL,
        )
        is_half_day = serializer.validated_data.get(
            "is_half_day",
            instance.is_half_day if instance else False,
        )
        snapshot = monthly_leave_limit_snapshot(
            employee,
            start_date,
            end_date,
            leave_type,
            is_half_day,
            exclude_request=instance,
        )
        policy_error = monthly_leave_limit_error(
            snapshot,
            dict(LeaveType.choices).get(leave_type, leave_type),
        )
        if policy_error:
            raise ValidationError({"detail": policy_error})

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_authenticated and getattr(user, "role", "") == UserRole.SUB_ADMIN:
            if not check_user_module_permission(user, "leaves", "edit"):
                raise PermissionDenied("You do not have permission to create leave requests.")

        employee = (
            self._current_employee()
            if not self._is_admin_or_hr(user)
            else serializer.validated_data.get("employee")
        )
        if employee is None:
            raise ValidationError({"employee": "Choose an employee for this leave request."})

        if not self._is_admin_or_hr(user):
            self._ensure_leave_eligible(employee)

        with transaction.atomic():
            employee = Employee.objects.select_for_update().get(pk=employee.pk)
            self._validate_monthly_policy(serializer, employee)
            if not self._is_admin_or_hr(user):
                self._raise_if_leave_overlaps(
                    employee,
                    serializer.validated_data["start_date"],
                    serializer.validated_data["end_date"],
                )
                leave_request = serializer.save(
                    employee=employee,
                    status=LeaveStatus.PENDING,
                    admin_notes=None,
                )
            else:
                self._validate_half_day_approval(serializer)
                leave_request = serializer.save(employee=employee)

            sync_leave_request_attendance(leave_request)

    def perform_update(self, serializer):
        user = self.request.user
        if user.is_authenticated and getattr(user, "role", "") == UserRole.SUB_ADMIN:
            if not check_user_module_permission(user, "leaves", "edit"):
                raise PermissionDenied("You do not have permission to modify leave requests.")
        
        with transaction.atomic():
            # Store original values before saving to detect critical changes
            original_leave_type = serializer.instance.leave_type
            original_start_date = serializer.instance.start_date
            original_end_date = serializer.instance.end_date
            original_status = serializer.instance.status
            
            employee = Employee.objects.select_for_update().get(
                pk=serializer.validated_data.get("employee", serializer.instance.employee).pk
            )
            self._validate_monthly_policy(serializer, employee)

            # If user is Employee, they cannot update status or admin_notes.
            if not self._is_admin_or_hr(user):
                self._ensure_leave_eligible(employee)
                forbidden_fields = {"employee", "status", "admin_notes"}
                if forbidden_fields.intersection(self.request.data.keys()):
                    raise PermissionDenied("Employees can only edit leave dates, type, and reason.")
                if serializer.instance.status != LeaveStatus.PENDING:
                    raise ValidationError({"detail": "Only pending leave requests can be edited by employees."})
                current_employee = self._current_employee()
                if serializer.instance.employee_id != current_employee.id:
                    raise PermissionDenied("You can only edit your own leave requests.")
                leave_request = serializer.save(employee=employee)
            else:
                self._validate_half_day_approval(serializer)
                leave_request = serializer.save(employee=employee)

            # Always sync attendance if any critical field that affects attendance changes
            critical_fields_changed = (
                leave_request.leave_type != original_leave_type or
                leave_request.start_date != original_start_date or
                leave_request.end_date != original_end_date or
                leave_request.status != original_status
            )
            
            if critical_fields_changed:
                sync_leave_request_attendance(leave_request)

    def perform_destroy(self, instance):
        user = self.request.user
        if user.is_authenticated and getattr(user, "role", "") == UserRole.SUB_ADMIN:
            if not check_user_module_permission(user, "leaves", "delete"):
                raise PermissionDenied("You do not have permission to delete leave requests.")
        elif not self._is_admin_or_hr(user):
            employee = self._current_employee()
            self._ensure_leave_eligible(employee)
            if instance.employee_id != employee.id:
                raise PermissionDenied("You can only delete your own leave requests.")
            if instance.status != LeaveStatus.PENDING:
                raise ValidationError({"detail": "Only pending leave requests can be deleted by employees."})

        with transaction.atomic():
            instance.status = LeaveStatus.REJECTED
            sync_leave_request_attendance(instance)
            instance.delete()