from celery import shared_task
from .services import auto_mark_absent_yesterday

@shared_task
def mark_absent_employees_task():
    """Celery task to automatically mark absent employees."""
    result = auto_mark_absent_yesterday()
    return result