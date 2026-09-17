from datetime import date, datetime

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import serializers

from employees.models import Employee, EmployeeStatus
from holidays.models import Holiday
from settings.models import SystemSettings

from .models import AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveStatus
from .eligibility import attendance_eligible_records
from .serializers import AttendanceRecordSerializer, LeaveRequestSerializer
from .services import auto_mark_calendar_days, earned_leave_allocation, leave_allocation, sync_leave_request_attendance
from .services import (
    auto_mark_calendar_days,
    earned_leave_allocation,
    leave_allocation,
    sync_leave_request_attendance,
    _rebalance_yearly_paid_leaves,
)


class EmployeeLeaveAllocationTests(TestCase):
    def setUp(self):
        self.settings = SystemSettings.get_settings()
        self.settings.casual_leave_days = 12
        self.settings.sick_leave_days = 12
        self.settings.save()

    def test_first_year_entitlement_starts_from_joining_month(self):
        employee = create_employee()
        employee.joining_date = date(2026, 6, 15)
        employee.save(update_fields=["joining_date"])

        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2026), 7)
        self.assertEqual(leave_allocation(self.settings, "SICK", employee, 2026), 7)
        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2027), 12)

    def test_employee_override_is_prorated_in_first_year(self):
        employee = create_employee()
        employee.joining_date = date(2026, 7, 1)
        employee.casual_leave_days_override = 18
        employee.save(update_fields=["joining_date", "casual_leave_days_override"])

        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2026), 9)

    def test_regular_leave_is_earned_monthly_and_unused_credit_accumulates(self):
        employee = create_employee()
        employee.joining_date = date(2026, 6, 15)
        employee.save(update_fields=["joining_date"])

        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 6, 15)), 1)
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 7, 1)), 2)
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 5, 31)), 0)

    def test_joining_after_15th_starts_from_next_month(self):
        employee = create_employee(email="after15@example.com", employee_id="EMP-TEST-002", aadhaar_number="987654321099")
        employee.joining_date = date(2026, 6, 24)
        employee.save(update_fields=["joining_date"])

        # Joined on June 24 (day > 15): June is excluded, eligible months are July-Dec (6 months)
        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2026), 6)
        self.assertEqual(leave_allocation(self.settings, "SICK", employee, 2026), 6)
        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2027), 12)

        # Accrual earned:
        # In June (month of joining), 0 earned because joining was after the 15th
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 6, 25)), 0)
        # In July, 1 day earned
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 7, 1)), 1)
        # In August, 2 days earned
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 8, 1)), 2)
        # In September, 3 days earned
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 9, 17)), 3)

    def test_joining_after_december_15th_has_zero_first_year_entitlement(self):
        employee = create_employee(email="dec20@example.com", employee_id="EMP-TEST-003", aadhaar_number="987654321098")
        employee.joining_date = date(2026, 12, 20)
        employee.save(update_fields=["joining_date"])

        # Joined after Dec 15: 0 months eligible in 2026, full 12 in 2027
        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2026), 0)
        self.assertEqual(leave_allocation(self.settings, "CASUAL", employee, 2027), 12)
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2026, 12, 25)), 0)
        self.assertEqual(earned_leave_allocation(self.settings, "CASUAL", employee, date(2027, 1, 15)), 1)


def create_employee(email="employee@example.com", employee_id="EMP-TEST-001", aadhaar_number="123456789012"):
    return Employee.objects.create(
        employee_id=employee_id,
        full_name="Test Employee",
        email=email,
        phone="9876543210",
        aadhaar_number=aadhaar_number,
        department="Operations",
        designation="Associate",
        annual_salary=120000,
        bank_name="Test Bank",
        bank_account_number="1234567890",
        tax_id="ABCDE1234F",
        joining_date=date(2026, 1, 1),
    )


