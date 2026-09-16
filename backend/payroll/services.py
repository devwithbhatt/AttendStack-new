import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus, LeaveStatus, LeaveType
from attendance.eligibility import attendance_eligible_records
from attendance.services import auto_mark_calendar_days
from employees.models import ATTENDANCE_ELIGIBLE_STATUSES


MONEY = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def payroll_period_end(month: int, year: int) -> date:
    """Use completed days only for the current month; use full month for past months."""
    today = timezone.localdate()
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    if year == today.year and month == today.month:
        return min(today, month_end)
    return month_end


def payable_employment_dates(employee, month: int, year: int) -> list[date]:
    """Return payable dates from the employee's effective-dated status history.

    A transition to Inactive or Terminated takes effect immediately for
    attendance, while its effective date remains the employee's final payable
    day. This supports final-payroll proration without permitting attendance
    after separation.
    """
    month_start = date(year, month, 1)
    period_end = payroll_period_end(month, year)
    first_day = max(month_start, employee.joining_date)
    if first_day > period_end:
        return []

    history = list(
        employee.status_history.filter(effective_date__lte=period_end)
        .order_by("effective_date", "created_at", "pk")
    )
    final_payable_transition_dates = set()
    previous_status = None
    for entry in history:
        if previous_status in ATTENDANCE_ELIGIBLE_STATUSES and entry.status not in ATTENDANCE_ELIGIBLE_STATUSES:
            final_payable_transition_dates.add(entry.effective_date)
        previous_status = entry.status

    payable_dates = []
    status_for_day = employee.status
    next_history_index = 0
    while next_history_index < len(history) and history[next_history_index].effective_date <= first_day:
        status_for_day = history[next_history_index].status
        next_history_index += 1
    current = first_day
    while current <= period_end:
        while next_history_index < len(history) and history[next_history_index].effective_date <= current:
            status_for_day = history[next_history_index].status
            next_history_index += 1
        if status_for_day in ATTENDANCE_ELIGIBLE_STATUSES or current in final_payable_transition_dates:
            payable_dates.append(current)
        current += timedelta(days=1)
    return payable_dates


