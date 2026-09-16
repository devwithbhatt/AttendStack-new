
import os
import django
import datetime

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendstack_backend.settings')
django.setup()

from employees.models import Employee
from attendance.models import AttendanceRecord

def add_attendance_for_employee(employee_id, start_date, end_date):
    try:
        employee = Employee.objects.get(employee_id=employee_id)
    except Employee.DoesNotExist:
        print(f"Employee with ID {employee_id} not found.")
        return

    current_date = start_date
    while current_date <= end_date:
        status = 'SUNDAY_PAID' if current_date.weekday() == 6 else 'PRESENT'
        
        record, created = AttendanceRecord.objects.get_or_create(
            employee=employee,
            date=current_date,
            defaults={'status': status}
        )

        if created:
            print(f"Created attendance record for {employee.full_name} on {current_date} with status {status}")
        else:
            print(f"Attendance record for {employee.full_name} on {current_date} already exists.")
            
        current_date += datetime.timedelta(days=1)

if __name__ == '__main__':
    # Employee details
    employee_id = 'EMP-00001'
    
    # Date range
    start_date = datetime.date(2026, 1, 1)
    end_date = datetime.date(2026, 4, 30)
    
    add_attendance_for_employee(employee_id, start_date, end_date)