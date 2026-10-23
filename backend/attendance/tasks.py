from celery import shared_task
from django.utils import timezone
from .services import auto_mark_absent_yesterday, auto_mark_absent_employees, auto_convert_half_day_to_full_day

@shared_task
def mark_absent_employees_task():
    """Celery task to automatically mark absent employees."""
    today = timezone.localdate()
    auto_mark_absent_employees(today, today)
    result = auto_mark_absent_yesterday()
    return result

@shared_task
def convert_half_day_leaves_task():
    """Auto-convert pending half-day leaves to full-day when the date passed without checkout."""
    return auto_convert_half_day_to_full_day()