def calculate_attendance_payroll(employee, month: int, year: int, allowances=0, manual_deductions=0) -> dict:
    auto_mark_calendar_days(month, year)

    monthly_salary = money(Decimal(str(employee.annual_salary or 0)) / Decimal("12"))
    allowances = money(Decimal(str(allowances or 0)))
    manual_deductions = money(Decimal(str(manual_deductions or 0)))
    days_in_month = calendar.monthrange(year, month)[1]
    payable_dates = payable_employment_dates(employee, month, year)
    period_start = payable_dates[0] if payable_dates else None
    period_end = payable_dates[-1] if payable_dates else None
    eligible_days = len(payable_dates)
    per_day_salary = monthly_salary / Decimal(str(days_in_month))
    basic_salary = money(per_day_salary * Decimal(str(eligible_days)))

    summary = {
        "present": 0,
        "late": 0,
        "absent": 0,
        "half_day": 0,
        "leave": 0,
        "paid_leave": 0,
        "holiday": 0,
        "sunday_unpaid": 0,
        "sunday_paid": 0,
    }
    unpaid_days = Decimal("0")
    leave_breakdown = {
        leave_type.lower(): {"paid": Decimal("0"), "unpaid": Decimal("0")}
        for leave_type in LeaveType.values
    }

    records = attendance_eligible_records(
        AttendanceRecord.objects.select_related("leave_request")
    ).filter(
        employee=employee,
        date__year=year,
        date__month=month,
        date__in=payable_dates,
    )

    deduction_details = {}
    attendance_deductions = Decimal("0")

    for record in records:
        if (
            record.leave_request_id
            and record.leave_request.status == LeaveStatus.APPROVED
            and record.leave_request.leave_type in LeaveType.values
        ):
            leave_key = record.leave_request.leave_type.lower()
            leave_unit = Decimal("0.5") if record.leave_request.is_half_day else Decimal("1")
            payment_key = "paid" if record.is_paid else "unpaid"
            leave_breakdown[leave_key][payment_key] += leave_unit

        if record.status == AttendanceStatus.PRESENT:
            summary["present"] += 1
        elif record.status == AttendanceStatus.LATE:
            summary["late"] += 1
        elif record.status == AttendanceStatus.ABSENT:
            summary["absent"] += 1
            unpaid_days += Decimal("1")
            attendance_deductions += per_day_salary
            deduction_details["Absent Day"] = deduction_details.get("Absent Day", Decimal("0")) + per_day_salary
        elif record.status == AttendanceStatus.HALF_DAY:
            summary["half_day"] += 1
            # Only an approved half-day leave that was covered by a Casual/Sick
            # balance is paid. A manual or early-checkout half day is unpaid.
            paid_half_day_leave = (
                record.is_paid
                and record.leave_request_id
                and record.leave_request.status == "APPROVED"
                and record.leave_request.is_half_day
            )
            if not paid_half_day_leave:
                unpaid_days += Decimal("0.5")
                half_day_deduction = per_day_salary / 2
                attendance_deductions += half_day_deduction
                deduction_details["Half Day"] = deduction_details.get("Half Day", Decimal("0")) + half_day_deduction
        elif record.status == AttendanceStatus.LEAVE:
            summary["leave"] += 1
            unpaid_days += Decimal("1")
            attendance_deductions += per_day_salary
            deduction_details["Unpaid Leave"] = deduction_details.get("Unpaid Leave", Decimal("0")) + per_day_salary
        elif record.status == AttendanceStatus.PAID_LEAVE:
            summary["paid_leave"] += 1
        elif record.status == AttendanceStatus.HOLIDAY:
            summary["holiday"] += 1
        elif record.status == AttendanceStatus.SUNDAY_UNPAID:
            summary["sunday_unpaid"] += 1
            unpaid_days += Decimal("1")
            attendance_deductions += per_day_salary
            deduction_details["Unpaid Sunday"] = deduction_details.get("Unpaid Sunday", Decimal("0")) + per_day_salary
        elif record.status == AttendanceStatus.SUNDAY_PAID:
            summary["sunday_paid"] += 1

    attendance_deductions = money(attendance_deductions)
    deductions = money(attendance_deductions + manual_deductions)
    deduction_details = {
        reason: str(money(amount))
        for reason, amount in deduction_details.items()
    }
    if manual_deductions:
        deduction_details["Manual Adjustment"] = str(manual_deductions)

    payable_salary = money(basic_salary + allowances - deductions)
    serialized_leave_breakdown = {
        leave_type: {
            "paid": float(values["paid"]),
            "unpaid": float(values["unpaid"]),
            "total": float(values["paid"] + values["unpaid"]),
        }
        for leave_type, values in leave_breakdown.items()
        if values["paid"] or values["unpaid"]
    }
    
    return {
        "basic_salary": basic_salary,
        "allowances": allowances,
        "deductions": deductions,
        "deduction_details": deduction_details,
        "payable_salary": payable_salary,
        "unpaid_days": float(unpaid_days),
        "days_in_month": days_in_month,
        "eligible_days": eligible_days,
        "period_start": period_start,
        "period_end": period_end,
        "per_day_salary": money(per_day_salary),
        "attendance_summary": summary,
        "leave_breakdown": serialized_leave_breakdown,
    }


def build_employee_payroll_summary(employee, month: int, year: int, request=None) -> dict:
    payroll = calculate_attendance_payroll(employee, month, year)
    avatar_url = None
    if employee.profile_photo:
        avatar_url = employee.profile_photo.url
        if request:
            avatar_url = request.build_absolute_uri(avatar_url)
    return {
        "id": employee.employee_id,
        "employee_uuid": employee.id,
        "name": employee.full_name,
        "email": employee.email,
        "avatar": avatar_url,
        "present": payroll["attendance_summary"]["present"],
        "late": payroll["attendance_summary"]["late"],
        "absent": payroll["attendance_summary"]["absent"],
        "halfDay": payroll["attendance_summary"]["half_day"],
        "leave": payroll["attendance_summary"]["leave"],
        "paidLeave": payroll["attendance_summary"]["paid_leave"],
        "holiday": payroll["attendance_summary"]["holiday"],
        "sundayPaid": payroll["attendance_summary"]["sunday_paid"],
        "sundayUnpaid": payroll["attendance_summary"]["sunday_unpaid"],
        "unpaidDays": payroll["unpaid_days"],
        "leaveBreakdown": payroll["leave_breakdown"],
        "monthlySalary": payroll["basic_salary"],
        "deductions": payroll["deductions"],
        "payableSalary": payroll["payable_salary"],
        "daysInMonth": payroll["days_in_month"],
        "eligibleDays": payroll["eligible_days"],
        "periodStart": payroll["period_start"],
        "periodEnd": payroll["period_end"],
    }
