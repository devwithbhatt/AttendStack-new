from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from attendance.models import AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveStatus
from employees.models import Employee, EmployeeStatus
from holidays.models import Holiday

from .services import calculate_attendance_payroll


def create_attendance(employee, day, status):
    record = AttendanceRecord(employee=employee, date=date(2026, 5, day), status=status)
    record.save(auto_refresh_status=False)
    return record


def create_employee(joining_date=date(2026, 5, 1)):
    return Employee.objects.create(
        employee_id="EMP-PAY-001",
        full_name="Payroll Employee",
        email="payroll@example.com",
        phone="9876543211",
        aadhaar_number="123456789013",
        department="Finance",
        designation="Analyst",
        annual_salary=120000,
        bank_name="Test Bank",
        bank_account_number="1234567891",
        tax_id="ABCDE1235F",
        joining_date=joining_date,
    )


class PayrollCalculationTests(TestCase):
    def test_attendance_statuses_drive_deductions_and_payable_salary(self):
        employee = create_employee()
        Holiday.objects.create(name="Foundation Day", date=date(2026, 5, 1))
        create_attendance(employee, 4, AttendanceStatus.PRESENT)
        create_attendance(employee, 5, AttendanceStatus.HALF_DAY)
        create_attendance(employee, 6, AttendanceStatus.LEAVE)
        create_attendance(employee, 7, AttendanceStatus.PAID_LEAVE)

        payroll = calculate_attendance_payroll(employee, 5, 2026)

        self.assertEqual(payroll["attendance_summary"]["present"], 1)
        self.assertEqual(payroll["attendance_summary"]["half_day"], 1)
        self.assertEqual(payroll["attendance_summary"]["leave"], 1)
        self.assertEqual(payroll["attendance_summary"]["paid_leave"], 1)
        self.assertEqual(payroll["attendance_summary"]["holiday"], 1)
        self.assertEqual(payroll["attendance_summary"]["sunday_unpaid"], 0)
        self.assertEqual(payroll["unpaid_days"], 1.5)
        self.assertEqual(payroll["deductions"], Decimal("483.87"))
        self.assertEqual(payroll["payable_salary"], Decimal("9516.13"))

    def test_paid_half_day_leave_has_no_salary_deduction(self):
        employee = create_employee()
        leave_request = LeaveRequest.objects.create(
            employee=employee,
            start_date=date(2026, 5, 5),
            end_date=date(2026, 5, 5),
            leave_type="CASUAL",
            is_half_day=True,
            reason="Personal work",
            status=LeaveStatus.APPROVED,
        )
        half_day_record = AttendanceRecord(
            employee=employee,
            date=date(2026, 5, 5),
            status=AttendanceStatus.HALF_DAY,
            is_paid=True,
            leave_request=leave_request,
        )
        half_day_record.save(auto_refresh_status=False)

        payroll = calculate_attendance_payroll(employee, 5, 2026)

        self.assertEqual(payroll["attendance_summary"]["half_day"], 1)
        self.assertEqual(payroll["unpaid_days"], 0.0)
        self.assertEqual(payroll["deductions"], Decimal("0.00"))
        self.assertEqual(
            payroll["leave_breakdown"]["casual"],
            {"paid": 0.5, "unpaid": 0.0, "total": 0.5},
        )

    @patch("payroll.services.timezone.localdate")
    def test_current_month_payroll_ignores_future_attendance_records(self, localdate_mock):
        localdate_mock.return_value = date(2026, 5, 30)
        employee = create_employee()
        create_attendance(employee, 30, AttendanceStatus.PRESENT)
        create_attendance(employee, 31, AttendanceStatus.ABSENT)

        payroll = calculate_attendance_payroll(employee, 5, 2026)

        self.assertEqual(payroll["attendance_summary"]["present"], 1)
        self.assertEqual(payroll["attendance_summary"]["absent"], 0)
        self.assertEqual(payroll["unpaid_days"], 0.0)
        self.assertEqual(payroll["deductions"], Decimal("0.00"))

    def test_first_month_salary_starts_on_the_joining_date(self):
        employee = create_employee(joining_date=date(2026, 5, 16))
        create_attendance(employee, 5, AttendanceStatus.ABSENT)
        create_attendance(employee, 16, AttendanceStatus.PRESENT)

        payroll = calculate_attendance_payroll(employee, 5, 2026)

        self.assertEqual(payroll["period_start"], date(2026, 5, 16))
        self.assertEqual(payroll["eligible_days"], 16)
        self.assertEqual(payroll["attendance_summary"]["absent"], 0)
        self.assertEqual(payroll["basic_salary"], Decimal("5161.29"))
        self.assertEqual(payroll["payable_salary"], Decimal("5161.29"))

    def test_inactive_employee_is_paid_through_effective_date_only(self):
        employee = create_employee()
        employee.status = EmployeeStatus.INACTIVE
        employee._status_effective_date = date(2026, 5, 16)
        employee.save(update_fields=["status", "updated_at"])

        payroll = calculate_attendance_payroll(employee, 5, 2026)

        self.assertEqual(payroll["period_end"], date(2026, 5, 16))
        self.assertEqual(payroll["eligible_days"], 16)
        self.assertEqual(payroll["basic_salary"], Decimal("5161.29"))

    def test_employee_inactive_before_month_has_no_payable_days(self):
        employee = create_employee(joining_date=date(2026, 4, 1))
        employee.status = EmployeeStatus.TERMINATED
        employee._status_effective_date = date(2026, 4, 20)
        employee.save(update_fields=["status", "updated_at"])

        payroll = calculate_attendance_payroll(employee, 5, 2026)

        self.assertEqual(payroll["eligible_days"], 0)
        self.assertEqual(payroll["basic_salary"], Decimal("0.00"))


