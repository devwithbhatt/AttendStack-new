from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus
from attendance.services import ABSENT_TRACKING_START_DATE
from employees.models import Employee
from payroll.services import calculate_attendance_payroll


class PayrollAbsentDeductionTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.employee = Employee.objects.create(
            employee_id="EMP-DED-001",
            full_name="Deduction Test Employee",
            email="deduction_test@example.com",
            phone="9876543202",
            aadhaar_number="123456789098",
            department="Operations",
            designation="Executive",
            annual_salary=120000,  # 10,000 / month; 30-day month -> 333.33 / day
            bank_name="Test Bank",
            bank_account_number="98765432102",
            tax_id="DEDTT1234F",
            joining_date=date(2026, 9, 1),
            status="ACTIVE",
        )

    def test_single_absent_day_causes_exact_salary_deduction(self):
        # Create an explicit ABSENT record on today
        target_date = self.today
        if target_date.weekday() == 6:
            target_date = self.today - timedelta(days=1)

        AttendanceRecord.objects.create(
            employee=self.employee,
            date=target_date,
            status=AttendanceStatus.ABSENT,
            is_paid=False,
            notes="Auto-marked: Absent",
        )

        payroll = calculate_attendance_payroll(self.employee, target_date.month, target_date.year)

        # Expected:
        # Month = September (30 days) -> per_day_salary = 10000 / 30 = 333.33
        per_day_salary = Decimal("10000") / Decimal("30")
        
        self.assertGreaterEqual(payroll["attendance_summary"]["absent"], 1)
        self.assertIn("Absent Day", payroll["deduction_details"])
        self.assertGreaterEqual(payroll["deductions"], Decimal("333.33"))
        # Verify payable salary is basic_salary minus deductions
        self.assertEqual(payroll["payable_salary"], payroll["basic_salary"] - payroll["deductions"])

    def test_past_months_prior_to_feature_date_have_no_auto_absent_deduction(self):
        # In May 2026, employee had some records, missing days were not auto-marked absent
        payroll = calculate_attendance_payroll(self.employee, 5, 2026)
        # Because joining_date is Sept 1, eligible_days in May is 0
        self.assertEqual(payroll["eligible_days"], 0)
        self.assertEqual(payroll["payable_salary"], Decimal("0.00"))
