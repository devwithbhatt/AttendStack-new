from django.core.management.base import BaseCommand
from django.utils import timezone
from employees.models import Employee
from attendance.models import AttendanceRecord, AttendanceStatus
from holidays.models import Holiday

class Command(BaseCommand):
    help = 'Marks attendance as HOLIDAY for all employees on a company holiday.'

    def handle(self, *args, **options):
        today = timezone.now().date()
        
        if Holiday.objects.filter(date=today).exists():
            employees = Employee.objects.all()
            for employee in employees:
                AttendanceRecord.objects.update_or_create(
                    employee=employee,
                    date=today,
                    defaults={
                        'status': AttendanceStatus.HOLIDAY,
                        'is_paid': True,
                    }
                )
            self.stdout.write(self.style.SUCCESS(f'Successfully marked attendance as HOLIDAY for all employees on {today}.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Today ({today}) is not a holiday.'))