from .models import Payroll, PayrollStatus
from .serializers import PayrollSerializer


class PaidPayrollModificationTests(TestCase):
    def setUp(self):
        self.employee = create_employee()
        self.paid_payroll = Payroll.objects.create(
            employee=self.employee,
            month=5,
            year=2026,
            basic_salary=Decimal("10000.00"),
            allowances=Decimal("2000.00"),
            deductions=Decimal("1000.00"),
            status=PayrollStatus.PAID,
        )

    def test_modifying_paid_payroll_without_reason_fails_validation(self):
        serializer = PayrollSerializer(
            instance=self.paid_payroll,
            data={"basic_salary": "11000.00", "allowances": "2000.00", "deductions": "1000.00", "status": "PAID"},
            partial=True
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("modification_reason", serializer.errors)

    def test_modifying_paid_payroll_with_valid_reason_records_audit_trail(self):
        serializer = PayrollSerializer(
            instance=self.paid_payroll,
            data={
                "basic_salary": "11000.00",
                "allowances": "2500.00",
                "deductions": "1000.00",
                "status": "PAID",
                "modification_reason": "Retroactive incentive bonus adjustment",
            },
            partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.basic_salary, Decimal("11000.00"))
        self.assertEqual(updated.allowances, Decimal("2500.00"))
        self.assertTrue(updated.is_modified_after_payment)
        self.assertEqual(len(updated.modification_history), 1)
        self.assertEqual(updated.modification_history[0]["reason"], "Retroactive incentive bonus adjustment")
        self.assertEqual(updated.modification_history[0]["old_values"]["basic_salary"], "10000.00")
        self.assertEqual(updated.modification_history[0]["new_values"]["basic_salary"], "11000.00")

    def test_modifying_paid_payroll_with_uuid_user_context_serializes_cleanly(self):
        from accounts.models import User
        admin_user = User.objects.create(
            email="admin_audit@example.com",
            first_name="Audit",
            last_name="Officer",
            role="HR"
        )
        from unittest.mock import MagicMock
        mock_request = MagicMock()
        mock_request.user = admin_user

        serializer = PayrollSerializer(
            instance=self.paid_payroll,
            data={
                "basic_salary": "12000.00",
                "allowances": "3000.00",
                "deductions": "1000.00",
                "status": "PAID",
                "modification_reason": "Executive board approved salary revision",
            },
            context={"request": mock_request},
            partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        
        # Reload from DB to confirm database JSONField serialization and deserialization
        self.paid_payroll.refresh_from_db()
        self.assertEqual(self.paid_payroll.basic_salary, Decimal("12000.00"))
        self.assertTrue(self.paid_payroll.is_modified_after_payment)
        self.assertEqual(len(self.paid_payroll.modification_history), 1)
        self.assertEqual(self.paid_payroll.modification_history[0]["modified_by_id"], str(admin_user.id))
        self.assertEqual(self.paid_payroll.modification_history[0]["modified_by_email"], "admin_audit@example.com")

    def test_modifying_pending_payroll_does_not_require_reason(self):
        pending_payroll = Payroll.objects.create(
            employee=self.employee,
            month=6,
            year=2026,
            basic_salary=Decimal("10000.00"),
            allowances=Decimal("2000.00"),
            deductions=Decimal("1000.00"),
            status=PayrollStatus.PENDING,
        )
        serializer = PayrollSerializer(
            instance=pending_payroll,
            data={"basic_salary": "11000.00", "allowances": "2000.00", "deductions": "1000.00", "status": "PENDING"},
            partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.basic_salary, Decimal("11000.00"))
        self.assertFalse(updated.is_modified_after_payment)


from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status as http_status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from organizations.models import Organization

User = get_user_model()


@override_settings(ROOT_URLCONF="payroll.urls")
class PayrollMultiTenantIsolationTests(APITestCase):
    """
    A Super Admin browsing a specific company's Payroll page must see only
    that company's data — never every tenant's payroll blended together
    (the old behavior when no organization context was supplied), and never
    a different company's data just because it happened to be the oldest
    org in the database.
    """

    def setUp(self):
        self.org_a = Organization.objects.create(name="Org Alpha")
        self.org_b = Organization.objects.create(name="Org Beta")

        self.emp_a = create_employee()
        self.emp_a.organization = self.org_a
        self.emp_a.employee_id = "EMP-A-001"
        self.emp_a.email = "alpha.payroll@example.com"
        self.emp_a.save()

        self.emp_b = Employee.objects.create(
            organization=self.org_b,
            employee_id="EMP-B-001",
            full_name="Beta Employee",
            email="beta.payroll@example.com",
            phone="9876543212",
            department="Ops",
            designation="Associate",
            joining_date=date(2026, 5, 1),
        )

        Payroll.objects.create(employee=self.emp_a, month=5, year=2026, basic_salary=10000, net_salary=10000)
        Payroll.objects.create(employee=self.emp_b, month=5, year=2026, basic_salary=12000, net_salary=12000)

        self.super_admin = User.objects.create_superuser(
            email="platform.admin@example.com", password="StrongPass123!",
        )
        self.hr_a = User.objects.create_user(
            email="hr.alpha@example.com", password="StrongPass123!", role=UserRole.HR,
        )
        self.org_a.owner = self.hr_a
        self.org_a.save(update_fields=["owner"])

    def test_super_admin_without_organization_id_sees_nothing(self):
        self.client.force_authenticate(self.super_admin)
        response = self.client.get("/")
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 0)

    def test_super_admin_with_organization_id_sees_only_that_org(self):
        self.client.force_authenticate(self.super_admin)
        response = self.client.get(f"/?organization_id={self.org_b.id}")
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["employee_details"]["id"], str(self.emp_b.id))

    def test_hr_still_sees_only_their_own_organization(self):
        self.client.force_authenticate(self.hr_a)
        response = self.client.get("/")
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["employee_details"]["id"], str(self.emp_a.id))

    def test_generate_payroll_for_super_admin_without_org_affects_nothing(self):
        self.client.force_authenticate(self.super_admin)
        Payroll.objects.all().delete()
        response = self.client.post("/generate/", {"month": 6, "year": 2026}, format="json")
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(Payroll.objects.count(), 0)

    def test_generate_payroll_for_super_admin_with_org_scopes_correctly(self):
        self.client.force_authenticate(self.super_admin)
        Payroll.objects.all().delete()
        response = self.client.post(
            f"/generate/?organization_id={self.org_a.id}", {"month": 6, "year": 2026}, format="json"
        )
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        generated = Payroll.objects.filter(month=6, year=2026)
        self.assertEqual(generated.count(), 1)
        self.assertEqual(generated.first().employee_id, self.emp_a.id)

