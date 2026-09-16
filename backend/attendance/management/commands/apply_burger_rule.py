from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from attendance.models import Attendance
from holidays.models import Holiday
from settings.models import SystemSettings
from employees.models import Employee

class Command(BaseCommand):
    help = 'Checks for burger leave (leave on both sides of a holiday) and marks the holiday as unpaid.'

    def handle(self, *args, **options):
        settings = SystemSettings.objects.first()
        if not settings or not settings.burger_rule_enabled:
            self.stdout.write(self.style.SUCCESS('Burger Rule is disabled. Skipping.'))
            return

        today = timezone.now().date()
        
        # Find holidays that occurred yesterday
        holidays_yesterday = Holiday.objects.filter(date=today - timedelta(days=1))

        if not holidays_yesterday.exists():
            self.stdout.write('No holidays yesterday. Skipping burger leave check.')
            return

        for holiday in holidays_yesterday:
            day_before_holiday = holiday.date - timedelta(days=1)
            day_after_holiday = holiday.date + timedelta(days=1)

            # Find employees on leave the day before the holiday
            employees_on_leave_before = set(Attendance.objects.filter(
                date=day_before_holiday,
                status__in=['Leave', 'Unpaid']
            ).values_list('employee_id', flat=True))

            # Find employees on leave the day after the holiday
            employees_on_leave_after = set(Attendance.objects.filter(
                date=day_after_holiday,
                status__in=['Leave', 'Unpaid']
            ).values_list('employee_id', flat=True))

            # Find the intersection of these two sets
            sandwiched_employees = employees_on_leave_before.intersection(employees_on_leave_after)

            for employee_id in sandwiched_employees:
                # Mark the holiday as 'Unpaid' for these employees
                holiday_attendance, created = Attendance.objects.update_or_create(
                    employee_id=employee_id,
                    date=holiday.date,
                    defaults={'status': 'Unpaid', 'remarks': 'Burger leave rule applied.'}
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f'Marked holiday {holiday.name} as Unpaid for employee {employee_id}.'))
                else:
                    self.stdout.write(self.style.SUCCESS(f'Updated holiday {holiday.name} to Unpaid for employee {employee_id}.'))