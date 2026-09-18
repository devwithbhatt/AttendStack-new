from datetime import date, datetime, time, timedelta
from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveStatus
from attendance.services import (
    ABSENT_TRACKING_START_DATE,
    auto_mark_absent_employees,
    auto_mark_absent_yesterday,
)
from employees.models import Employee
from holidays.models import Holiday


class AbsentMarkingTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.employee = Employee.objects.create(
            employee_id="EMP-ABS-001",
            full_name="Absent Test Employee",
            email="absent_test@example.com",
            phone="9876543201",
            aadhaar_number="123456789099",
            department="Engineering",
            designation="Developer",
            annual_salary=120000,
            bank_name="Bank of Tests",
            bank_account_number="98765432101",
            tax_id="TESTT1234F",
            joining_date=self.today - timedelta(days=30),
            status="ACTIVE",
        )

    def test_auto_mark_absent_for_unmarked_active_employee_on_current_date(self):
        target_date = self.today
        if target_date.weekday() == 6:
            target_date = self.today - timedelta(days=1)
            if target_date.weekday() == 6:
                target_date = self.today - timedelta(days=2)

        res = auto_mark_absent_employees(target_date, target_date)
        
        if target_date >= ABSENT_TRACKING_START_DATE:
            record = AttendanceRecord.objects.filter(employee=self.employee, date=target_date).first()
            self.assertIsNotNone(record)
            self.assertEqual(record.status, AttendanceStatus.ABSENT)
            self.assertFalse(record.is_paid)
            self.assertIn("Auto-marked: Absent", record.notes)

    def test_old_dates_prior_to_start_date_are_never_marked_absent(self):
        past_date = date(2026, 5, 12)  # Tuesday, May 12, 2026
        res = auto_mark_absent_employees(past_date, past_date)
        self.assertEqual(res["created"], 0)
        record = AttendanceRecord.objects.filter(employee=self.employee, date=past_date).first()
        self.assertIsNone(record)

    def test_employee_with_approved_leave_is_not_marked_absent(self):
        target_date = self.today if self.today.weekday() != 6 else self.today - timedelta(days=1)
        if target_date < ABSENT_TRACKING_START_DATE:
            target_date = ABSENT_TRACKING_START_DATE

        LeaveRequest.objects.create(
            employee=self.employee,
            start_date=target_date,
            end_date=target_date,
            leave_type="CASUAL",
            reason="Personal work",
            status=LeaveStatus.APPROVED,
        )

        res = auto_mark_absent_employees(target_date, target_date)
        record = AttendanceRecord.objects.filter(employee=self.employee, date=target_date).first()
        self.assertIsNotNone(record)
        self.assertIn(record.status, [AttendanceStatus.LEAVE, AttendanceStatus.PAID_LEAVE])
        self.assertNotEqual(record.status, AttendanceStatus.ABSENT)

    def test_checked_in_employee_is_not_marked_absent(self):
        target_date = self.today if self.today.weekday() != 6 else self.today - timedelta(days=1)
        if target_date < ABSENT_TRACKING_START_DATE:
            target_date = ABSENT_TRACKING_START_DATE

        existing = AttendanceRecord.objects.create(
            employee=self.employee,
            date=target_date,
            check_in=timezone.make_aware(datetime.combine(target_date, time(10, 5))),
            status=AttendanceStatus.PRESENT,
            is_paid=True,
        )

        res = auto_mark_absent_employees(target_date, target_date)
        existing.refresh_from_db()
        self.assertIn(existing.status, [AttendanceStatus.PRESENT, AttendanceStatus.LATE])
        self.assertNotEqual(existing.status, AttendanceStatus.ABSENT)
        self.assertTrue(existing.is_paid)

    def test_holiday_is_not_marked_absent(self):
        target_date = self.today if self.today.weekday() != 6 else self.today - timedelta(days=1)
        if target_date < ABSENT_TRACKING_START_DATE:
            target_date = ABSENT_TRACKING_START_DATE

        Holiday.objects.create(name="Festival Holiday", date=target_date)

        res = auto_mark_absent_employees(target_date, target_date)
        record = AttendanceRecord.objects.filter(employee=self.employee, date=target_date).first()
        if record:
            self.assertNotEqual(record.status, AttendanceStatus.ABSENT)
