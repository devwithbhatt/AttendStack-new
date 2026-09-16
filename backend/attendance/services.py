import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN

from django.db import transaction

from employees.models import ATTENDANCE_WORKING_STATUSES, Employee
from holidays.models import Holiday
from settings.models import SystemSettings

from .models import AttendanceRecord, AttendanceStatus, LeaveStatus, LeaveType


def iter_dates(start_date: date, end_date: date):
    current_date = start_date
    while current_date <= end_date:
        yield current_date
        current_date += timedelta(days=1)


LEAVE_ALLOCATION_FIELDS = {
    LeaveType.CASUAL: "casual_leave_days",
    LeaveType.SICK: "sick_leave_days",
    LeaveType.MATERNITY: "maternity_leave_days",
    LeaveType.PATERNITY: "paternity_leave_days",
    LeaveType.BEREAVEMENT: "bereavement_leave_days",
    LeaveType.MARRIAGE: "marriage_leave_days",
}

MONTHLY_LEAVE_LIMIT_FIELDS = {
    LeaveType.CASUAL: "casual_leave_monthly_limit",
    LeaveType.SICK: "sick_leave_monthly_limit",
}


def leave_allocation(
    settings: SystemSettings,
    leave_type: str,
    employee: Employee | None = None,
    year: int | None = None,
) -> Decimal:
    """Return annual entitlement, including employee override and first-year proration."""
    field_name = LEAVE_ALLOCATION_FIELDS.get(leave_type)
    if not field_name:
        return Decimal("0")

    override_field = {
        LeaveType.CASUAL: "casual_leave_days_override",
        LeaveType.SICK: "sick_leave_days_override",
    }.get(leave_type)
    override = getattr(employee, override_field, None) if employee and override_field else None
    annual = Decimal(str(override if override is not None else max(getattr(settings, field_name, 0), 0)))

    if not employee or year is None or employee.joining_date.year < year:
        return annual
    if employee.joining_date.year > year:
        return Decimal("0")

    eligible_months = 13 - employee.joining_date.month
    # Leave is consumed in half-day units, so keep prorated entitlements usable and deterministic.
    return (annual * Decimal(eligible_months) / Decimal("12") * Decimal("2")).quantize(
        Decimal("1"), rounding=ROUND_DOWN
    ) / Decimal("2")


def earned_leave_allocation(
    settings: SystemSettings,
    leave_type: str,
    employee: Employee,
    as_of_date: date,
) -> Decimal:
    """Return leave earned by a date; Casual and Sick Leave accrue monthly.

    The joining month is the first credited month. This prevents employees from
    spending future months' entitlement while allowing unused credits to build
    up through the calendar year.
    """
    annual_entitlement = leave_allocation(settings, leave_type, employee, as_of_date.year)
    if leave_type not in {LeaveType.CASUAL, LeaveType.SICK}:
        return annual_entitlement
    if as_of_date < employee.joining_date:
        return Decimal("0")

    first_eligible_month = employee.joining_date.month if employee.joining_date.year == as_of_date.year else 1
    credited_months = as_of_date.month - first_eligible_month + 1
    if credited_months <= 0:
        return Decimal("0")

    # Accrue from the underlying annual policy so a 12-day policy earns one
    # day per month and employee overrides follow the same schedule.
    field_name = LEAVE_ALLOCATION_FIELDS[leave_type]
    override_field = {
        LeaveType.CASUAL: "casual_leave_days_override",
        LeaveType.SICK: "sick_leave_days_override",
    }[leave_type]
    override = getattr(employee, override_field, None)
    annual_policy = Decimal(str(override if override is not None else max(getattr(settings, field_name, 0), 0)))
    earned = annual_policy * Decimal(credited_months) / Decimal("12")
    earned = (earned * Decimal("2")).quantize(Decimal("1"), rounding=ROUND_DOWN) / Decimal("2")
    return min(earned, annual_entitlement)


def monthly_leave_limit(settings: SystemSettings, leave_type: str) -> Decimal | None:
    """Return the request cap for a leave type, or None when it has no monthly cap."""
    field_name = MONTHLY_LEAVE_LIMIT_FIELDS.get(leave_type)
    if not field_name:
        return None
    return Decimal(str(max(getattr(settings, field_name, 0), 0)))


def leave_units(leave_request) -> Decimal:
    return Decimal("0.5") if leave_request.is_half_day else Decimal("1")


def leave_units_by_month(start_date: date, end_date: date, is_half_day: bool = False):
    """Split requested leave units across calendar months."""
    units_by_month = defaultdict(lambda: Decimal("0"))
    units_per_day = Decimal("0.5") if is_half_day else Decimal("1")
    for leave_date in iter_dates(start_date, end_date):
        units_by_month[(leave_date.year, leave_date.month)] += units_per_day
    return dict(units_by_month)


