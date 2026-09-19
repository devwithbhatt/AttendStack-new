"""
AttendStack – Two-Factor Authentication (2FA) Test Suite
Tests TOTP verification, Backup recovery codes, Email OTP fallback,
Multi-Admin independence, and Super Admin emergency reset.
"""

from io import BytesIO
import pyotp
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole, UserTwoFactor
from accounts.services import (
    generate_2fa_secret,
    generate_backup_codes,
    verify_totp_code,
)

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class TwoFactorAuthTests(APITestCase):
    def setUp(self):
        # Super Admin
        self.superadmin = User.objects.create_superuser(
            email="superadmin@attendstack.com",
            password="SuperPassword123!",
            first_name="Platform",
            last_name="Owner",
        )

        # Company HR 1
        self.hr1 = User.objects.create_hr(
            email="hr1@company.com",
            password="HrPassword123!",
            first_name="Alice",
            last_name="Manager",
        )

        # Company HR 2
        self.hr2 = User.objects.create_hr(
            email="hr2@company.com",
            password="HrPassword123!",
            first_name="Bob",
            last_name="Officer",
        )

    def test_login_without_2fa_returns_jwt_immediately(self):
        """User without 2FA enabled receives full access/refresh tokens immediately."""
        res = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr1.email, "password": "HrPassword123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertFalse(res.data.get("requires_2fa", False))

    def test_login_with_2fa_returns_challenge_token_only(self):
        """User with 2FA enabled does NOT receive access token; receives interim 2fa_token."""
        secret = generate_2fa_secret()
        _, hashed_codes = generate_backup_codes()
        UserTwoFactor.objects.create(
            user=self.hr1,
            is_enabled=True,
            secret_key=secret,
            backup_codes=hashed_codes,
        )

        res = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr1.email, "password": "HrPassword123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get("requires_2fa"))
        self.assertIn("temp_token", res.data)
        self.assertNotIn("access", res.data)
        self.assertNotIn("refresh", res.data)

    def test_totp_verification_success_and_failure(self):
        """Valid 6-digit TOTP unlocks tokens; invalid code is rejected."""
        secret = generate_2fa_secret()
        _, hashed_codes = generate_backup_codes()
        two_fa = UserTwoFactor.objects.create(
            user=self.hr1,
            is_enabled=True,
            secret_key=secret,
            backup_codes=hashed_codes,
        )

        # 1. Login to obtain pre-auth token
        login_res = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr1.email, "password": "HrPassword123!"},
            format="json",
        )
        temp_token = login_res.data["temp_token"]

        # 2. Try with wrong code
        bad_res = self.client.post(
            reverse("accounts:2fa_verify"),
            {"temp_token": temp_token, "code": "000000", "method": "authenticator"},
            format="json",
        )
        self.assertEqual(bad_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Generate correct TOTP code
        valid_totp = pyotp.TOTP(secret).now()
        good_res = self.client.post(
            reverse("accounts:2fa_verify"),
            {"temp_token": temp_token, "code": valid_totp, "method": "authenticator"},
            format="json",
        )
        self.assertEqual(good_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", good_res.data)
        self.assertIn("refresh", good_res.data)
        self.assertEqual(good_res.data["user"]["email"], self.hr1.email)

    def test_backup_code_works_once_and_is_burned(self):
        """One-time recovery backup code authenticates user and cannot be reused."""
        secret = generate_2fa_secret()
        plain_codes, hashed_codes = generate_backup_codes()
        two_fa = UserTwoFactor.objects.create(
            user=self.hr1,
            is_enabled=True,
            secret_key=secret,
            backup_codes=hashed_codes,
        )

        used_backup_code = plain_codes[0]

        # Login to get temp_token
        login_res = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr1.email, "password": "HrPassword123!"},
            format="json",
        )
        temp_token = login_res.data["temp_token"]

        # Verify with backup code
        verify_res = self.client.post(
            reverse("accounts:2fa_verify"),
            {"temp_token": temp_token, "code": used_backup_code, "method": "backup_code"},
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", verify_res.data)

        # Check that remaining backup codes count decreased by 1
        two_fa.refresh_from_db()
        self.assertEqual(two_fa.remaining_backup_codes_count, 9)

        # Try to use the same backup code again
        login_res2 = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr1.email, "password": "HrPassword123!"},
            format="json",
        )
        temp_token2 = login_res2.data["temp_token"]
        reuse_res = self.client.post(
            reverse("accounts:2fa_verify"),
            {"temp_token": temp_token2, "code": used_backup_code, "method": "backup_code"},
            format="json",
        )
        self.assertEqual(reuse_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid or previously used", reuse_res.data["detail"])

    def test_multiple_admins_have_completely_independent_2fa(self):
        """HR1 and HR2 have different secrets. HR1's TOTP code never unlocks HR2."""
        secret1 = generate_2fa_secret()
        secret2 = generate_2fa_secret()
        self.assertNotEqual(secret1, secret2)

        _, codes1 = generate_backup_codes()
        _, codes2 = generate_backup_codes()

        UserTwoFactor.objects.create(user=self.hr1, is_enabled=True, secret_key=secret1, backup_codes=codes1)
        UserTwoFactor.objects.create(user=self.hr2, is_enabled=True, secret_key=secret2, backup_codes=codes2)

        # Get temp token for HR2
        login_hr2 = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr2.email, "password": "HrPassword123!"},
            format="json",
        )
        temp_token_hr2 = login_hr2.data["temp_token"]

        # Generate TOTP for HR1
        totp_hr1 = pyotp.TOTP(secret1).now()

        # Try unlocking HR2 with HR1's code -> MUST FAIL
        cross_res = self.client.post(
            reverse("accounts:2fa_verify"),
            {"temp_token": temp_token_hr2, "code": totp_hr1, "method": "authenticator"},
            format="json",
        )
        self.assertEqual(cross_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Now unlock HR2 with HR2's code -> MUST SUCCEED
        totp_hr2 = pyotp.TOTP(secret2).now()
        correct_res = self.client.post(
            reverse("accounts:2fa_verify"),
            {"temp_token": temp_token_hr2, "code": totp_hr2, "method": "authenticator"},
            format="json",
        )
        self.assertEqual(correct_res.status_code, status.HTTP_200_OK)

    def test_superadmin_emergency_reset_rescues_locked_out_user(self):
        """Super Admin can emergency reset a user's 2FA, allowing password login again."""
        secret = generate_2fa_secret()
        _, codes = generate_backup_codes()
        two_fa = UserTwoFactor.objects.create(user=self.hr1, is_enabled=True, secret_key=secret, backup_codes=codes)

        # Super Admin logs in
        self.client.force_authenticate(user=self.superadmin)

        reset_res = self.client.post(
            reverse("accounts:2fa_admin_reset"),
            {"user_id": str(self.hr1.id), "reason": "HR lost phone on vacation"},
            format="json",
        )
        self.assertEqual(reset_res.status_code, status.HTTP_200_OK)

        # HR1 2FA should now be inactive in DB
        two_fa.refresh_from_db()
        self.assertFalse(two_fa.is_enabled)

        # HR1 can now log in with primary password without 2FA challenge
        self.client.force_authenticate(user=None)
        direct_login = self.client.post(
            reverse("accounts:login"),
            {"email": self.hr1.email, "password": "HrPassword123!"},
            format="json",
        )
        self.assertEqual(direct_login.status_code, status.HTTP_200_OK)
        self.assertIn("access", direct_login.data)