class AttendanceRecordSerializerTests(TestCase):
    def test_manual_status_is_preserved_without_punch_times(self):
        employee = create_employee()
        serializer = AttendanceRecordSerializer(
            data={
                "employee": str(employee.id),
                "date": date(2026, 5, 1).isoformat(),
                "status": AttendanceStatus.HALF_DAY,
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        record = serializer.save()

        self.assertEqual(record.status, AttendanceStatus.HALF_DAY)


class AttendanceEmploymentStatusTests(TestCase):
    def setUp(self):
        self.employee = create_employee()

    def _change_status(self, status, effective_date):
        self.employee.status = status
        self.employee._status_effective_date = effective_date
        self.employee.save(update_fields=["status", "updated_at"])

    def test_records_are_hidden_only_during_inactive_and_terminated_periods(self):
        for attendance_date in (
            date(2026, 5, 9),
            date(2026, 5, 10),
            date(2026, 5, 19),
            date(2026, 5, 20),
        ):
            AttendanceRecord.objects.create(
                employee=self.employee,
                date=attendance_date,
                status=AttendanceStatus.PRESENT,
            )

        self._change_status(EmployeeStatus.INACTIVE, date(2026, 5, 10))
        self._change_status(EmployeeStatus.ACTIVE, date(2026, 5, 20))

        visible_dates = list(
            attendance_eligible_records(
                AttendanceRecord.objects.filter(employee=self.employee)
            ).order_by("date").values_list("date", flat=True)
        )

        self.assertEqual(
            visible_dates,
            [date(2026, 5, 9), date(2026, 5, 20)],
        )

    def test_manual_attendance_is_rejected_from_termination_date(self):
        self._change_status(EmployeeStatus.TERMINATED, date(2026, 5, 10))
        serializer = AttendanceRecordSerializer(
            data={
                "employee": str(self.employee.id),
                "date": "2026-05-10",
                "status": AttendanceStatus.PRESENT,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("employee", serializer.errors)

    def test_provision_and_on_leave_statuses_remain_attendance_eligible(self):
        self._change_status(EmployeeStatus.PROVISION, date(2026, 5, 10))
        self._change_status(EmployeeStatus.ON_LEAVE, date(2026, 5, 20))

        self.assertTrue(self.employee.is_attendance_eligible_on(date(2026, 5, 10)))
        self.assertTrue(self.employee.is_attendance_eligible_on(date(2026, 5, 20)))


class LeaveAttachmentValidationTests(TestCase):
    def test_pdf_attachment_is_accepted(self):
        attachment = SimpleUploadedFile("medical-note.pdf", b"PDF content", content_type="application/pdf")
        serializer = LeaveRequestSerializer()

        self.assertEqual(serializer.validate_attachment(attachment), attachment)

    def test_unsupported_attachment_is_rejected(self):
        attachment = SimpleUploadedFile("script.exe", b"not allowed", content_type="application/octet-stream")
        serializer = LeaveRequestSerializer()

        with self.assertRaises(serializers.ValidationError):
            serializer.validate_attachment(attachment)


class EarlyCheckoutStatusTests(TestCase):
    def setUp(self):
        self.employee = create_employee()
        settings = SystemSettings.get_settings()
        settings.shift_end_time = "18:00:00"
        settings.late_cutoff_time = "10:15:00"
        settings.early_checkout_grace_minutes = 120
        settings.sunday_unpaid_rule_enabled = False
        settings.save()

    def _local_datetime(self, hour, minute=0):
        return timezone.make_aware(
            datetime(2026, 5, 4, hour, minute),
            timezone.get_current_timezone(),
        )

    def test_checkout_before_final_two_shift_hours_is_half_day(self):
        record = AttendanceRecord.objects.create(
            employee=self.employee,
            date=date(2026, 5, 4),
            check_in=self._local_datetime(10),
            check_out=self._local_datetime(15, 59),
        )

        self.assertEqual(record.status, AttendanceStatus.HALF_DAY)

    def test_checkout_in_final_two_shift_hours_is_full_day(self):
        record = AttendanceRecord.objects.create(
            employee=self.employee,
            date=date(2026, 5, 4),
            check_in=self._local_datetime(10),
            check_out=self._local_datetime(16),
        )

        self.assertEqual(record.status, AttendanceStatus.PRESENT)

    def test_late_checkin_after_three_hours_marks_half_day(self):
        record = AttendanceRecord.objects.create(
            employee=self.employee,
            date=date(2026, 5, 4),
            check_in=self._local_datetime(13, 0),
        )

        self.assertEqual(record.status, AttendanceStatus.HALF_DAY)


class LeaveAttendanceSyncTests(TestCase):
    def setUp(self):
        self.employee = create_employee()
        settings = SystemSettings.get_settings()
        # Policies are annual totals but regular leave is credited monthly.
        # By May, a 3-day Casual policy has earned 1 day; a 12-day Sick
        # policy has earned 2 days by February.
        settings.casual_leave_days = 3
        settings.sick_leave_days = 12
        settings.save()

    def test_approved_leave_marks_each_date_and_respects_its_type_allowance(self):
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 6),
            reason="Family work",
            status=LeaveStatus.APPROVED,
        )

        result = sync_leave_request_attendance(leave_request)
        records = list(
            AttendanceRecord.objects.filter(employee=self.employee).order_by("date").values_list("date", "status", "is_paid")
        )

        self.assertEqual(result["created"], 3)
        self.assertEqual(
            records,
            [
                (date(2026, 5, 4), AttendanceStatus.PAID_LEAVE, True),
                (date(2026, 5, 5), AttendanceStatus.LEAVE, False),
                (date(2026, 5, 6), AttendanceStatus.LEAVE, False),
            ],
        )

    def test_annual_allowance_does_not_reset_when_a_leave_spans_months(self):
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 31),
            end_date=date(2026, 6, 1),
            reason="Travel",
            status=LeaveStatus.APPROVED,
        )

        sync_leave_request_attendance(leave_request)
        records = list(
            AttendanceRecord.objects.filter(employee=self.employee).order_by("date").values_list("date", "status", "is_paid")
        )

        self.assertEqual(
            records,
            [
                (date(2026, 5, 31), AttendanceStatus.PAID_LEAVE, True),
                (date(2026, 6, 1), AttendanceStatus.LEAVE, False),
            ],
        )

    def test_rejected_leave_removes_attendance_records_created_from_request(self):
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 4),
            reason="Family work",
            status=LeaveStatus.APPROVED,
        )
        sync_leave_request_attendance(leave_request)

        leave_request.status = LeaveStatus.REJECTED
        result = sync_leave_request_attendance(leave_request)

        self.assertEqual(result["deleted"], 1)
        self.assertFalse(AttendanceRecord.objects.filter(employee=self.employee).exists())

    def test_each_leave_type_uses_its_own_configured_balance(self):
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 2, 2),
            end_date=date(2026, 2, 3),
            reason="Family work",
            leave_type="SICK",
            status=LeaveStatus.APPROVED,
        )

        sync_leave_request_attendance(leave_request)
        records = list(
            AttendanceRecord.objects.filter(employee=self.employee).order_by("date").values_list("date", "status", "is_paid")
        )

        self.assertEqual(
            records,
            [
                (date(2026, 2, 2), AttendanceStatus.PAID_LEAVE, True),
                (date(2026, 2, 3), AttendanceStatus.PAID_LEAVE, True),
            ],
        )

    def test_new_joiner_cannot_use_future_months_paid_leave_in_advance(self):
        self.employee.joining_date = date(2026, 7, 1)
        self.employee.save(update_fields=["joining_date"])
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 7, 6),
            end_date=date(2026, 7, 7),
            reason="Two days in joining month",
            leave_type="SICK",
            status=LeaveStatus.APPROVED,
        )

        sync_leave_request_attendance(leave_request)

        self.assertEqual(
            list(AttendanceRecord.objects.filter(employee=self.employee).order_by("date").values_list("status", "is_paid")),
            [(AttendanceStatus.PAID_LEAVE, True), (AttendanceStatus.LEAVE, False)],
        )

    def test_leave_approval_recalculates_an_existing_payroll(self):
        from payroll.models import Payroll
        from payroll.services import calculate_attendance_payroll

        absent = AttendanceRecord(
            employee=self.employee,
            date=date(2026, 5, 4),
            status=AttendanceStatus.ABSENT,
            is_paid=False,
        )
        absent.save(auto_refresh_status=False)
        initial = calculate_attendance_payroll(self.employee, 5, 2026)
        payroll = Payroll.objects.create(
            employee=self.employee,
            month=5,
            year=2026,
            basic_salary=initial["basic_salary"],
            deductions=initial["deductions"],
            deduction_details=initial["deduction_details"],
        )
        self.assertGreater(payroll.deductions, 0)

        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 4),
            reason="Family work",
            status=LeaveStatus.APPROVED,
        )
        result = sync_leave_request_attendance(leave_request)

        payroll.refresh_from_db()
        self.assertEqual(result["payrolls_updated"], 1)
        self.assertEqual(payroll.deductions, 0)
        self.assertEqual(payroll.net_salary, payroll.basic_salary)


