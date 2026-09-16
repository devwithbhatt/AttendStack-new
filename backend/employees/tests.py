from django.contrib.auth import authenticate, get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from organizations.models import Organization
from .models import Employee, EmployeeStatus

User = get_user_model()


@override_settings(ROOT_URLCONF="employees.urls")
class EmployeeStatusActionTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="AttendStack")
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="StrongPass123!",
        )
        self.employee = Employee.objects.create(
            organization=self.organization,
            full_name="Aarav Mehta",
            email="aarav@example.com",
            phone="9876543210",
            aadhaar_number="123456789012",
            department="Engineering",
            designation="Software Engineer",
            annual_salary="900000.00",
            bank_name="HDFC Bank",
            bank_account_number="1234567890",
            tax_id="ABCDE1234F",
        )
        self.employee_user = User.objects.create_user(
            email=self.employee.email,
            password="StrongPass123!",
            first_name="Aarav",
            last_name="Mehta",
            role=UserRole.EMPLOYEE,
            employee_id=self.employee.employee_id,
        )
        self.client.force_authenticate(self.admin_user)

    def test_status_action_keeps_login_active_for_every_status(self):
        for employee_status in EmployeeStatus.values:
            with self.subTest(employee_status=employee_status):
                response = self.client.patch(
                    f"/{self.employee.id}/status/",
                    {"status": employee_status},
                    format="json",
                )

                self.assertEqual(response.status_code, http_status.HTTP_200_OK)
                self.employee.refresh_from_db()
                self.employee_user.refresh_from_db()
                self.assertEqual(self.employee.status, employee_status)
                self.assertTrue(self.employee_user.is_active)
                self.assertEqual(response.data["status"], employee_status)
                self.assertEqual(
                    authenticate(email=self.employee_user.email, password="StrongPass123!"),
                    self.employee_user,
                )

    def test_notice_period_auto_transitions_to_inactive_after_end_date(self):
        today = timezone.localdate()
        end_date = today + timezone.timedelta(days=30)
        response = self.client.patch(
            f"/{self.employee.id}/status/",
            {
                "status": EmployeeStatus.NOTICE_PERIOD,
                "effective_date": str(today),
                "end_date": str(end_date),
            },
            format="json",
        )
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.status, EmployeeStatus.NOTICE_PERIOD)
        self.assertEqual(self.employee.status_end_date, end_date)
        self.assertEqual(self.employee.auto_transition_status, EmployeeStatus.INACTIVE)

        # On the day after notice period ends, status should transition to INACTIVE
        day_after = end_date + timezone.timedelta(days=1)
        self.assertEqual(self.employee.status_on(day_after), EmployeeStatus.INACTIVE)
        self.employee.sync_status(today=day_after)
        self.assertEqual(self.employee.status, EmployeeStatus.INACTIVE)

    def test_provision_auto_transitions_to_active_after_end_date(self):
        today = timezone.localdate()
        end_date = today + timezone.timedelta(days=60)
        response = self.client.patch(
            f"/{self.employee.id}/status/",
            {
                "status": EmployeeStatus.PROVISION,
                "effective_date": str(today),
                "end_date": str(end_date),
            },
            format="json",
        )
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.status, EmployeeStatus.PROVISION)
        self.assertEqual(self.employee.status_end_date, end_date)
        self.assertEqual(self.employee.auto_transition_status, EmployeeStatus.ACTIVE)

        # On the day after provision ends, status should transition to ACTIVE
        day_after = end_date + timezone.timedelta(days=1)
        self.assertEqual(self.employee.status_on(day_after), EmployeeStatus.ACTIVE)
        self.employee.sync_status(today=day_after)
        self.assertEqual(self.employee.status, EmployeeStatus.ACTIVE)

    def test_employee_list_orders_active_first_and_terminated_last(self):
        Employee.objects.create(
            organization=self.organization,
            full_name="Inactive Employee",
            email="inactive@example.com",
            phone="9876543211",
            status=EmployeeStatus.INACTIVE,
        )
        Employee.objects.create(
            organization=self.organization,
            full_name="Terminated Employee",
            email="terminated@example.com",
            phone="9876543212",
            status=EmployeeStatus.TERMINATED,
        )

        response = self.client.get("/")
        employees = response.data["results"] if isinstance(response.data, dict) else response.data

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(employees[0]["status"], EmployeeStatus.ACTIVE)
        self.assertEqual(employees[-1]["status"], EmployeeStatus.TERMINATED)

    def test_status_action_reactivates_previously_disabled_employee_login(self):
        self.employee_user.is_active = False
        self.employee_user.save(update_fields=["is_active"])

        response = self.client.patch(
            f"/{self.employee.id}/status/",
            {"status": EmployeeStatus.TERMINATED},
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.employee_user.refresh_from_db()
        self.assertTrue(self.employee_user.is_active)

    def test_status_action_rejects_invalid_status(self):
        response = self.client.patch(
            f"/{self.employee.id}/status/",
            {"status": "SUSPENDED"},
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_status_action_records_the_effective_date(self):
        effective_date = timezone.localdate()
        response = self.client.patch(
            f"/{self.employee.id}/status/",
            {
                "status": EmployeeStatus.TERMINATED,
                "effective_date": effective_date.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        latest_change = self.employee.status_history.order_by(
            "-effective_date", "-created_at"
        ).first()
        self.assertEqual(latest_change.status, EmployeeStatus.TERMINATED)
        self.assertEqual(latest_change.effective_date, effective_date)

    def test_employee_email_update_also_updates_linked_login(self):
        response = self.client.patch(
            f"/{self.employee.id}/",
            {"email": "aarav.updated@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.employee_user.refresh_from_db()
        self.assertEqual(self.employee.email, "aarav.updated@example.com")
        self.assertEqual(self.employee_user.email, "aarav.updated@example.com")

    def test_employee_email_update_rolls_back_when_login_email_conflicts(self):
        User.objects.create_user(
            email="existing@example.com",
            password="StrongPass123!",
            employee_id="EMP-OTHER",
        )

        response = self.client.patch(
            f"/{self.employee.id}/",
            {"email": "existing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)
        self.employee.refresh_from_db()
        self.employee_user.refresh_from_db()
        self.assertEqual(self.employee.email, "aarav@example.com")
        self.assertEqual(self.employee_user.email, "aarav@example.com")

    def test_password_can_be_reset_for_terminated_employee(self):
        self.employee.status = EmployeeStatus.TERMINATED
        self.employee.save(update_fields=["status", "updated_at"])

        response = self.client.post(
            f"/{self.employee.id}/reset-password/",
            {"password": "NewStrongPass456!"},
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.employee_user.refresh_from_db()
        self.assertTrue(self.employee_user.is_active)
        self.assertTrue(self.employee_user.check_password("NewStrongPass456!"))

    def test_login_account_can_be_created_for_terminated_employee(self):
        self.employee_user.delete()
        self.employee.status = EmployeeStatus.TERMINATED
        self.employee.save(update_fields=["status", "updated_at"])

        response = self.client.post(
            f"/{self.employee.id}/create-password/",
            {"password": "NewStrongPass456!"},
            format="json",
        )

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertIsNotNone(
            authenticate(email=self.employee.email, password="NewStrongPass456!")
        )

    def test_deleting_employee_also_deletes_linked_login_account(self):
        employee_email = self.employee_user.email
        employee_user_id = self.employee_user.id

        response = self.client.delete(f"/{self.employee.id}/")

        self.assertEqual(response.status_code, http_status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=employee_user_id).exists())
        self.assertIsNone(authenticate(email=employee_email, password="StrongPass123!"))
