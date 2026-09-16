from celery import shared_task
from django.utils import timezone
from .services import auto_mark_absent_yesterday, auto_mark_absent_employees

@shared_task
def mark_absent_employees_task():
    """Celery task to automatically mark absent employees."""
    today = timezone.localdate()
    auto_mark_absent_employees(today, today)
    result = auto_mark_absent_yesterday()
    return result