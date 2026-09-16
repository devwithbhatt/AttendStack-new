from datetime import date
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from attendance.permissions import IsAdminOrReadOnly
from employees.models import Employee, EmployeeStatus
from organizations.models import Organization
from .models import Payroll, PayrollStatus
from .serializers import PayrollSerializer
from .services import build_employee_payroll_summary, calculate_attendance_payroll, payable_employment_dates, payroll_period_end

class PayrollViewSet(viewsets.ModelViewSet):
    queryset = Payroll.objects.select_related("employee").all()
    serializer_class = PayrollSerializer
    permission_classes = [IsAdminOrReadOnly]
    permission_module = "payroll"

    def _organization_for_user(self):
        user = self.request.user
        if not user.is_authenticated or user.is_superuser or getattr(user, 'role', '') == "SUPER_ADMIN":
            return None
        from organizations.services import get_organization_for_user
        return get_organization_for_user(user)

    def get_queryset(self):
        queryset = super().get_queryset()
        month = self.request.query_params.get("month")
        year = self.request.query_params.get("year")
        search = self.request.query_params.get("search")

        if month:
            queryset = queryset.filter(month=month)
        if year:
            queryset = queryset.filter(year=year)
        if search:
            queryset = queryset.filter(employee__full_name__icontains=search)

        # Enforce secure employee data isolation
        user = self.request.user
        if user.is_authenticated and getattr(user, 'role', '') not in ["SUPER_ADMIN", "HR", "SUB_ADMIN"] and not user.is_staff:
            try:
                employee = Employee.objects.get(email=user.email)
                queryset = queryset.filter(employee=employee)
            except Employee.DoesNotExist:
                queryset = queryset.none()
        elif user.is_authenticated and not (user.is_superuser or getattr(user, 'role', '') == "SUPER_ADMIN"):
            org = self._organization_for_user()
            if org:
                queryset = queryset.filter(employee__organization=org)
            else:
                queryset = queryset.none()

        return queryset

    @action(detail=False, methods=["post"], url_path="generate")
    def generate_payroll(self, request):
        month = request.data.get("month")
        year = request.data.get("year")

        if not month or not year:
            return Response(
                {"detail": "Both month and year are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            month = int(month)
            year = int(year)
        except ValueError:
            return Response(
                {"detail": "Month and year must be valid integers."},
                status=status.HTTP_400_BAD_REQUEST
            )

        org = self._organization_for_user()
        employees = Employee.objects.filter(
            joining_date__lte=payroll_period_end(month, year),
        )
        if org:
            employees = employees.filter(organization=org)
        elif not (request.user.is_superuser or getattr(request.user, 'role', '') == "SUPER_ADMIN"):
            employees = employees.none()
        generated_count = 0
        updated_count = 0
        skipped_count = 0

        for emp in employees:
            if not payable_employment_dates(emp, month, year):
                skipped_count += 1
                continue
            existing = Payroll.objects.filter(employee=emp, month=month, year=year).first()

            # Recalculate all stored amounts from the single attendance payroll service.
            # Existing PAID rows keep their status/paid_on, but stale buggy amounts are repaired.
            allowances = existing.allowances if existing else 0
            payroll_values = calculate_attendance_payroll(emp, month, year, allowances=allowances)

            if existing:
                existing.basic_salary = payroll_values["basic_salary"]
                existing.deductions = payroll_values["deductions"]
                existing.deduction_details = payroll_values["deduction_details"]
                existing.save()
                updated_count += 1
            else:
                Payroll.objects.create(
                    employee=emp,
                    month=month,
                    year=year,
                    basic_salary=payroll_values["basic_salary"],
                    allowances=payroll_values["allowances"],
                    deductions=payroll_values["deductions"],
                    deduction_details=payroll_values["deduction_details"],
                    status=PayrollStatus.PENDING
                )
                generated_count += 1

        return Response({
            "detail": "Payroll generation completed successfully.",
            "generated": generated_count,
            "updated": updated_count,
            "skipped": skipped_count
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="summary")
    def monthly_summary(self, request):
        month = request.query_params.get("month")
        year = request.query_params.get("year")
        search = request.query_params.get("search")

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

        employees = Employee.objects.filter(
            joining_date__lte=payroll_period_end(month, year),
        ).order_by("full_name")
        if search:
            employees = employees.filter(
                Q(full_name__icontains=search)
                | Q(employee_id__icontains=search)
                | Q(email__icontains=search)
            )

        user = request.user
        if user.is_authenticated and user.role not in ["SUPER_ADMIN", "HR"] and not user.is_staff:
            employees = employees.filter(email__iexact=user.email)

        return Response([
            build_employee_payroll_summary(employee, month, year, request)
            for employee in employees
            if payable_employment_dates(employee, month, year)
        ])


from .models import EmployeeIncrement, IncrementStatus
from .serializers import (
    EmployeeIncrementSerializer,
    RescheduleIncrementSerializer,
    ProcessIncrementActionSerializer,
    EditIncrementHikeSerializer,
)
from .increment_service import (
    sync_employee_increments,
    approve_increment,
    reject_increment,
    reschedule_increment,
    update_increment_hike,
    get_effective_increment_config,
    get_increment_chart_projections,
)
from django.utils import timezone


class EmployeeIncrementViewSet(viewsets.ModelViewSet):
    queryset = EmployeeIncrement.objects.select_related("employee", "action_by").all()
    serializer_class = EmployeeIncrementSerializer
    permission_classes = [IsAdminOrReadOnly]
    permission_module = "payroll"

    def get_queryset(self):
        # Trigger auto-sync for active employees on listing
        try:
            sync_employee_increments()
        except Exception:
            pass

        queryset = super().get_queryset()
        user = self.request.user

        # Employee role restriction
        if user.is_authenticated and user.role not in ["SUPER_ADMIN", "HR"] and not user.is_staff:
            try:
                emp = Employee.objects.get(email=user.email)
                queryset = queryset.filter(employee=emp)
            except Employee.DoesNotExist:
                return queryset.none()

        # Filter by employee status (defaults to ACTIVE employees only)
        employee_status_param = self.request.query_params.get("employee_status")
        if employee_status_param:
            if employee_status_param.upper() != "ALL":
                queryset = queryset.filter(employee__status=employee_status_param.upper())
        else:
            queryset = queryset.filter(employee__status=EmployeeStatus.ACTIVE)

        status_param = self.request.query_params.get("status")
        search_param = self.request.query_params.get("search")
        employee_id_param = self.request.query_params.get("employee_id")
        period_param = self.request.query_params.get("period") or self.request.query_params.get("due")

        today = timezone.localdate()

        if status_param:
            queryset = queryset.filter(status=status_param.upper())
        if employee_id_param:
            queryset = queryset.filter(employee__id=employee_id_param)
        if search_param:
            queryset = queryset.filter(
                Q(employee__full_name__icontains=search_param) |
                Q(employee__employee_id__icontains=search_param) |
                Q(employee__department__icontains=search_param)
            )

        if period_param == "next_month":
            if today.month == 12:
                nm_year, nm_month = today.year + 1, 1
            else:
                nm_year, nm_month = today.year, today.month + 1
            
            from calendar import monthrange
            _, last_day = monthrange(nm_year, nm_month)
            nm_start = date(nm_year, nm_month, 1)
            nm_end = date(nm_year, nm_month, last_day)
            queryset = queryset.filter(due_date__gte=nm_start, due_date__lte=nm_end)

        elif period_param == "this_month":
            from calendar import monthrange
            _, last_day = monthrange(today.year, today.month)
            tm_start = date(today.year, today.month, 1)
            tm_end = date(today.year, today.month, last_day)
            queryset = queryset.filter(due_date__gte=tm_start, due_date__lte=tm_end)

        return queryset

    @action(detail=False, methods=["get"], url_path="summary")
    def increment_summary(self, request):
        """Returns high-level summary metrics for increments of active employees."""
        try:
            sync_employee_increments()
        except Exception:
            pass

        today = timezone.localdate()
        from calendar import monthrange
        
        _, tm_last_day = monthrange(today.year, today.month)
        this_month_start = date(today.year, today.month, 1)
        this_month_end = date(today.year, today.month, tm_last_day)

        if today.month == 12:
            nm_year, nm_month = today.year + 1, 1
        else:
            nm_year, nm_month = today.year, today.month + 1

        _, nm_last_day = monthrange(nm_year, nm_month)
        next_month_start = date(nm_year, nm_month, 1)
        next_month_end = date(nm_year, nm_month, nm_last_day)
        
        pending_count = EmployeeIncrement.objects.filter(
            employee__status=EmployeeStatus.ACTIVE,
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED]
        ).count()
        due_this_month = EmployeeIncrement.objects.filter(
            employee__status=EmployeeStatus.ACTIVE,
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED],
            due_date__gte=this_month_start,
            due_date__lte=this_month_end
        ).count()
        due_next_month = EmployeeIncrement.objects.filter(
            employee__status=EmployeeStatus.ACTIVE,
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED],
            due_date__gte=next_month_start,
            due_date__lte=next_month_end
        ).count()
        approved_this_year = EmployeeIncrement.objects.filter(
            employee__status=EmployeeStatus.ACTIVE,
            status=IncrementStatus.APPROVED,
            action_date__year=today.year
        ).count()

        next_month_name = next_month_start.strftime("%B %Y")
        this_month_name = this_month_start.strftime("%B %Y")

        return Response({
            "pending_count": pending_count,
            "due_this_month": due_this_month,
            "due_next_month": due_next_month,
            "this_month_name": this_month_name,
            "next_month_name": next_month_name,
            "approved_this_year": approved_this_year,
        })

    @action(detail=False, methods=["get"], url_path="my-increment")
    def my_increment(self, request):
        """Employee endpoint to fetch their own current increment config & upcoming schedule."""
        user = request.user
        if not user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            emp = Employee.objects.get(email=user.email)
        except Employee.DoesNotExist:
            return Response({"detail": "Employee profile not found."}, status=status.HTTP_404_NOT_FOUND)

        if emp.status != EmployeeStatus.ACTIVE:
            return Response(
                {"detail": "Salary increments are only available for active employees."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            sync_employee_increments(emp)
        except Exception:
            pass

        enabled, months, inc_type, inc_val = get_effective_increment_config(emp)

        pending_increment = EmployeeIncrement.objects.filter(
            employee=emp,
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED]
        ).order_by("due_date").first()

        history = EmployeeIncrement.objects.filter(
            employee=emp
        ).order_by("-created_at")[:10]

        pending_data = EmployeeIncrementSerializer(pending_increment, context={"request": request}).data if pending_increment else None
        history_data = EmployeeIncrementSerializer(history, many=True, context={"request": request}).data

        return Response({
            "employee_id": str(emp.id),
            "full_name": emp.full_name,
            "joining_date": emp.joining_date,
            "annual_salary": emp.annual_salary,
            "last_increment_date": emp.last_increment_date,
            "next_increment_date": emp.next_increment_date,
            "increment_enabled": enabled,
            "increment_cycle_months": months,
            "increment_type": inc_type,
            "increment_value": inc_val,
            "pending_increment": pending_data,
            "history": history_data
        })

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        """Admin action to approve/accept an employee increment."""
        increment = self.get_object()
        serializer = ProcessIncrementActionSerializer(data=request.data)
        serializer.is_validate_or_raise = True
        serializer.is_valid(raise_exception=True)

        try:
            approved_item = approve_increment(
                increment=increment,
                user=request.user,
                notes=serializer.validated_data.get("notes", "")
            )
            return Response(
                EmployeeIncrementSerializer(approved_item, context={"request": request}).data,
                status=status.HTTP_200_OK
            )
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        """Admin action to reject an employee increment."""
        increment = self.get_object()
        serializer = ProcessIncrementActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            rejected_item = reject_increment(
                increment=increment,
                user=request.user,
                notes=serializer.validated_data.get("notes", "")
            )
            return Response(
                EmployeeIncrementSerializer(rejected_item, context={"request": request}).data,
                status=status.HTTP_200_OK
            )
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="reschedule")
    def reschedule(self, request, pk=None):
        """Admin action to reschedule/postpone an employee increment."""
        increment = self.get_object()
        serializer = RescheduleIncrementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            rescheduled_item = reschedule_increment(
                increment=increment,
                new_date=serializer.validated_data["rescheduled_date"],
                user=request.user,
                notes=serializer.validated_data.get("notes", "")
            )
            return Response(
                EmployeeIncrementSerializer(rescheduled_item, context={"request": request}).data,
                status=status.HTTP_200_OK
            )
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post", "patch"], url_path="edit-hike")
    def edit_hike(self, request, pk=None):
        """Admin action to edit proposed salary hike percentage or flat amount."""
        increment = self.get_object()
        serializer = EditIncrementHikeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_item = update_increment_hike(
                increment=increment,
                increment_type=serializer.validated_data.get("increment_type", "PERCENTAGE"),
                increment_value=serializer.validated_data.get("increment_value", Decimal("0.00")),
                notes=serializer.validated_data.get("notes", ""),
                update_employee_policy=serializer.validated_data.get("update_employee_policy", False),
                reset_to_company_policy=serializer.validated_data.get("reset_to_company_policy", False),
                user=request.user,
            )
            return Response(
                EmployeeIncrementSerializer(updated_item, context={"request": request}).data,
                status=status.HTTP_200_OK
            )
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"], url_path="chart-projections")
    def chart_projections(self, request):
        """Returns monthly line chart projection data for upcoming employee increments."""
        try:
            months_ahead = int(request.query_params.get("months", 12))
        except (ValueError, TypeError):
            months_ahead = 12

        data = get_increment_chart_projections(months_ahead=months_ahead)
        return Response(data, status=status.HTTP_200_OK)

