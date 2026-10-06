from datetime import date
from unittest.mock import patch

from django.contrib.auth import authenticate, get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from organizations.models import Organization
from .models import Employee, EmployeeStatus, MERGE_REQUEST_SOURCE

User = get_user_model()


class EmployeeIdUniquenessTests(TestCase):
    """
    employee_id is picked optimistically (read the highest existing code,
    propose the next one) with no row lock, so two concurrent "+ Add
    Employee" submissions can race for the same candidate. The DB's unique
    constraint always prevents an actual duplicate; this proves the loser
    gets a transparent retry instead of a raw IntegrityError/500.
    """

    def _make_employee(self, employee_id, email):
        return Employee.objects.create(
            employee_id=employee_id,
            full_name="Race Condition Test",
            email=email,
            phone="9876500100",
            joining_date=date(2025, 1, 1),
        )

    def test_sequential_ids_increment_normally(self):
        first = self._make_employee("", "seq1@example.com")
        second = self._make_employee("", "seq2@example.com")
        self.assertNotEqual(first.employee_id, second.employee_id)
        self.assertTrue(first.employee_id.startswith("EMP-"))
        self.assertTrue(second.employee_id.startswith("EMP-"))

    def test_retries_when_the_computed_candidate_is_already_taken(self):
        # Pre-occupy the id the generator would naturally compute next, to
        # simulate a concurrent request having just won that exact race.
        would_be_next = Employee._next_employee_id_candidate()
        self._make_employee(would_be_next, "incumbent@example.com")

        new_employee = self._make_employee("", "late-to-the-race@example.com")

        self.assertNotEqual(new_employee.employee_id, would_be_next)
        self.assertTrue(
            Employee.objects.filter(employee_id=new_employee.employee_id).count() == 1
        )

    def test_gives_up_after_max_attempts_and_raises_instead_of_looping_forever(self):
        from django.db import IntegrityError

        with patch.object(Employee, "_next_employee_id_candidate", return_value="EMP-STUCK"):
            self._make_employee("EMP-STUCK", "first@example.com")
            with self.assertRaises(IntegrityError):
                self._make_employee("", "second@example.com")


class OrganizationInviteCodeUniquenessTests(TestCase):
    """invite_code's keyspace (32^8) makes a real collision astronomically
    unlikely, but confirms the same fail-safe retry exists if it ever
    happens, rather than a bare IntegrityError reaching the user."""

    def test_retries_when_the_generated_code_is_already_taken(self):
        from organizations.models import generate_invite_code

        taken_code = generate_invite_code()
        Organization.objects.create(name="First Co", invite_code=taken_code)

        # First call (the field's default=, at construction time) returns
        # the already-taken code to force the collision; the second call
        # (inside save()'s retry) returns a genuinely different one.
        with patch(
            "organizations.models.generate_invite_code",
            side_effect=[taken_code, "ORG-RETRY01"],
        ):
            second = Organization(name="Second Co")
            second.save()

        self.assertNotEqual(second.invite_code, taken_code)
        self.assertEqual(Organization.objects.filter(invite_code=taken_code).count(), 1)


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

        # A platform admin must specify which company it's listing — see
        # organizations.services.resolve_organization_for_request.
        response = self.client.get(f"/?organization_id={self.organization.id}")
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