def monthly_leave_limit_snapshot(
    employee: Employee,
    start_date: date,
    end_date: date,
    leave_type: str,
    is_half_day: bool = False,
    exclude_request=None,
) -> dict:
    """Return monthly usage and cap violations for a prospective request.

    Pending requests reserve capacity as well as approved requests so concurrent
    approvals cannot push an employee over policy.
    """
    settings = SystemSettings.get_settings()
    limit = monthly_leave_limit(settings, leave_type)
    requested_by_month = leave_units_by_month(start_date, end_date, is_half_day)
    if limit is None:
        return {"limit": None, "periods": [], "violations": []}

    requested_months = set(requested_by_month)
    usage_by_month = defaultdict(lambda: Decimal("0"))
    existing_requests = employee.leave_requests.filter(
        leave_type=leave_type,
        status__in=[LeaveStatus.PENDING, LeaveStatus.APPROVED],
        start_date__lte=end_date,
        end_date__gte=start_date.replace(day=1),
    )
    if exclude_request is not None and exclude_request.pk:
        existing_requests = existing_requests.exclude(pk=exclude_request.pk)

    for request in existing_requests.only("start_date", "end_date", "is_half_day"):
        for period, units in leave_units_by_month(
            request.start_date,
            request.end_date,
            request.is_half_day,
        ).items():
            if period in requested_months:
                usage_by_month[period] += units

    periods = []
    violations = []
    for year, month in sorted(requested_months):
        used = usage_by_month[(year, month)]
        requested = requested_by_month[(year, month)]
        projected = used + requested
        period = {
            "year": year,
            "month": month,
            "month_name": calendar.month_name[month],
            "limit": limit,
            "used": used,
            "requested": requested,
            "remaining": max(limit - used, Decimal("0")),
            "remaining_after_request": max(limit - projected, Decimal("0")),
            "projected": projected,
            "exceeded": projected > limit,
        }
        periods.append(period)
        if period["exceeded"]:
            violations.append(period)

    return {"limit": limit, "periods": periods, "violations": violations}


def monthly_leave_limit_error(snapshot: dict, leave_type_label: str) -> str | None:
    if not snapshot["violations"]:
        return None
    period = snapshot["violations"][0]
    return (
        f"{leave_type_label} monthly limit exceeded for "
        f"{period['month_name']} {period['year']}: "
        f"{period['used']:g} day(s) already pending or approved, plus "
        f"{period['requested']:g} requested; the maximum is {period['limit']:g} day(s)."
    )


def _rebalance_yearly_paid_leaves(employee: Employee, year: int) -> None:
    """Apply each annual leave allocation independently and chronologically."""
    settings = SystemSettings.get_settings()

    for leave_type in LEAVE_ALLOCATION_FIELDS:
        paid_used = Decimal("0")
        leave_records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=employee,
            date__year=year,
            leave_request__status=LeaveStatus.APPROVED,
            leave_request__leave_type=leave_type,
        ).order_by("date", "leave_request_id", "id")

        for record in leave_records:
            request = record.leave_request
            units = leave_units(request)
            paid_allowance = earned_leave_allocation(settings, leave_type, employee, record.date)
            should_be_paid = paid_used + units <= paid_allowance
            if should_be_paid:
                paid_used += units

            target_status = (
                AttendanceStatus.HALF_DAY
                if request.is_half_day
                else (AttendanceStatus.PAID_LEAVE if should_be_paid else AttendanceStatus.LEAVE)
            )
            target_note = (
                f"Auto-marked from approved leave request #{request.id}: "
                f"{'Paid' if should_be_paid else 'Unpaid'} "
                f"{'half-day ' if request.is_half_day else ''}leave"
            )
            if (
                record.status == target_status
                and record.is_paid == should_be_paid
                and record.notes == target_note
            ):
                continue

            record.status = target_status
            record.is_paid = should_be_paid
            record.notes = target_note
            record.save(auto_refresh_status=False, update_fields=["status", "is_paid", "notes", "updated_at"])


