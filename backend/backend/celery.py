import os
from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "zuperhr_backend.settings")

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
        'schedule': crontab(hour=7, minute=0),
    },
    'convert-half-day-leaves-every-morning': {
        'task': 'attendance.tasks.convert_half_day_leaves_task',
        'schedule': crontab(hour=0, minute=15),
    },
}

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')