@override_settings(
    ROOT_URLCONF="employees.urls",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class EmployeeCreationLoginProvisioningTests(APITestCase):
    """
    Adding an employee through the API (HR/Admin's "+ Add Employee") must
    provision a login account and email them a way to set their password —
    otherwise they're invisible everywhere (Chat, etc.) until someone
    remembers to run "Create Password" manually.
    """

    def setUp(self):
        self.organization = Organization.objects.create(name="AttendStack")
        self.admin_user = User.objects.create_superuser(
            email="admin2@example.com",
            password="StrongPass123!",
        )
        self.client.force_authenticate(self.admin_user)

    def _create_employee_payload(self, email="new.hire@example.com"):
        return {
            "full_name": "New Hire",
            "email": email,
            "phone": "9123456780",
        }

    def test_creating_employee_provisions_login_and_sends_welcome_email(self):
        from django.core import mail

        response = self.client.post("/", self._create_employee_payload(), format="json")

        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertNotIn("warning", response.data)

        user = User.objects.filter(email__iexact="new.hire@example.com").first()
        self.assertIsNotNone(user)
        self.assertTrue(user.is_active)
        self.assertEqual(user.role, UserRole.EMPLOYEE)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn("new.hire@example.com", sent.to)
        self.assertIn("AttendStack", sent.subject)

    def test_login_account_is_not_duplicated_if_one_already_exists(self):
        existing = User.objects.create_user(
            email="already.has.login@example.com",
            password="StrongPass123!",
            role=UserRole.EMPLOYEE,
        )
        response = self.client.post(
            "/", self._create_employee_payload(email="already.has.login@example.com"), format="json"
        )
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(
            User.objects.filter(email__iexact="already.has.login@example.com").count(), 1
        )
        existing.refresh_from_db()

    def test_employee_creation_still_succeeds_even_if_welcome_email_fails(self):
        from unittest.mock import patch

        with patch(
            "employees.views.send_employee_welcome_email", side_effect=Exception("SMTP down")
        ):
            response = self.client.post("/", self._create_employee_payload(), format="json")

        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertIn("warning", response.data)
        # The login account should still exist even though the email failed.
        self.assertTrue(User.objects.filter(email__iexact="new.hire@example.com").exists())


@override_settings(ROOT_URLCONF="employees.urls")
class MergeRequestActionTests(APITestCase):
    """The Employees page 'Requests' section: pending 'Merge with existing
    company' signups (see accounts.OrganizationMergeJoinSerializer) that a
    company admin can Approve (join as a full teammate) or Deny (removed
    entirely)."""

    def setUp(self):
        self.organization = Organization.objects.create(name="AttendStack")
        self.other_organization = Organization.objects.create(name="Other Co")
        self.admin_user = User.objects.create_hr(
            email="org-admin@example.com",
            password="StrongPass123!",
        )
        self.organization.owner = self.admin_user
        self.organization.save(update_fields=["owner"])

        self.pending_employee = Employee.objects.create(
            organization=self.organization,
            full_name="Late Joiner",
            email="late-joiner@example.com",
            phone="9876543210",
            status=EmployeeStatus.INACTIVE,
            external_source=MERGE_REQUEST_SOURCE,
        )
        self.pending_user = User.objects.create_user(
            email=self.pending_employee.email,
            password="StrongPass123!",
            role=UserRole.EMPLOYEE,
            employee_id=self.pending_employee.employee_id,
        )

        self.other_pending_employee = Employee.objects.create(
            organization=self.other_organization,
            full_name="Different Company Joiner",
            email="different-co@example.com",
            phone="9876543211",
            status=EmployeeStatus.INACTIVE,
            external_source=MERGE_REQUEST_SOURCE,
        )

        self.client.force_authenticate(self.admin_user)

    def test_pending_requests_are_excluded_from_the_main_employee_list(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        ids = [str(row["id"]) for row in rows]
        self.assertNotIn(str(self.pending_employee.id), ids)

    def test_merge_requests_endpoint_is_scoped_to_the_caller_organization(self):
        response = self.client.get("/merge-requests/")

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        ids = [str(row["id"]) for row in response.data]
        self.assertIn(str(self.pending_employee.id), ids)
        self.assertNotIn(str(self.other_pending_employee.id), ids)

    def test_approve_activates_employee_and_unblocks_login(self):
        response = self.client.post(f"/{self.pending_employee.id}/approve-merge-request/")

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.pending_employee.refresh_from_db()
        self.assertEqual(self.pending_employee.status, EmployeeStatus.ACTIVE)
        self.assertEqual(self.pending_employee.external_source, "")

        login_response = self.client.post(
            "/api/v1/accounts/login/",
            {"email": "late-joiner@example.com", "password": "StrongPass123!"},
        )
        self.assertNotEqual(login_response.status_code, http_status.HTTP_401_UNAUTHORIZED)

    def test_approve_cannot_reach_a_different_organizations_request(self):
        response = self.client.post(f"/{self.other_pending_employee.id}/approve-merge-request/")

        self.assertEqual(response.status_code, http_status.HTTP_404_NOT_FOUND)

    def test_deny_deletes_the_employee_and_login_account(self):
        response = self.client.post(f"/{self.pending_employee.id}/deny-merge-request/")

        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertFalse(Employee.objects.filter(pk=self.pending_employee.id).exists())
        self.assertIsNone(authenticate(email="late-joiner@example.com", password="StrongPass123!"))

    def test_cannot_approve_or_deny_an_ordinary_non_pending_employee(self):
        ordinary_employee = Employee.objects.create(
            organization=self.organization,
            full_name="Ordinary Employee",
            email="ordinary@example.com",
            phone="9876543212",
        )

        approve_response = self.client.post(f"/{ordinary_employee.id}/approve-merge-request/")
        deny_response = self.client.post(f"/{ordinary_employee.id}/deny-merge-request/")

        self.assertEqual(approve_response.status_code, http_status.HTTP_404_NOT_FOUND)
        self.assertEqual(deny_response.status_code, http_status.HTTP_404_NOT_FOUND)


@override_settings(ROOT_URLCONF="employees.urls")
class EmployeeMultiTenantIsolationTests(APITestCase):
    """
    A Super Admin browsing one company's Employees page must see only that
    company's roster — never every tenant's employees blended together
    (the old behavior when no company was specified).
    """

    def setUp(self):
        self.org_a = Organization.objects.create(name="Tenant Alpha")
        self.org_b = Organization.objects.create(name="Tenant Beta")

        self.emp_a = Employee.objects.create(
            organization=self.org_a, full_name="Alpha Worker", email="alpha.emp@example.com",
            employee_id="EMP-ISO-A", phone="9876500001", joining_date=date(2025, 1, 1),
            status=EmployeeStatus.ACTIVE,
        )
        self.emp_b = Employee.objects.create(
            organization=self.org_b, full_name="Beta Worker", email="beta.emp@example.com",
            employee_id="EMP-ISO-B", phone="9876500002", joining_date=date(2025, 1, 1),
            status=EmployeeStatus.ACTIVE,
        )

        self.super_admin = User.objects.create_superuser(
            email="platform.employees.admin@example.com", password="StrongPass123!",
        )
        self.client.force_authenticate(self.super_admin)

    def test_list_without_organization_id_is_empty(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)

    def test_list_with_organization_id_shows_only_that_org(self):
        response = self.client.get(f"/?organization_id={self.org_b.id}")
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        emails = [e["email"] for e in response.data["results"]]
        self.assertEqual(emails, ["beta.emp@example.com"])
