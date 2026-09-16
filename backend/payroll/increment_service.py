from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from django.db import transaction

from settings.models import SystemSettings
from employees.models import Employee, EmployeeStatus
from .models import EmployeeIncrement, IncrementStatus, IncrementType


def add_months_to_date(source_date: date, months: int) -> date:
    """Helper to add months to a given date cleanly."""
    month = source_date.month - 1 + months
    year = source_date.year + month // 12
    month = month % 12 + 1
    day = min(source_date.day, [31, 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day)


def get_effective_increment_config(employee: Employee, settings: SystemSettings = None):
    """
    Returns effective increment settings for an employee:
    (enabled: bool, months: int, type: str, value: Decimal)
    Only ACTIVE status employees are eligible for salary increments.
    """
    if employee.status != EmployeeStatus.ACTIVE:
        return False, 12, "PERCENTAGE", Decimal("0.00")

    if settings is None:
        settings = SystemSettings.get_settings()

    if not settings.increment_enabled:
        return False, settings.default_increment_months, settings.default_increment_type, Decimal(str(settings.default_increment_value))

    if employee.override_increment_policy:
        enabled = (employee.increment_status == "ENABLED")
        months = employee.custom_increment_months or settings.default_increment_months or 12
        inc_type = employee.custom_increment_type or settings.default_increment_type or "PERCENTAGE"
        inc_val = Decimal(str(employee.custom_increment_value if employee.custom_increment_value is not None else settings.default_increment_value))
        return enabled, months, inc_type, inc_val
    else:
        enabled = (employee.increment_status == "ENABLED")
        months = settings.default_increment_months or 12
        inc_type = settings.default_increment_type or "PERCENTAGE"
        inc_val = Decimal(str(settings.default_increment_value or 10.00))
        return enabled, months, inc_type, inc_val


def calculate_increment_amounts(current_salary: Decimal, inc_type: str, inc_val: Decimal):
    """Calculates increment rupee amount and new annual salary."""
    current_salary = Decimal(str(current_salary or 0))
    inc_val = Decimal(str(inc_val or 0))

    if inc_type == IncrementType.PERCENTAGE or inc_type == "PERCENTAGE":
        calc_amount = current_salary * (inc_val / Decimal("100"))
    else:
        calc_amount = inc_val

    calc_amount = calc_amount.quantize(Decimal("0.01"))
    new_salary = (current_salary + calc_amount).quantize(Decimal("0.01"))
    return calc_amount, new_salary


def sync_employee_increments(employee: Employee = None):
    """
    Ensures active employees have next_increment_date set and
    a PENDING EmployeeIncrement record created for upcoming cycle.
    Automatically purges pending/rescheduled increments for any employee who is not active.
    """
    settings = SystemSettings.get_settings()
    if not settings.increment_enabled:
        return

    today = timezone.localdate()

    if employee:
        if employee.status != EmployeeStatus.ACTIVE:
            # Clean up any pending or rescheduled increments for non-active employee
            EmployeeIncrement.objects.filter(
                employee=employee,
                status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED]
            ).delete()
            if employee.next_increment_date is not None:
                employee.next_increment_date = None
                employee.save(update_fields=["next_increment_date"])
            return
        employees = [employee]
    else:
        # Purge pending/rescheduled increments for any employees whose status is not ACTIVE
        EmployeeIncrement.objects.filter(
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED]
        ).exclude(employee__status=EmployeeStatus.ACTIVE).delete()

        # Also clear next_increment_date for non-active employees if set
        Employee.objects.exclude(status=EmployeeStatus.ACTIVE).filter(
            next_increment_date__isnull=False
        ).update(next_increment_date=None)

        employees = Employee.objects.filter(status=EmployeeStatus.ACTIVE)

    for emp in employees:
        enabled, months, inc_type, inc_val = get_effective_increment_config(emp, settings)
        if not enabled:
            continue

        ref_date = emp.last_increment_date or emp.joining_date or today
        due_date = add_months_to_date(ref_date, months)

        if emp.next_increment_date != due_date:
            emp.next_increment_date = due_date
            emp.save(update_fields=["next_increment_date"])

        current_salary = Decimal(str(emp.annual_salary or 0))
        calc_amount, new_salary = calculate_increment_amounts(current_salary, inc_type, inc_val)

        existing_pending = EmployeeIncrement.objects.filter(
            employee=emp,
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED]
        ).first()

        is_custom_record = bool(emp.override_increment_policy or getattr(existing_pending, "is_custom", False))

        if existing_pending:
            if is_custom_record:
                # Retain custom increment type and value set explicitly for this employee / increment
                target_type = existing_pending.increment_type
                target_val = existing_pending.increment_value
            else:
                # Apply current company settings
                target_type = inc_type
                target_val = inc_val

            calc_amount, new_salary = calculate_increment_amounts(current_salary, target_type, target_val)
            existing_pending.current_salary = current_salary
            existing_pending.increment_type = target_type
            existing_pending.increment_value = target_val
            existing_pending.calculated_increment_amount = calc_amount
            existing_pending.new_salary = new_salary
            if not is_custom_record:
                existing_pending.is_custom = False

            # If pending (not rescheduled), keep due date aligned with cycle interval
            if existing_pending.status == IncrementStatus.PENDING:
                existing_pending.due_date = due_date

            existing_pending.save()
        else:
            EmployeeIncrement.objects.create(
                employee=emp,
                due_date=due_date,
                current_salary=current_salary,
                increment_type=inc_type,
                increment_value=inc_val,
                calculated_increment_amount=calc_amount,
                new_salary=new_salary,
                status=IncrementStatus.PENDING,
                is_custom=emp.override_increment_policy,
            )