def _refresh_existing_payrolls(employee: Employee, affected_dates) -> int:
    """Keep generated payroll rows aligned with leave-driven attendance changes."""
    periods = {(leave_date.year, leave_date.month) for leave_date in affected_dates}
    if not periods:
        return 0

    # Local imports prevent an attendance/payroll import cycle.
    from payroll.models import Payroll
    from payroll.services import calculate_attendance_payroll

    updated_count = 0
    for year, month in sorted(periods):
        payroll = Payroll.objects.filter(employee=employee, year=year, month=month).first()
        if payroll is None:
            continue
        deduction_details = payroll.deduction_details or {}
        manual_deductions = Decimal(str(deduction_details.get("Manual Adjustment", 0) or 0))
        values = calculate_attendance_payroll(
            employee,
            month,
            year,
            allowances=payroll.allowances,
            manual_deductions=manual_deductions,
        )
        payroll.basic_salary = values["basic_salary"]
        payroll.deductions = values["deductions"]
        payroll.deduction_details = values["deduction_details"]
        payroll.save(update_fields=[
            "basic_salary",
            "deductions",
            "deduction_details",
            "net_salary",
            "updated_at",
        ])
        updated_count += 1
    return updated_count


def rebalance_paid_leave_attendance() -> dict[str, int]:
    """Recalculate paid/unpaid attendance after a leave allocation change."""
    employee_years = set()
    leave_records = list(
        AttendanceRecord.objects.filter(
            leave_request__status=LeaveStatus.APPROVED,
            leave_request__leave_type__in=LEAVE_ALLOCATION_FIELDS,
        ).values_list("employee_id", "date")
    )

    for employee_id, leave_date in leave_records:
        employee_years.add((employee_id, leave_date.year))

    employees = Employee.objects.in_bulk({employee_id for employee_id, _ in employee_years})
    rebalanced_count = 0

    for employee_id, year in sorted(employee_years, key=lambda item: (str(item[0]), item[1])):
        employee = employees.get(employee_id)
        if not employee:
            continue
        _rebalance_yearly_paid_leaves(employee, year)
        rebalanced_count += 1

    payrolls_updated = 0
    for employee_id in {employee_id for employee_id, _year in employee_years}:
        employee = employees.get(employee_id)
        if employee:
            affected_dates = [
                leave_date
                for record_employee_id, leave_date in leave_records
                if record_employee_id == employee_id
            ]
            payrolls_updated += _refresh_existing_payrolls(employee, affected_dates)

    return {
        "employee_years_rebalanced": rebalanced_count,
        "payrolls_updated": payrolls_updated,
    }


@transaction.atomic
def sync_leave_request_attendance(leave_request) -> dict[str, int]:
    """Create or clear attendance records that are driven by a leave approval."""
    existing_records = AttendanceRecord.objects.filter(leave_request=leave_request)
    affected_years = {record.date.year for record in existing_records}
    # A leave request can never create attendance before employment begins.
    requested_dates = {
        leave_date
        for leave_date in iter_dates(leave_request.start_date, leave_request.end_date)
        if (
            leave_date >= leave_request.employee.joining_date
            and leave_request.employee.is_attendance_eligible_on(leave_date)
        )
    }
    affected_years.update(day.year for day in requested_dates)

    if leave_request.status != LeaveStatus.APPROVED:
        deleted_count = 0
        updated_count = 0
        for record in existing_records:
            # A rejected half-day request must never erase an employee's punches.
            if leave_request.is_half_day and (record.check_in or record.check_out):
                record.leave_request = None
                record.is_paid = True
                record.refresh_status()
                record.save(auto_refresh_status=False, update_fields=["leave_request", "is_paid", "status", "updated_at"])
                updated_count += 1
            else:
                record.delete()
                deleted_count += 1
        for year in affected_years:
            _rebalance_yearly_paid_leaves(leave_request.employee, year)
        payrolls_updated = _refresh_existing_payrolls(
            leave_request.employee,
            set(requested_dates) | {record.date for record in existing_records},
        )
        return {
            "created": 0,
            "updated": updated_count,
            "deleted": deleted_count,
            "payrolls_updated": payrolls_updated,
        }

    stale_records = existing_records.exclude(date__in=requested_dates)
    deleted_count, _ = stale_records.delete()

    created_count = 0
    updated_count = 0
    for leave_date in sorted(requested_dates):
        if leave_request.is_half_day:
            record, created = AttendanceRecord.objects.get_or_create(
                employee=leave_request.employee,
                date=leave_date,
                defaults={
                    "leave_request": leave_request,
                    "status": AttendanceStatus.HALF_DAY,
                    "is_paid": False,
                    "notes": f"Approved half-day leave request #{leave_request.id}; checkout required.",
                },
            )
            if not created:
                # Update all relevant fields for half-day records too when leave type changes
                record.leave_request = leave_request
                if record.check_out:
                    record.status = AttendanceStatus.HALF_DAY
                else:
                    record.status = AttendanceStatus.HALF_DAY
                record.is_paid = False
                record.notes = f"Approved half-day leave request #{leave_request.id}; checkout required."
                record.save(auto_refresh_status=False, update_fields=["leave_request", "status", "is_paid", "notes", "updated_at"])
            created_count += int(created)
            updated_count += int(not created)
            continue

        # Always update existing records with latest leave request data
        record, created = AttendanceRecord.objects.get_or_create(
            employee=leave_request.employee,
            date=leave_date,
            defaults={
                "leave_request": leave_request,
                "check_in": None,
                "check_out": None,
                "status": AttendanceStatus.LEAVE,
                "is_paid": False,
                "notes": f"Auto-marked from approved leave request #{leave_request.id}: Unpaid leave",
            },
        )
        if not created:
            # Update all relevant fields even if record exists - critical for when leave type changes
            record.leave_request = leave_request
            record.check_in = None
            record.check_out = None
            record.status = AttendanceStatus.LEAVE
            record.is_paid = False
            record.notes = f"Auto-marked from approved leave request #{leave_request.id}: Unpaid leave"
            record.save(auto_refresh_status=False, update_fields=["leave_request", "check_in", "check_out", "status", "is_paid", "notes", "updated_at"])
            updated_count += 1
        else:
            created_count += int(created)

    for year in affected_years:
        _rebalance_yearly_paid_leaves(leave_request.employee, year)

    payrolls_updated = _refresh_existing_payrolls(
        leave_request.employee,
        requested_dates,
    )
    return {
        "created": created_count,
        "updated": updated_count,
        "deleted": deleted_count,
        "payrolls_updated": payrolls_updated,
    }


