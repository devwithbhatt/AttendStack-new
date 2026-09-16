from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from attendance.models import Attendance
from settings.models import SystemSettings

class Command(BaseCommand):
    help = 'Checks for sandwich leave (leave on Saturday and Monday) and marks Sunday as unpaid.'

    def handle(self, *args, **options):
        settings = SystemSettings.objects.first()
        if not settings or not settings.sunday_unpaid_rule_enabled:
            self.stdout.write(self.style.SUCCESS('Sunday Unpaid Rule is disabled. Skipping.'))
            return

        today = timezone.now().date()
        # We are checking for the previous week's sandwich leave.
        # This command should run on a Tuesday to be safe.
        if today.weekday() != 1: # 1 = Tuesday
            self.stdout.write('Not a Tuesday. Skipping sandwich leave check.')
            return

        # Last Monday was 8 days ago, last Saturday was 10 days ago.
        # Let's check for last week.
        last_monday = today - timedelta(days=8)
        last_saturday = last_monday - timedelta(days=2)
        last_sunday = last_monday - timedelta(days=1)

        employees_on_leave_saturday = set(Attendance.objects.filter(
            date=last_saturday,
            status__in=['Leave', 'Unpaid']
        ).values_list('employee_id', flat=True))

        employees_on_leave_monday = set(Attendance.objects.filter(
            date=last_monday,
            status__in=['Leave', 'Unpaid']
        ).values_list('employee_id', flat=True))

        sandwiched_employees = employees_on_leave_saturday.intersection(employees_on_leave_monday)

        if not sandwiched_employees:
            self.stdout.write(self.style.SUCCESS('No employees found with sandwich leave for the last week.'))
            return

        for employee_id in sandwiched_employees:
            sunday_attendance, created = Attendance.objects.update_or_create(
                employee_id=employee_id,
                date=last_sunday,
                defaults={'status': 'Unpaid', 'remarks': 'Sandwich leave rule applied.'}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Marked Sunday as Unpaid for employee {employee_id}.'))
            else:
                self.stdout.write(self.style.WARNING(f'Updated Sunday status to Unpaid for employee {employee_id}.'))

        self.stdout.write(self.style.SUCCESS(f'Successfully processed sandwich leave for {len(sandwiched_employees)} employees.'))