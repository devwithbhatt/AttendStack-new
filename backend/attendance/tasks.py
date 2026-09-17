from celery import shared_task
from django.utils import timezone
from .services import auto_mark_absent_yesterday, auto_mark_absent_employees
from .services import auto_mark_absent_yesterday, auto_mark_absent_employees, rebalance_paid_leave_attendance

@shared_task
def mark_absent_employees_task():
    """Celery task to automatically mark absent employees."""
    today = timezone.localdate()
    auto_mark_absent_employees(today, today)
    result = auto_mark_absent_yesterday()
    return result


@shared_task
def monthly_rebalance_leave_task():
    """Celery Beat task — runs on the 1st of every month.

    Re-evaluates all employees' paid/unpaid leave attendance using the latest
    accrual totals.  This retroactively flips days that were previously unpaid
    (because the employee had not yet accrued enough leave) to paid once
    sufficient months have elapsed, keeping payroll and balances accurate.
    """
    result = rebalance_paid_leave_attendance()
    return result