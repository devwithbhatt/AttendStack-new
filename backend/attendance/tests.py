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