@transaction.atomic
def approve_increment(increment: EmployeeIncrement, user=None, notes: str = ""):
    """
    Approves an increment, updates employee annual salary,
    sets last_increment_date, and schedules next cycle.
    """
    if increment.employee.status != EmployeeStatus.ACTIVE:
        raise ValueError("Cannot approve increment for an employee who is not active.")

    if increment.status in [IncrementStatus.APPROVED, IncrementStatus.REJECTED]:
        raise ValueError("Increment has already been processed.")

    today = timezone.localdate()
    increment.status = IncrementStatus.APPROVED
    increment.action_date = timezone.now()
    if user and getattr(user, "is_authenticated", False):
        increment.action_by = user
    if notes:
        increment.notes = notes
    increment.save()

    emp = increment.employee
    emp.annual_salary = increment.new_salary
    emp.last_increment_date = increment.due_date or today

    enabled, months, inc_type, inc_val = get_effective_increment_config(emp)
    emp.next_increment_date = add_months_to_date(emp.last_increment_date, months)
    emp.save(update_fields=["annual_salary", "last_increment_date", "next_increment_date"])

    if enabled:
        next_calc_amount, next_new_salary = calculate_increment_amounts(emp.annual_salary, inc_type, inc_val)
        EmployeeIncrement.objects.create(
            employee=emp,
            due_date=emp.next_increment_date,
            current_salary=emp.annual_salary,
            increment_type=inc_type,
            increment_value=inc_val,
            calculated_increment_amount=next_calc_amount,
            new_salary=next_new_salary,
            status=IncrementStatus.PENDING,
            is_custom=emp.override_increment_policy,
        )

    return increment


@transaction.atomic
def reject_increment(increment: EmployeeIncrement, user=None, notes: str = ""):
    """Rejects an increment request."""
    if increment.employee.status != EmployeeStatus.ACTIVE:
        raise ValueError("Cannot reject increment for an employee who is not active.")

    if increment.status in [IncrementStatus.APPROVED, IncrementStatus.REJECTED]:
        raise ValueError("Increment has already been processed.")

    increment.status = IncrementStatus.REJECTED
    increment.action_date = timezone.now()
    if user and getattr(user, "is_authenticated", False):
        increment.action_by = user
    if notes:
        increment.notes = notes
    increment.save()
    return increment


@transaction.atomic
def reschedule_increment(increment: EmployeeIncrement, new_date: date, user=None, notes: str = ""):
    """Reschedules an increment due date."""
    if increment.employee.status != EmployeeStatus.ACTIVE:
        raise ValueError("Cannot reschedule increment for an employee who is not active.")

    if increment.status == IncrementStatus.APPROVED:
        raise ValueError("Cannot reschedule an already approved increment.")

    increment.due_date = new_date
    increment.rescheduled_date = new_date
    increment.status = IncrementStatus.RESCHEDULED
    increment.action_date = timezone.now()
    if user and getattr(user, "is_authenticated", False):
        increment.action_by = user
    if notes:
        increment.notes = notes
    increment.save()

    emp = increment.employee
    emp.next_increment_date = new_date
    emp.save(update_fields=["next_increment_date"])

    return increment


