import re
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

from .models import PasswordResetOTP
from .models import UserRole
from employees.models import Employee
from organizations.models import Organization


class DjangoAdminAccessTests(APITestCase):
    """
    /admin/ must be reachable only by the one authorized Super Admin email,
    enforced server-side via AdminSite.has_permission — not merely by hiding
    the link. is_staff / is_superuser / role=SUPER_ADMIN alone must NOT be
    enough if the email doesn't match.
    """

    def _make_superuser(self, email):
        return get_user_model().objects.create_superuser(
            email=email,
            password="StrongPass123!",
            first_name="Test",
            last_name="Admin",
        )

    def test_authorized_super_admin_email_can_access_admin_index(self):
        user = self._make_superuser("bhattsquare1@gmail.com")
        self.client.force_login(user)

        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_other_full_privilege_accounts_are_denied_admin_access(self):
        for email in (
            "aman.bhattsquare@gmail.com",
            "bhattsquarte1@gmail.com",
        ):
            with self.subTest(email=email):
                user = self._make_superuser(email)
                self.client.force_login(user)

                response = self.client.get(reverse("admin:index"))

                self.assertEqual(response.status_code, status.HTTP_302_FOUND)
                self.assertIn(reverse("admin:login"), response.url)
                self.client.logout()

    def test_email_match_is_case_insensitive(self):
        user = self._make_superuser("BhattSquare1@Gmail.com")
        self.client.force_login(user)

        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PASSWORD_RESET_OTP_RESEND_SECONDS=0,
)
class PasswordResetOTPTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="employee@example.com",
            password="OldStrongPassword123!",
            first_name="Test",
            last_name="Employee",
        )

    def request_code(self):
        return self.client.post(
            reverse("accounts:password_reset_request"),
            {"email": self.user.email},
            format="json",
        )

    def get_code(self):
        return re.search(r"\b\d{6}\b", mail.outbox[-1].body).group(0)

    def test_request_sends_code_for_existing_active_account(self):
        response = self.request_code()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            response.data["detail"],
            "A verification code has been sent to your email address.",
        )
        self.assertEqual(
            mail.outbox[0].subject,
            "[AttendStack Security] Password reset verification code",
        )
        self.assertIn("AttendStack Security Team", mail.outbox[0].body)
        self.assertIn("IP address:", mail.outbox[0].body)
        self.assertIn("never share this code", mail.outbox[0].body)
        self.assertEqual(len(mail.outbox[0].alternatives), 1)
        self.assertEqual(mail.outbox[0].alternatives[0].mimetype, "text/html")
        self.assertIn("Security notification", mail.outbox[0].alternatives[0].content)
        self.assertEqual(PasswordResetOTP.objects.filter(user=self.user).count(), 1)

    def test_unknown_email_returns_account_not_found_error(self):
        response = self.client.post(
            reverse("accounts:password_reset_request"),
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["email"][0],
            "No active account was found with this email address.",
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_inactive_account_returns_account_not_found_error(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.request_code()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(len(mail.outbox), 0)

    @patch("accounts.services._send_password_reset_email")
    def test_email_delivery_failure_returns_error_and_invalidates_code(self, send_email):
        send_email.side_effect = OSError("SMTP unavailable")

        response = self.request_code()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("could not send", response.data["email"][0])
        self.assertTrue(PasswordResetOTP.objects.get(user=self.user).is_used)

    def test_valid_code_resets_password_and_cannot_be_reused(self):
        self.request_code()
        payload = {
            "email": self.user.email,
            "otp": self.get_code(),
            "new_password": "NewStrongPassword456!",
            "confirm_password": "NewStrongPassword456!",
        }

        response = self.client.post(
            reverse("accounts:password_reset_confirm"),
            payload,
            format="json",
        )
        reused_response = self.client.post(
            reverse("accounts:password_reset_confirm"),
            payload,
            format="json",
        )

        self.user.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.check_password(payload["new_password"]))
        self.assertEqual(reused_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_passwords_must_match(self):
        response = self.client.post(
            reverse("accounts:password_reset_confirm"),
            {
                "email": self.user.email,
                "otp": "123456",
                "new_password": "NewStrongPassword456!",
                "confirm_password": "DifferentStrongPassword789!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)


class PublicOnboardingTests(APITestCase):
    def test_organization_owner_can_create_a_workspace_and_employee_can_join_with_its_code(self):
        organization_response = self.client.post(
            reverse("accounts:register_organization"),
            {
                "organization_name": "Northstar Labs",
                "full_name": "Maya Singh",
                "email": "maya@northstar.example",
                "phone": "9876543210",
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(organization_response.status_code, status.HTTP_201_CREATED, organization_response.data)
        invite_code = organization_response.data["organization"]["invite_code"]
        organization = Organization.objects.get(name="Northstar Labs")
        self.assertTrue(invite_code.startswith("ORG-"))
        self.assertEqual(organization.owner.role, UserRole.HR)
        self.assertTrue(Employee.objects.filter(email="maya@northstar.example").exists())

        employee_response = self.client.post(
            reverse("accounts:register_employee"),
            {
                "organization_code": invite_code,
                "full_name": "Arjun Patel",
                "email": "arjun@northstar.example",
                "phone": "9876543211",
                "address": "Pune, Maharashtra",
                "password": "StrongPass456!",
                "confirm_password": "StrongPass456!",
            },
            format="json",
        )

        self.assertEqual(employee_response.status_code, status.HTTP_201_CREATED)
        employee = Employee.objects.get(email="arjun@northstar.example")
        self.assertEqual(employee.organization, organization)
        self.assertIsNone(employee.annual_salary)
        user = get_user_model().objects.get(email=employee.email)
        self.assertEqual(user.role, UserRole.EMPLOYEE)
        self.assertEqual(user.employee_id, employee.employee_id)

    def test_employee_registration_rejects_an_invalid_organization_code(self):
        response = self.client.post(
            reverse("accounts:register_employee"),
            {
                "organization_code": "ORG-NOTVALID",
                "full_name": "Arjun Patel",
                "email": "arjun@example.com",
                "phone": "9876543211",
                "password": "StrongPass456!",
                "confirm_password": "StrongPass456!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("organization_code", response.data)

    def test_organization_code_lookup_returns_the_active_company_name(self):
        organization = Organization.objects.create(name="Northstar Labs")

        response = self.client.get(
            reverse("accounts:organization_code_lookup"),
            {"code": organization.invite_code.lower()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"organization_name": "Northstar Labs"})

    def test_organization_code_lookup_does_not_return_an_inactive_company(self):
        organization = Organization.objects.create(name="Inactive Labs", is_active=False)

        response = self.client.get(
            reverse("accounts:organization_code_lookup"),
            {"code": organization.invite_code},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hr_can_create_a_company_workspace_and_receive_an_onboarding_code(self):
        hr = get_user_model().objects.create_hr(
            email="owner@example.com",
            password="StrongPass123!",
            first_name="Maya",
            last_name="Singh",
        )
        self.client.force_authenticate(hr)

        response = self.client.post(
            "/api/v1/organizations/",
            {"name": "Northstar Labs"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["name"], "Northstar Labs")
        self.assertTrue(response.data["invite_code"].startswith("ORG-"))
        self.assertTrue(response.data["can_manage_invite_code"])

    def test_employee_registration_accepts_a_professional_profile_photo(self):
        organization = Organization.objects.create(name="Northstar Labs")
        photo_buffer = BytesIO()
        Image.new("RGB", (16, 16), color="white").save(photo_buffer, format="PNG")
        photo = SimpleUploadedFile(
            "headshot.png",
            photo_buffer.getvalue(),
            content_type="image/png",
        )
        aadhaar_document = SimpleUploadedFile("aadhaar.pdf", b"Aadhaar document", content_type="application/pdf")
        pan_card_document = SimpleUploadedFile("pan-card.pdf", b"PAN card document", content_type="application/pdf")
        cv_document = SimpleUploadedFile("resume.pdf", b"CV document", content_type="application/pdf")

        response = self.client.post(
            reverse("accounts:register_employee"),
            {
                "organization_code": organization.invite_code,
                "full_name": "Arjun Patel",
                "email": "arjun.photo@example.com",
                "phone": "9876543211",
                "password": "StrongPass456!",
                "confirm_password": "StrongPass456!",
                "profile_photo": photo,
                "aadhaar_number": "123456789012",
                "bank_name": "Example Bank",
                "bank_account_number": "1234567890123456",
                "ifsc_code": "HDFC0001234",
                "tax_id": "AABCP1234C",
                "aadhaar_document": aadhaar_document,
                "pan_card_document": pan_card_document,
                "cv_document": cv_document,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        employee = Employee.objects.get(email="arjun.photo@example.com")
        self.assertTrue(employee.profile_photo.name.startswith("employees/photos/headshot"))
        self.assertEqual(employee.aadhaar_number, "123456789012")
        self.assertEqual(employee.bank_name, "Example Bank")
        self.assertEqual(employee.ifsc_code, "HDFC0001234")
        self.assertEqual(employee.tax_id, "AABCP1234C")
        self.assertTrue(employee.aadhaar_document.name.startswith("employees/aadhaar/aadhaar"))
        self.assertTrue(employee.pan_card_document.name.startswith("employees/pan/pan-card"))
        self.assertTrue(employee.cv_document.name.startswith("employees/cv/resume"))


from accounts.models import SubAdminPermission, UserRole


class SubAdminManagementAPITests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_hr(
            email="org_owner@example.com",
            password="StrongPass123!",
            first_name="Owner",
            last_name="Admin",
        )
        self.organization = Organization.objects.create(name="Apex Enterprise", owner=self.owner)
        self.sub_admin_user = get_user_model().objects.create_sub_admin(
            email="subadmin.test@example.com",
            password="InitialPass123!",
            first_name="Lead",
            last_name="Manager",
        )
        self.sub_admin_perm = SubAdminPermission.objects.create(
            user=self.sub_admin_user,
            organization=self.organization,
            custom_role_title="Operations Lead",
        )
        self.client.force_authenticate(self.owner)

    def test_reset_password_auto_generates_temp_password(self):
        response = self.client.post(
            f"/api/v1/accounts/sub-admins/{self.sub_admin_perm.id}/reset-password/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("temp_password", response.data)
        self.assertTrue(len(response.data["temp_password"]) >= 8)

    def test_reset_password_with_custom_password(self):
        response = self.client.post(
            f"/api/v1/accounts/sub-admins/{self.sub_admin_perm.id}/reset-password/",
            {"password": "NewSecretPass789!"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["temp_password"], "NewSecretPass789!")
        self.sub_admin_user.refresh_from_db()
        self.assertTrue(self.sub_admin_user.check_password("NewSecretPass789!"))

    def test_toggle_status_locks_and_unlocks_account(self):
        # Lock account
        response = self.client.post(
            f"/api/v1/accounts/sub-admins/{self.sub_admin_perm.id}/toggle-status/",
            {"is_active": False},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(response.data["is_active"])
        self.sub_admin_user.refresh_from_db()
        self.assertFalse(self.sub_admin_user.is_active)

        # Unlock account
        response = self.client.post(
            f"/api/v1/accounts/sub-admins/{self.sub_admin_perm.id}/toggle-status/",
            {"is_active": True},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_active"])
        self.sub_admin_user.refresh_from_db()
        self.assertTrue(self.sub_admin_user.is_active)

    def test_delete_sub_admin_permanently_removes_user_and_permission(self):
        response = self.client.delete(
            f"/api/v1/accounts/sub-admins/{self.sub_admin_perm.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(SubAdminPermission.objects.filter(id=self.sub_admin_perm.id).exists())
        self.assertFalse(get_user_model().objects.filter(id=self.sub_admin_user.id).exists())


@override_settings(SIMPLYJOB_ONBOARDING_SECRET="test-secret", EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SimplyJobAutoOnboardingTests(APITestCase):
    """A SimplyJob bundle customer jumping into AttendStack via SSO (or the public
    registration form) should get RBAC-seeded automatically and a one-time thank-you
    email, without any Super Admin manually creating the organization first."""

    def _signed_sso_payload(self, **overrides):
        import base64
        import hashlib
        import hmac
        import json
        import time

        payload = {
            "email": "bundle-owner@example.com",
            "full_name": "Bundle Owner",
            "company_name": "Bundle Co",
            "source_company_id": "sj-co-1",
            "role": "HR",
            "timestamp": int(time.time()),
        }
        payload.update(overrides)
        payload_bytes = json.dumps(payload).encode("utf-8")
        signature = hmac.new(b"test-secret", payload_bytes, hashlib.sha256).hexdigest()
        return base64.urlsafe_b64encode(payload_bytes).decode("utf-8"), signature

    def test_sso_first_jump_seeds_admin_role_and_sends_thank_you_once(self):
        payload, signature = self._signed_sso_payload()
        url = reverse("accounts:sso_login")

        first = self.client.post(url, {"payload": payload, "signature": signature}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)

        owner = get_user_model().objects.get(email="bundle-owner@example.com")
        self.assertIsNotNone(owner.custom_role_id)
        self.assertTrue(owner.custom_role.is_admin)

        organization = Organization.objects.get(external_company_id="sj-co-1")
        self.assertEqual(organization.owner_id, owner.id)

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("bundle-owner@example.com", mail.outbox[0].to)
        self.assertIn("forgot", mail.outbox[0].body.lower())

        # A second jump for the same org (e.g. re-opening the workspace) must not
        # re-seed the role or re-send the email.
        payload2, signature2 = self._signed_sso_payload()
        second = self.client.post(url, {"payload": payload2, "signature": signature2}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_sso_jump_applies_requested_plan_name_on_new_organization(self):
        payload, signature = self._signed_sso_payload(
            email="admin-granted-owner@example.com",
            source_company_id="sj-co-admin-granted",
            plan_name="Enterprise Sovereign Plan",
        )
        response = self.client.post(reverse("accounts:sso_login"), {"payload": payload, "signature": signature}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        organization = Organization.objects.get(external_company_id="sj-co-admin-granted")
        self.assertEqual(organization.plan_name, "Enterprise Sovereign Plan")

    def test_sso_jump_does_not_hijack_an_existing_attendstack_owner_into_a_new_org(self):
        existing_owner = get_user_model().objects.create_hr(
            email="already-on-attendstack@example.com",
            first_name="Already",
            last_name="Here",
        )
        existing_org = Organization.objects.create(
            name="Existing AttendStack Co",
            owner=existing_owner,
            external_company_id="some-other-source-id",
        )

        payload, signature = self._signed_sso_payload(
            email="already-on-attendstack@example.com",
            source_company_id="sj-co-different",
        )
        response = self.client.post(reverse("accounts:sso_login"), {"payload": payload, "signature": signature}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["organization"]["id"], existing_org.id)
        self.assertFalse(Organization.objects.filter(external_company_id="sj-co-different").exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_public_registration_seeds_admin_role_for_new_organization(self):
        from accounts.serializers import OrganizationRegistrationSerializer

        serializer = OrganizationRegistrationSerializer(data={
            "organization_name": "Self Registered Co",
            "full_name": "Self Registered Owner",
            "email": "self-registered@example.com",
            "phone": "9876543210",
            "password": "StrongPass!234",
            "confirm_password": "StrongPass!234",
        })
        serializer.is_valid(raise_exception=True)
        organization = serializer.save()

        owner = get_user_model().objects.get(email="self-registered@example.com")
        self.assertIsNotNone(owner.custom_role_id)
        self.assertTrue(owner.custom_role.is_admin)
        self.assertEqual(organization.owner_id, owner.id)


class OrganizationDuplicateNameMergeTests(APITestCase):
    """Covers the 'looks like an already-registered company' warning shown during
    signup, and the resulting 'Merge' path that joins the existing organization
    as a pending employee instead of creating a duplicate."""

    def setUp(self):
        self.organization = Organization.objects.create(name="Bhatt Square Private Limited")

    def test_check_name_flags_a_case_and_suffix_variant_as_a_possible_duplicate(self):
        response = self.client.get(
            reverse("accounts:check_organization_name"),
            {"name": "bhatt square"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["possible_duplicate"])
        self.assertEqual(response.data["organization_id"], self.organization.id)
        self.assertEqual(response.data["organization_name"], "Bhatt Square Private Limited")

    def test_check_name_finds_no_duplicate_for_an_unrelated_name(self):
        response = self.client.get(
            reverse("accounts:check_organization_name"),
            {"name": "Totally Different Ventures"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["possible_duplicate"])
        self.assertNotIn("organization_id", response.data)

    def test_merge_join_creates_a_pending_inactive_employee_on_the_existing_org(self):
        response = self.client.post(
            reverse("accounts:register_organization_merge"),
            {
                "organization_id": self.organization.id,
                "full_name": "Late Joiner",
                "email": "late-joiner@example.com",
                "phone": "9876543210",
                "password": "StrongPass!234",
                "confirm_password": "StrongPass!234",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        employee = Employee.objects.get(email="late-joiner@example.com")
        self.assertEqual(employee.organization_id, self.organization.id)
        self.assertEqual(employee.status, "INACTIVE")
        self.assertTrue(get_user_model().objects.filter(email="late-joiner@example.com").exists())
        # No second Organization was created for this name.
        self.assertEqual(Organization.objects.filter(name__icontains="Bhatt Square").count(), 1)

    def test_merge_join_rejects_an_inactive_organization(self):
        self.organization.is_active = False
        self.organization.save(update_fields=["is_active"])

        response = self.client.post(
            reverse("accounts:register_organization_merge"),
            {
                "organization_id": self.organization.id,
                "full_name": "Late Joiner",
                "email": "late-joiner2@example.com",
                "phone": "9876543210",
                "password": "StrongPass!234",
                "confirm_password": "StrongPass!234",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("organization_id", response.data)

    def test_pending_merged_employee_cannot_sign_in_until_activated(self):
        self.client.post(
            reverse("accounts:register_organization_merge"),
            {
                "organization_id": self.organization.id,
                "full_name": "Late Joiner",
                "email": "late-joiner3@example.com",
                "phone": "9876543210",
                "password": "StrongPass!234",
                "confirm_password": "StrongPass!234",
            },
            format="json",
        )

        blocked_response = self.client.post(
            reverse("accounts:login"),
            {"email": "late-joiner3@example.com", "password": "StrongPass!234"},
            format="json",
        )
        self.assertEqual(blocked_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("pending approval", str(blocked_response.data))

        employee = Employee.objects.get(email="late-joiner3@example.com")
        employee.status = "ACTIVE"
        employee.save(update_fields=["status"])

        allowed_response = self.client.post(
            reverse("accounts:login"),
            {"email": "late-joiner3@example.com", "password": "StrongPass!234"},
            format="json",
        )
        self.assertEqual(allowed_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", allowed_response.data)

    def test_terminated_employee_cannot_sign_in(self):
        employee = Employee.objects.create(
            organization=self.organization,
            full_name="Former Employee",
            email="former-employee@example.com",
            phone="9876543211",
            status="TERMINATED",
        )
        get_user_model().objects.create_user(
            email=employee.email,
            password="StrongPass!234",
            first_name="Former",
            last_name="Employee",
            employee_id=employee.employee_id,
        )

        response = self.client.post(
            reverse("accounts:login"),
            {"email": "former-employee@example.com", "password": "StrongPass!234"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("deactivated", str(response.data))

