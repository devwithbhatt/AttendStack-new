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

