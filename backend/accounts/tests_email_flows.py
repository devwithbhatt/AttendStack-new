"""Every outbound email: sent from the noreply address, with replies going to
a mailbox that can actually receive them, and the codes inside still obeying
expiry / one-time use / cooldown / attempt limits. Uses Django's in-memory
outbox — nothing is really sent."""
import re
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import LoginTwoFactorOTP, PasswordResetOTP, UserRole
from accounts.services import (
    request_login_otp,
    request_password_reset_otp,
    reset_password_with_otp,
    send_company_admin_welcome_email,
    send_employee_registration_confirmation_email,
    send_employee_welcome_email,
    send_purchase_thank_you_email,
    verify_login_otp,
)
from employees.models import Employee
from organizations.models import Organization

User = get_user_model()

SENDER = "AttendStack <noreply@bhattsquare.com>"
SUPPORT = "support@bhattsquare.com"


def otp_in(message):
    match = re.search(r"\b(\d{6})\b", message.body)
    assert match, "no 6-digit code in the email body"
    return match.group(1)


@override_settings(
    DEFAULT_FROM_EMAIL=SENDER,
    PASSWORD_RESET_SUPPORT_EMAIL=SUPPORT,
    SALES_TEAM_EMAIL="onboarding@bhattsquare.com",
    FRONTEND_BASE_URL="https://attendance.example.test",
)
class EmailFlowTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="owner@flows.test", password="StrongPass123!", role=UserRole.HR, first_name="Olive")
        self.org = Organization.objects.create(name="Flow Co", owner=self.admin)
        self.employee = Employee.objects.create(
            organization=self.org, employee_id="FL-001", full_name="Eva Flow", email="eva@flows.test",
            phone="9876543210", aadhaar_number="777788889991", department="Ops", designation="Analyst",
            annual_salary=120000, joining_date=date(2026, 1, 1),
        )
        self.emp_user = User.objects.create_user(email="eva@flows.test", password="StrongPass123!", employee_id="FL-001", first_name="Eva")
        mail.outbox = []

    def assert_headers(self, message, to):
        self.assertEqual(message.from_email, SENDER)
        self.assertEqual(message.reply_to, [SUPPORT])
        self.assertEqual(message.to, [to])
        # The footer points people at the real support inbox, never noreply@.
        self.assertIn(SUPPORT, message.body)
        self.assertNotIn("noreply@bhattsquare.com", message.body)

    # ---- 1. Login 2FA code ----
    def test_login_otp_email_and_code_rules(self):
        request_login_otp(self.admin, requested_ip="203.0.113.7")
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assert_headers(msg, "owner@flows.test")
        self.assertIn("sign-in verification code", msg.subject)
        code = otp_in(msg)
        self.assertEqual(len(code), 6)
        stored = LoginTwoFactorOTP.objects.get(user=self.admin)
        self.assertNotEqual(stored.otp_hash, code)  # stored hashed, never plain
        with self.assertRaises(ValidationError):
            verify_login_otp("owner@flows.test", "000000" if code != "000000" else "111111")
        self.assertEqual(verify_login_otp("owner@flows.test", code), self.admin)
        with self.assertRaises(ValidationError):  # one-time use
            verify_login_otp("owner@flows.test", code)

    def test_login_otp_resend_cooldown(self):
        request_login_otp(self.admin)
        # A "Resend code" inside the cooldown is silently ignored (no error
        # that could leak timing) — and crucially, no second email.
        request_login_otp(self.admin, enforce_resend_cooldown=True)
        self.assertEqual(len(mail.outbox), 1)

    def test_login_otp_expires(self):
        request_login_otp(self.admin)
        code = otp_in(mail.outbox[0])
        LoginTwoFactorOTP.objects.filter(user=self.admin).update(expires_at=timezone.now() - timedelta(seconds=1))
        with self.assertRaises(ValidationError):
            verify_login_otp("owner@flows.test", code)

    # ---- 2. Password reset code ----
    def test_password_reset_email_and_code_rules(self):
        request_password_reset_otp("eva@flows.test", requested_ip="203.0.113.7")
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assert_headers(msg, "eva@flows.test")
        self.assertIn("Password reset", msg.subject)
        code = otp_in(msg)
        self.assertNotEqual(PasswordResetOTP.objects.get(user=self.emp_user).otp_hash, code)
        with self.assertRaises(ValidationError):
            reset_password_with_otp("eva@flows.test", "000000" if code != "000000" else "111111", "NewPass!2345")
        reset_password_with_otp("eva@flows.test", code, "NewPass!2345")
        self.emp_user.refresh_from_db()
        self.assertTrue(self.emp_user.check_password("NewPass!2345"))
        with self.assertRaises(ValidationError):  # one-time use
            reset_password_with_otp("eva@flows.test", code, "Another!2345")

    def test_password_reset_cooldown_and_unknown_email(self):
        request_password_reset_otp("eva@flows.test")
        request_password_reset_otp("eva@flows.test")  # inside the resend window
        request_password_reset_otp("nobody@flows.test")  # unknown: no email, same reply
        self.assertEqual(len(mail.outbox), 1)

    def test_password_reset_attempt_limit(self):
        from django.conf import settings

        request_password_reset_otp("eva@flows.test")
        code = otp_in(mail.outbox[0])
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS):
            with self.assertRaises(ValidationError):
                reset_password_with_otp("eva@flows.test", wrong, "NewPass!2345")
        with self.assertRaises(ValidationError):  # locked even with the right code
            reset_password_with_otp("eva@flows.test", code, "NewPass!2345")

    # ---- 3–6. Welcome / confirmation / purchase ----
    def test_company_admin_welcome(self):
        send_company_admin_welcome_email(self.admin, self.org)
        msg = mail.outbox[0]
        self.assert_headers(msg, "owner@flows.test")
        self.assertIn("https://attendance.example.test", msg.body)

    def test_employee_welcome(self):
        send_employee_welcome_email(self.emp_user, self.employee, self.org)
        msg = mail.outbox[0]
        self.assert_headers(msg, "eva@flows.test")
        self.assertIn("Flow Co", msg.subject)
        self.assertIn("https://attendance.example.test", msg.body)

    def test_employee_registration_confirmation(self):
        send_employee_registration_confirmation_email(self.emp_user, self.employee, self.org)
        self.assert_headers(mail.outbox[0], "eva@flows.test")

    def test_purchase_thank_you(self):
        send_purchase_thank_you_email(self.admin, self.org)
        self.assert_headers(mail.outbox[0], "owner@flows.test")

    def test_no_email_contains_a_password(self):
        send_employee_welcome_email(self.emp_user, self.employee, self.org)
        send_company_admin_welcome_email(self.admin, self.org)
        for msg in mail.outbox:
            self.assertNotIn("StrongPass123!", msg.body)

    # ---- 7. Sales enquiry (internal) ----
    def test_sales_enquiry_reply_goes_to_the_prospect(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        res = client.post("/api/v1/sales-leads/", {
            "plan_name": "Enterprise", "full_name": "Pat Prospect", "company_email": "pat@prospect.example",
            "company_name": "Prospect Ltd", "website": "", "job_title": "CTO", "phone": "", "message": "Hi",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        msg = mail.outbox[0]
        self.assertEqual(msg.from_email, SENDER)
        self.assertEqual(msg.to, ["onboarding@bhattsquare.com"])
        self.assertEqual(msg.reply_to, ["pat@prospect.example"])
