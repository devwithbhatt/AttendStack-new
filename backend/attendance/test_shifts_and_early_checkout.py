import calendar
from datetime import date, time, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from employees.models import Employee, EmployeeStatus
from attendance.models import AttendanceRecord, AttendanceStatus, Shift, EarlyCheckoutPolicy
from settings.models import SystemSettings
from payroll.services import calculate_attendance_payroll


class ShiftAndEarlyCheckoutTestCase(TestCase):
    def setUp(self):
        self.settings = SystemSettings.get_settings()
        self.settings.shift_start_time = time(10, 0)
        self.settings.late_cutoff_time = time(10, 15)
        self.settings.shift_end_time = time(18, 0)
        self.settings.early_checkout_grace_minutes = 15
        self.settings.early_checkout_penalty = "HALF_DAY"
        self.settings.save()

        # Employee 1: Salaried employee (annual salary 360,000 -> 30,000/mo -> 1,000/day in 30-day month)
        self.emp1 = Employee.objects.create(
            employee_id="TEST-SH-01",
            full_name="Alice Shift",
            email="alice.shift@example.com",
            joining_date=date(2026, 1, 1),
            status=EmployeeStatus.ACTIVE,
            annual_salary=Decimal("360000.00"),
        )

        # Employee 2: Evening Shift employee
        self.evening_shift = Shift.objects.create(
            name="Evening Shift",
            code="EVN",
            start_time=time(14, 0),
            end_time=time(22, 0),
            late_grace_minutes=15,
            early_checkout_grace_minutes=20,
            early_checkout_penalty=EarlyCheckoutPolicy.PRO_RATED,
            min_hours_half_day=Decimal("4.00"),
            min_hours_full_day=Decimal("8.00"),
            is_default=False,
            is_active=True,
        )

        self.emp2 = Employee.objects.create(
            employee_id="TEST-SH-02",
            full_name="Bob Evening",
            email="bob.evening@example.com",
            joining_date=date(2026, 1, 1),
            status=EmployeeStatus.ACTIVE,
            shift=self.evening_shift,
            annual_salary=Decimal("360000.00"),
        )

    def test_default_shift_bootstrapping(self):
        default_shift = Shift.get_default_shift()
        self.assertIsNotNone(default_shift)
        self.assertTrue(default_shift.is_default)
        self.assertEqual(default_shift.name, "General Shift")

    def test_checkout_within_grace_period_marks_full_day(self):
        """Checkout at 17:50 for an 18:00 shift end with 15m grace period is on or after 17:45 cutoff -> Full Day."""
        work_date = date(2026, 9, 16)
        tz = timezone.get_current_timezone()
        check_in = timezone.make_aware(timezone.datetime(2026, 9, 16, 9, 55), tz)
        check_out = timezone.make_aware(timezone.datetime(2026, 9, 16, 17, 50), tz)

        rec = AttendanceRecord.objects.create(
            employee=self.emp1,
            date=work_date,
            check_in=check_in,
            check_out=check_out,
        )
        rec.refresh_status()
        rec.save(auto_refresh_status=False)

        self.assertEqual(rec.status, AttendanceStatus.PRESENT)
        self.assertTrue(rec.is_paid)
        self.assertEqual(rec.early_departure_minutes, 0)

    def test_checkout_before_grace_period_half_day_policy(self):
        """Checkout at 16:30 for an 18:00 shift end (15m grace, cutoff 17:45) -> 75m early.
        With HALF_DAY policy, marked as HALF_DAY with is_paid=False and 0.5 day deducted."""
        work_date = date(2026, 9, 16)
        tz = timezone.get_current_timezone()
        check_in = timezone.make_aware(timezone.datetime(2026, 9, 16, 9, 55), tz)
        check_out = timezone.make_aware(timezone.datetime(2026, 9, 16, 16, 30), tz)

        rec = AttendanceRecord.objects.create(
            employee=self.emp1,
            date=work_date,
            check_in=check_in,
            check_out=check_out,
        )
        rec.refresh_status()
        rec.save(auto_refresh_status=False)

        self.assertEqual(rec.status, AttendanceStatus.HALF_DAY)
        self.assertFalse(rec.is_paid)
        self.assertEqual(rec.early_departure_minutes, 75)

        # Test payroll calculation: 1000/day -> 500 deducted for half day
        payroll = calculate_attendance_payroll(self.emp1, 9, 2026)
        self.assertIn("Half Day", payroll["deduction_details"])
        self.assertEqual(payroll["deduction_details"]["Half Day"], "500.00")

    def test_checkout_before_grace_period_prorated_policy(self):
        """Bob is on Evening Shift (14:00 - 22:00, 20m grace -> cutoff 21:40, PRO_RATED policy).
        Checks in at 14:00 and checks out at 20:40 (1 hour early departure).
        Worked 6.67 hours (> 4 hrs min for half day) -> Status remains PRESENT, 60m shortfall deducted pro-rata."""
        work_date = date(2026, 9, 16)
        tz = timezone.get_current_timezone()
        check_in = timezone.make_aware(timezone.datetime(2026, 9, 16, 14, 0), tz)
        check_out = timezone.make_aware(timezone.datetime(2026, 9, 16, 20, 40), tz)

        rec = AttendanceRecord.objects.create(
            employee=self.emp2,
            date=work_date,
            check_in=check_in,
            check_out=check_out,
            shift=self.evening_shift,
        )
        rec.refresh_status()
        rec.save(auto_refresh_status=False)

        self.assertEqual(rec.status, AttendanceStatus.PRESENT)
        self.assertTrue(rec.is_paid)
        self.assertEqual(rec.early_departure_minutes, 60)

        # Test payroll calculation:
        # In Sept (30 days), daily salary = 30000 / 30 = 1000.
        # Shift full day hours = 8 hrs -> Hourly rate = 1000 / 8 = 125.
        # 60m (1 hr) shortfall -> deduction = 125.00
        payroll = calculate_attendance_payroll(self.emp2, 9, 2026)
        self.assertIn("Early Departure", payroll["deduction_details"])
        self.assertEqual(payroll["deduction_details"]["Early Departure"], "125.00")