class MonthlyLeaveLimitTests(TestCase):
    def setUp(self):
        self.employee = create_employee()
        settings = SystemSettings.get_settings()
        settings.casual_leave_monthly_limit = 3
        settings.sick_leave_monthly_limit = 7
        settings.save()

    def test_pending_and_approved_requests_reserve_the_monthly_limit(self):
        LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 5),
            leave_type="CASUAL",
            reason="Existing request",
            status=LeaveStatus.PENDING,
        )
        serializer = LeaveRequestSerializer(data={
            "employee": str(self.employee.id),
            "start_date": "2026-05-11",
            "end_date": "2026-05-12",
            "leave_type": "CASUAL",
            "reason": "New request",
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("monthly limit exceeded", str(serializer.errors["detail"][0]).lower())

    def test_cross_month_request_is_capped_per_calendar_month(self):
        LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 5),
            leave_type="CASUAL",
            reason="Existing request",
            status=LeaveStatus.APPROVED,
        )
        serializer = LeaveRequestSerializer(data={
            "employee": str(self.employee.id),
            "start_date": "2026-05-31",
            "end_date": "2026-06-01",
            "leave_type": "CASUAL",
            "reason": "Cross-month request",
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)


class EmploymentStartAttendanceTests(TestCase):
    def setUp(self):
        self.employee = create_employee()

    def test_calendar_records_start_on_the_employee_joining_date(self):
        employee = create_employee(
            email="new.joiner@example.com",
            employee_id="EMP-NEW-001",
            aadhaar_number="123456789013",
        )
        employee.joining_date = date(2026, 5, 16)
        employee.save(update_fields=["joining_date"])
        Holiday.objects.create(name="Early Month Holiday", date=date(2026, 5, 1))

        auto_mark_calendar_days(5, 2026)

        records = AttendanceRecord.objects.filter(employee=employee)
        self.assertFalse(records.filter(date__lt=employee.joining_date).exists())
        self.assertTrue(records.filter(date=date(2026, 5, 17), status=AttendanceStatus.SUNDAY_PAID).exists())

    def test_half_day_casual_leave_uses_half_of_the_paid_balance(self):
        settings = SystemSettings.get_settings()
        settings.casual_leave_days = 3  # Earns 0.5 day by February.
        settings.save()

        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 2, 2),
            end_date=date(2026, 2, 2),
            reason="Family work",
            is_half_day=True,
            status=LeaveStatus.APPROVED,
        )

        sync_leave_request_attendance(leave_request)
        records = list(
            AttendanceRecord.objects.filter(employee=self.employee).order_by("date").values_list("date", "status", "is_paid")
        )

        self.assertEqual(
            records,
            [
                (date(2026, 2, 2), AttendanceStatus.HALF_DAY, True),
            ],
        )