def auto_mark_calendar_days(month: int, year: int) -> dict[str, int]:
    """Create missing holiday and Sunday attendance records for active employees."""
    days_in_month = calendar.monthrange(year, month)[1]
    all_dates = [date(year, month, day) for day in range(1, days_in_month + 1)]
    holiday_dates = set(
        Holiday.objects.filter(date__year=year, date__month=month).values_list("date", flat=True)
    )
    sunday_dates = {day for day in all_dates if day.weekday() == 6} - holiday_dates

    created_count = 0
    updated_count = 0
    skipped_count = 0
    employees = Employee.objects.filter(
        joining_date__lte=date(year, month, days_in_month),
    ).prefetch_related("status_history")

    for employee in employees:
        employment_start = max(employee.joining_date, date(year, month, 1))
        for holiday_date in holiday_dates:
            if (
                holiday_date < employment_start
                or not employee.is_attendance_eligible_on(holiday_date)
            ):
                continue
            _, created = AttendanceRecord.objects.get_or_create(
                employee=employee,
                date=holiday_date,
                defaults={
                    "status": AttendanceStatus.HOLIDAY,
                    "notes": "Auto-marked: Holiday",
                },
            )
            created_count += int(created)
            skipped_count += int(not created)

        for sunday_date in sunday_dates:
            if (
                sunday_date < employment_start
                or not employee.is_attendance_eligible_on(sunday_date)
            ):
                continue
            record, created = AttendanceRecord.objects.get_or_create(
                employee=employee,
                date=sunday_date,
                defaults={
                    "status": AttendanceStatus.SUNDAY_PAID,
                    "notes": "Auto-marked: Sunday (Paid)",
                },
            )
            if (
                not created
                and record.status == AttendanceStatus.ABSENT
                and record.notes == "Auto-marked: Sunday (Paid)"
                and not record.check_in
                and not record.check_out
            ):
                record.status = AttendanceStatus.SUNDAY_PAID
                record.is_paid = True
                record.save(auto_refresh_status=False, update_fields=["status", "is_paid", "updated_at"])
                updated_count += 1
                continue
            created_count += int(created)
            skipped_count += int(not created)

    return {"created": created_count, "updated": updated_count, "skipped": skipped_count}


def auto_mark_absent_yesterday():
    """Marks active employees as 'Absent' if they have no attendance record for yesterday."""
    yesterday = date.today() - timedelta(days=1)
    
    # Skip execution on weekends and holidays
    if yesterday.weekday() >= 5: # Saturday or Sunday
        return {"status": "skipped", "reason": "Weekend"}
        
    if Holiday.objects.filter(date=yesterday).exists():
        return {"status": "skipped", "reason": "Holiday"}

    active_employees = Employee.objects.attendance_eligible_on(yesterday).filter(
        attendance_status_on_date__in=ATTENDANCE_WORKING_STATUSES,
        joining_date__lte=yesterday,
    )
    marked_absent_count = 0
    
    for employee in active_employees:
        has_record = AttendanceRecord.objects.filter(employee=employee, date=yesterday).exists()
        if not has_record:
            AttendanceRecord.objects.create(
                employee=employee,
                date=yesterday,
                status=AttendanceStatus.ABSENT,
                notes="Auto-marked: Absent"
            )
            marked_absent_count += 1
            
    return {"status": "completed", "marked_absent": marked_absent_count}