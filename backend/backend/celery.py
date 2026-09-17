import os
from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

app = Celery("backend")

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Load task modules from all registered Django app configs.
app.autodiscover_tasks()

# Define the beat schedule
app.conf.beat_schedule = {
    'mark-absent-employees-every-morning': {
        'task': 'attendance.tasks.mark_absent_employees_task',
        'schedule': crontab(hour=7, minute=0),  # Every day at 7 AM
    },
    # Re-evaluate paid/unpaid leave status for all employees on the 1st of each
    # month.  As monthly accrual ticks over, days that were previously unpaid
    # (taken before sufficient balance was earned) should become paid.
    'monthly-rebalance-paid-leave': {
        'task': 'attendance.tasks.monthly_rebalance_leave_task',
        'schedule': crontab(hour=2, minute=0, day_of_month=1),  # 1st of each month at 2 AM
    },
}

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')