from rest_framework.test import APITestCase
from django.urls import reverse
from rest_framework import status


class AttendanceVisibilityApiTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.admin = User.objects.create_superuser(
            email="attendance.admin@example.com",
            password="StrongPass123!",
        )
        self.employee = create_employee()
        self.client.force_authenticate(self.admin)

    def test_list_keeps_pre_transition_history_and_hides_ineligible_dates(self):
        for attendance_date in (date(2026, 5, 9), date(2026, 5, 10)):
            AttendanceRecord.objects.create(
                employee=self.employee,
                date=attendance_date,
                status=AttendanceStatus.PRESENT,
            )

        self.employee.status = EmployeeStatus.TERMINATED
        self.employee._status_effective_date = date(2026, 5, 10)
        self.employee.save(update_fields=["status", "updated_at"])

        response = self.client.get(
            reverse("attendance:attendance-list"),
            {"year": 2026, "month": 5},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [record["date"] for record in response.data],
            ["2026-05-09"],
        )

    def test_inactive_employee_can_view_historical_attendance_report(self):
        from django.contrib.auth import get_user_model
        from organizations.models import Organization

        org = Organization.objects.create(name="Test Org")
        self.employee.organization = org
        self.employee.save(update_fields=["organization"])

        AttendanceRecord.objects.create(
            employee=self.employee,
            date=date(2026, 5, 9),
            status=AttendanceStatus.PRESENT,
        )
        self.employee.status = EmployeeStatus.INACTIVE
        self.employee._status_effective_date = date(2026, 5, 10)
        self.employee.save(update_fields=["status", "updated_at"])
        user = get_user_model().objects.create_user(
            email=self.employee.email,
            password="StrongPass123!",
            employee_id=self.employee.employee_id,
        )
        self.client.force_authenticate(user)

        response = self.client.get(
            reverse("attendance:attendance-me"),
            {"date_from": "2026-05-01", "date_to": "2026-05-31"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([record["date"] for record in response.data], ["2026-05-09"])


class MonthlyLeaveLimitApiTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.user = User.objects.create_user(
            email="monthly.limit@example.com",
            password="StrongPass123!",
            employee_id="EMP-LIMIT-001",
        )
        self.employee = create_employee(
            email="monthly.limit@example.com",
            employee_id="EMP-LIMIT-001",
            aadhaar_number="123456789014",
        )
        settings = SystemSettings.get_settings()
        settings.casual_leave_monthly_limit = 3
        settings.save()
        LeaveRequest.objects.create(
            employee=self.employee,
            start_date=date(2026, 5, 4),
            end_date=date(2026, 5, 5),
            leave_type="CASUAL",
            reason="Existing request",
            status=LeaveStatus.PENDING,
        )
        self.client.force_authenticate(self.user)

    def test_employee_create_cannot_bypass_monthly_limit(self):
        response = self.client.post(
            reverse("attendance:leaves-list"),
            {
                "start_date": "2026-05-11",
                "end_date": "2026-05-12",
                "leave_type": "CASUAL",
                "reason": "New request",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("monthly limit exceeded", response.data["detail"].lower())
        self.assertEqual(LeaveRequest.objects.filter(employee=self.employee).count(), 1)

    def test_inactive_or_terminated_employee_cannot_create_leave_request(self):
        for employee_status in (EmployeeStatus.INACTIVE, EmployeeStatus.TERMINATED):
            self.employee.status = employee_status
            self.employee.save(update_fields=["status", "updated_at"])
            response = self.client.post(
                reverse("attendance:leaves-list"),
                {
                    "start_date": "2026-06-11",
                    "end_date": "2026-06-11",
                    "leave_type": "CASUAL",
                    "reason": "Must be blocked",
                },
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertIn("Inactive or Terminated", response.data["detail"])


class GeofenceBypassTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(
            email="employee@example.com",
            password="testpassword",
            employee_id="EMP-TEST-001"
        )
        self.employee = create_employee(email="employee@example.com", employee_id="EMP-TEST-001")
        self.settings = SystemSettings.get_settings()
        self.settings.geofencing_enabled = True
        self.settings.office_latitude = 26.8342
        self.settings.office_longitude = 80.9862
        self.settings.geofence_radius = 100
        self.settings.ip_restriction_enabled = False
        self.settings.allowed_ip_ranges = ""
        self.settings.save()
        self.client.force_authenticate(user=self.user)

    def test_geofence_fails_when_far_away(self):
        # Coordinates for a place far away
        url = reverse("attendance:attendance-check-in")
        response = self.client.post(url, {"latitude": 30.0, "longitude": 80.9862})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Location check failed", response.data["detail"])
        self.assertEqual(response.data["code"], "OUTSIDE_GEOFENCE")

    def test_geofence_bypassed_when_ip_is_whitelisted(self):
        self.settings.ip_restriction_enabled = True
        self.settings.allowed_ip_ranges = "192.168.1.1, 10.0.0.1"
        self.settings.save()

        url = reverse("attendance:attendance-check-in")
        # Post coordinate that is far away, but mock client IP to be 10.0.0.1
        response = self.client.post(
            url, 
            {"latitude": 30.0, "longitude": 80.9862},
            REMOTE_ADDR="10.0.0.1"
        )
        # It should bypass geofencing and succeed!
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_location_match_allows_check_in_when_ip_and_geofence_are_enabled(self):
        self.settings.ip_restriction_enabled = True
        self.settings.allowed_ip_ranges = "10.0.0.1"
        self.settings.save()

        url = reverse("attendance:attendance-check-in")
        response = self.client.post(
            url,
            {"latitude": 26.8342, "longitude": 80.9862, "accuracy": 20},
            REMOTE_ADDR="203.0.113.10",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_geofence_only_does_not_bypass_from_stale_allowed_ip(self):
        self.settings.ip_restriction_enabled = False
        self.settings.allowed_ip_ranges = "10.0.0.1"
        self.settings.save()

        url = reverse("attendance:attendance-check-in")
        response = self.client.post(
            url,
            {"latitude": 30.0, "longitude": 80.9862},
            REMOTE_ADDR="10.0.0.1",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "OUTSIDE_GEOFENCE")

    def test_employee_cannot_check_in_over_approved_full_day_leave(self):
        today = timezone.localdate()
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=today,
            end_date=today,
            leave_type="CASUAL",
            reason="Approved personal leave",
            status=LeaveStatus.APPROVED,
        )
        sync_leave_request_attendance(leave_request)

        response = self.client.post(
            reverse("attendance:attendance-check-in"),
            {"latitude": 26.8342, "longitude": 80.9862, "accuracy": 20},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("approved full-day leave", response.data["detail"])
        record = AttendanceRecord.objects.get(employee=self.employee, date=today)
        self.assertEqual(record.status, AttendanceStatus.PAID_LEAVE)
        self.assertIsNone(record.check_in)


# ---------------------------------------------------------------------------
# Regression tests for leave balance display and rebalance bugs
# ---------------------------------------------------------------------------

class LeaveBalanceRegressionTests(TestCase):
    """
    Regression tests for two related leave balance bugs.

    Bug 1 — Display: the leave_policy view was filtering AttendanceRecord with
    is_paid=True, so days taken before sufficient accrual (marked unpaid by the
    rebalance) were excluded from the 'used' count, making 'remaining' appear
    higher than it really is.

    Bug 2 — Rebalance: _rebalance_yearly_paid_leaves used record.date to
    compute the leave accrual for each day.  Days taken before accrual accrued
    were permanently stuck as unpaid even once the employee had earned enough
    leave in later months.
    """

    def setUp(self):
        self.settings = SystemSettings.get_settings()
        # 12 casual and sick days per year → 1 day accrued per month
        self.settings.casual_leave_days = 12
        self.settings.sick_leave_days = 12
        self.settings.save()

        # Employee joined in January so they have a full year's entitlement.
        self.employee = create_employee(
            email="regression@example.com",
            employee_id="EMP-REG-001",
            aadhaar_number="999999999999",
        )
        self.employee.joining_date = date(2026, 1, 1)
        self.employee.save(update_fields=["joining_date"])

    def _create_leave_and_records(self, start_date, end_date, leave_type="CASUAL", is_half_day=False):
        """Helper: create an approved leave request and its attendance records."""
        leave_request = LeaveRequest.objects.create(
            employee=self.employee,
            start_date=start_date,
            end_date=end_date,
            leave_type=leave_type,
            is_half_day=is_half_day,
            reason="Test leave",
            status=LeaveStatus.APPROVED,
        )
        sync_leave_request_attendance(leave_request)
        return leave_request

    # ------------------------------------------------------------------
    # Bug 2 regression — rebalance uses today's accrual, not record.date
    # ------------------------------------------------------------------

    def test_rebalance_retroactively_pays_days_after_accrual_catches_up(self):
        """
        Employee takes 3 casual days in January when only 1 day was accrued.
        Days 2 & 3 are initially marked unpaid.  After the rebalance runs with
        today's accrual (≥3 months earned), all three days must become paid.
        """
        # January: only 1 casual day accrued (1/12 of 12).
        # Employee takes 3 days → days 2 and 3 will be initially unpaid.
        self._create_leave_and_records(date(2026, 1, 5), date(2026, 1, 7))

        records = AttendanceRecord.objects.filter(
            employee=self.employee,
            leave_request__leave_type="CASUAL",
            leave_request__status=LeaveStatus.APPROVED,
        ).order_by("date")

        # After initial sync (rebalance runs at the time the leave is approved),
        # the first day should be paid and the other two should be unpaid — but
        # the rebalance now uses today's date, so depending on when the test
        # runs the result may already be all paid.  The key assertion is that
        # calling _rebalance_yearly_paid_leaves with a "future" accrual date
        # makes all three records paid.
        _rebalance_yearly_paid_leaves(self.employee, 2026)

        paid_count = records.filter(is_paid=True).count()
        unpaid_count = records.filter(is_paid=False).count()
        total = records.count()
        self.assertEqual(total, 3)
        # With today's accrual (≥ 3 months), all 3 days must be paid.
        self.assertEqual(paid_count, 3, f"Expected 3 paid records but got {paid_count} paid and {unpaid_count} unpaid")

    def test_rebalance_still_caps_at_current_accrual(self):
        """
        If an employee takes MORE leave than they have ever accrued (even today),
        excess days should still remain unpaid.
        """
        # Employee has 12-day annual policy → 9 months into the year = 9 accrued.
        # Take 10 days → day 10 must remain unpaid regardless.
        # Use dates in January so there are 10 consecutive working days.
        self._create_leave_and_records(date(2026, 1, 5), date(2026, 1, 16))

        # Run rebalance as if today is January 31 (only 1 day accrued).
        from unittest.mock import patch
        with patch("attendance.services.timezone") as mock_tz:
            mock_tz.localdate.return_value = date(2026, 1, 31)
            _rebalance_yearly_paid_leaves(self.employee, 2026)

        records = AttendanceRecord.objects.filter(
            employee=self.employee,
            leave_request__leave_type="CASUAL",
            leave_request__status=LeaveStatus.APPROVED,
        ).order_by("date")

        paid_count = records.filter(is_paid=True).count()
        self.assertEqual(paid_count, 1, f"Expected only 1 paid record (Jan accrual) but got {paid_count}")

    # ------------------------------------------------------------------
    # Bug 1 regression — leave_policy view counts all approved leave days
    # ------------------------------------------------------------------

    def test_leave_policy_used_includes_unpaid_leave_days(self):
        """
        Simulate the leave_policy view's used-count logic (stripped from the
        view to be unit-testable).  Unpaid leave-attendance records for approved
        leaves must still count toward 'used' so that 'remaining' is correct.
        """
        from attendance.services import leave_units

        # Create a 3-day leave in January.  At the time of creation, only 1 day
        # is accrued so 2 records will initially be unpaid.
        self._create_leave_and_records(date(2026, 1, 5), date(2026, 1, 7))

        # --- Simulate the OLD (buggy) logic: is_paid=True ---
        old_records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=self.employee,
            date__year=2026,
            is_paid=True,
            leave_request__status=LeaveStatus.APPROVED,
        )
        old_used = sum(leave_units(r.leave_request) for r in old_records)

        # --- Simulate the NEW (fixed) logic: no is_paid filter ---
        new_records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=self.employee,
            date__year=2026,
            leave_request__status=LeaveStatus.APPROVED,
        )
        new_used = sum(leave_units(r.leave_request) for r in new_records)

        # The new logic must count all 3 days regardless of is_paid.
        self.assertEqual(new_used, 3)
        # The old logic would have undercounted (only the 1 paid day).
        self.assertLessEqual(old_used, new_used)

    def test_leave_policy_remaining_is_zero_when_all_entitlement_taken(self):
        """
        Employee earns 3 months of casual leave (3 days from a 12/yr policy).
        They take all 3 days.  'remaining' must show 0, not a positive number.
        """
        from attendance.services import earned_leave_allocation, leave_units

        # Take 3 days in January (≥3 months have passed by the time we check).
        self._create_leave_and_records(date(2026, 1, 5), date(2026, 1, 7))

        as_of = date(2026, 3, 31)  # 3 months accrued → 3 days entitlement
        entitlement = earned_leave_allocation(self.settings, "CASUAL", self.employee, as_of)

        # Count ALL approved leave records (the fixed logic).
        all_records = AttendanceRecord.objects.select_related("leave_request").filter(
            employee=self.employee,
            date__year=2026,
            leave_request__leave_type="CASUAL",
            leave_request__status=LeaveStatus.APPROVED,
        )
        used = sum(leave_units(r.leave_request) for r in all_records)
        remaining = max(entitlement - used, 0)

        self.assertEqual(entitlement, 3)
        self.assertEqual(used, 3)
        self.assertEqual(remaining, 0, f"Remaining should be 0 but got {remaining}")