@transaction.atomic
def update_increment_hike(
    increment: EmployeeIncrement,
    increment_type: str,
    increment_value: Decimal,
    notes: str = "",
    update_employee_policy: bool = False,
    reset_to_company_policy: bool = False,
    user=None,
):
    """
    Updates the proposed salary hike (type and amount) for a pending or rescheduled increment.
    If reset_to_company_policy is True, reverts back to current company defaults.
    Optionally updates the employee's default increment policy.
    """
    if increment.employee.status != EmployeeStatus.ACTIVE:
        raise ValueError("Cannot edit salary hike for an employee who is not active.")

    if increment.status in [IncrementStatus.APPROVED, IncrementStatus.REJECTED]:
        raise ValueError("Cannot edit an increment that has already been approved or rejected.")

    current_salary = Decimal(str(increment.current_salary or increment.employee.annual_salary or 0))

    if reset_to_company_policy:
        settings = SystemSettings.get_settings()
        target_type = settings.default_increment_type or "PERCENTAGE"
        target_val = Decimal(str(settings.default_increment_value or 10.00))
        calc_amount, new_salary = calculate_increment_amounts(current_salary, target_type, target_val)

        increment.increment_type = target_type
        increment.increment_value = target_val
        increment.calculated_increment_amount = calc_amount
        increment.new_salary = new_salary
        increment.is_custom = False
        if notes:
            increment.notes = notes
        increment.save()

        emp = increment.employee
        if emp.override_increment_policy:
            emp.override_increment_policy = False
            emp.custom_increment_type = None
            emp.custom_increment_value = None
            emp.custom_increment_months = None
            emp.save(update_fields=["override_increment_policy", "custom_increment_type", "custom_increment_value", "custom_increment_months"])

        return increment

    calc_amount, new_salary = calculate_increment_amounts(current_salary, increment_type, increment_value)

    increment.increment_type = increment_type
    increment.increment_value = increment_value
    increment.calculated_increment_amount = calc_amount
    increment.new_salary = new_salary
    increment.is_custom = True
    if notes:
        increment.notes = notes
    increment.save()

    if update_employee_policy:
        emp = increment.employee
        emp.override_increment_policy = True
        emp.custom_increment_type = increment_type
        emp.custom_increment_value = increment_value
        emp.save(update_fields=["override_increment_policy", "custom_increment_type", "custom_increment_value"])

    return increment


def get_increment_chart_projections(months_ahead: int = 12):
    """
    Returns monthly projection data for upcoming employee increments
    for the line chart visualization (Active employees only).
    """
    try:
        sync_employee_increments()
    except Exception:
        pass

    today = timezone.localdate()
    from calendar import monthrange
    from django.db.models import Sum

    monthly_series = []
    total_upcoming_count = 0
    total_upcoming_raise = Decimal("0")

    for i in range(months_ahead):
        month_idx = today.month - 1 + i
        year = today.year + month_idx // 12
        month = month_idx % 12 + 1

        _, last_day = monthrange(year, month)
        m_start = date(year, month, 1)
        m_end = date(year, month, last_day)

        increments = EmployeeIncrement.objects.filter(
            employee__status=EmployeeStatus.ACTIVE,
            status__in=[IncrementStatus.PENDING, IncrementStatus.RESCHEDULED],
            due_date__gte=m_start,
            due_date__lte=m_end
        ).select_related("employee")

        emp_count = increments.count()
        raise_sum = increments.aggregate(total=Sum("calculated_increment_amount"))["total"] or Decimal("0")

        emp_list = [
            {
                "id": str(inc.employee.id),
                "full_name": inc.employee.full_name,
                "due_date": str(inc.due_date),
                "raise_amount": float(inc.calculated_increment_amount or 0),
                "new_salary": float(inc.new_salary or 0),
            }
            for inc in increments
        ]

        month_label = m_start.strftime("%b %Y")

        monthly_series.append({
            "month_key": m_start.strftime("%Y-%m"),
            "month_label": month_label,
            "employee_count": emp_count,
            "total_raise_amount": float(raise_sum),
            "employees": emp_list,
        })

        total_upcoming_count += emp_count
        total_upcoming_raise += raise_sum

    next_month_info = monthly_series[1] if len(monthly_series) > 1 else (monthly_series[0] if monthly_series else {"month_label": "", "employee_count": 0, "total_raise_amount": 0, "employees": []})

    return {
        "months_ahead": months_ahead,
        "total_upcoming_count": total_upcoming_count,
        "total_upcoming_raise": float(total_upcoming_raise),
        "next_month": {
            "label": next_month_info["month_label"],
            "employee_count": next_month_info["employee_count"],
            "total_raise_amount": next_month_info["total_raise_amount"],
            "employees": next_month_info["employees"],
        },
        "series": monthly_series,
    }
