import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import PasswordResetOTP, LoginTwoFactorOTP

logger = logging.getLogger(__name__)
User = get_user_model()

RESET_CODE_SENT_MESSAGE = "A verification code has been sent to your email address."
ACCOUNT_NOT_FOUND_MESSAGE = "No active account was found with this email address."
INVALID_OTP_MESSAGE = "The verification code is invalid or has expired."
EMAIL_DELIVERY_FAILED_MESSAGE = (
    "We could not send the verification code right now. Please try again shortly."
)

# Login 2FA: short-lived, single-use, rate-limited.
LOGIN_2FA_OTP_TTL_MINUTES = 5
LOGIN_2FA_OTP_RESEND_SECONDS = 60
LOGIN_2FA_OTP_MAX_REQUESTS_PER_HOUR = 10
LOGIN_2FA_OTP_MAX_ATTEMPTS = 5
TWO_FA_CODE_SENT_MESSAGE = "A verification code has been sent to your email address."
INVALID_2FA_OTP_MESSAGE = "The verification code is invalid or has expired."


def _generate_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_password_reset_email(user, otp, requested_ip=None):
    support_email = settings.PASSWORD_RESET_SUPPORT_EMAIL
    context = {
        "name": user.get_short_name() or user.get_full_name() or "there",
        "otp": otp,
        "expiry_minutes": settings.PASSWORD_RESET_OTP_TTL_MINUTES,
        "requested_at": timezone.localtime().strftime("%d %b %Y, %I:%M %p %Z"),
        "requested_ip": requested_ip or "Not available",
        "support_email": support_email,
    }
    message = EmailMultiAlternatives(
        subject="[ZuperHR Security] Password reset verification code",
        body=render_to_string("accounts/password_reset_otp.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(
        render_to_string("accounts/password_reset_otp.html", context),
        "text/html",
    )
    message.send(fail_silently=False)


def request_password_reset_otp(email, requested_ip=None):
    user = User.objects.filter(email__iexact=email.strip(), is_active=True).first()
    if user is None:
        # Perform dummy work to mitigate timing attack user enumeration
        make_password(_generate_otp())
        return RESET_CODE_SENT_MESSAGE

    now = timezone.now()
    resend_after = now - timedelta(seconds=settings.PASSWORD_RESET_OTP_RESEND_SECONDS)
    hourly_window = now - timedelta(hours=1)

    with transaction.atomic():
        requests = PasswordResetOTP.objects.select_for_update().filter(user=user)
        if requests.filter(created_at__gte=resend_after).exists():
            return RESET_CODE_SENT_MESSAGE
        if requests.filter(created_at__gte=hourly_window).count() >= settings.PASSWORD_RESET_OTP_MAX_REQUESTS_PER_HOUR:
            return RESET_CODE_SENT_MESSAGE

        requests.filter(is_used=False).update(is_used=True, used_at=now)
        otp = _generate_otp()
        reset_request = PasswordResetOTP.objects.create(
            user=user,
            otp_hash=make_password(otp),
            expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_OTP_TTL_MINUTES),
            requested_ip=requested_ip,
        )

    try:
        _send_password_reset_email(user, otp, requested_ip=requested_ip)
    except Exception:
        PasswordResetOTP.objects.filter(pk=reset_request.pk).update(
            is_used=True,
            used_at=timezone.now(),
        )
        logger.exception("Unable to send password reset email.")
        raise ValidationError({"email": [EMAIL_DELIVERY_FAILED_MESSAGE]})

    return RESET_CODE_SENT_MESSAGE


def reset_password_with_otp(email, otp, new_password):
    """
    All state-changing writes (attempts increment, lockout, password change)
    happen inside a single atomic block that is allowed to COMMIT before we
    ever raise — raising from inside the same atomic() block would roll back
    the very save() that records the failed attempt, defeating the attempt
    limit.
    """
    now = timezone.now()
    failure = False
    result_user = None

    with transaction.atomic():
        user = User.objects.select_for_update().filter(
            email__iexact=email.strip(),
            is_active=True,
        ).first()
        if user is None:
            failure = True
        else:
            reset_request = (
                PasswordResetOTP.objects.select_for_update()
                .filter(user=user, is_used=False)
                .order_by("-created_at")
                .first()
            )
            if reset_request is None or reset_request.expires_at <= now:
                if reset_request is not None:
                    reset_request.is_used = True
                    reset_request.used_at = now
                    reset_request.save(update_fields=["is_used", "used_at"])
                failure = True
            elif reset_request.attempts >= settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS:
                reset_request.is_used = True
                reset_request.used_at = now
                reset_request.save(update_fields=["is_used", "used_at"])
                failure = True
            elif not check_password(otp, reset_request.otp_hash):
                reset_request.attempts += 1
                if reset_request.attempts >= settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS:
                    reset_request.is_used = True
                    reset_request.used_at = now
                reset_request.save(update_fields=["attempts", "is_used", "used_at"])
                failure = True
            else:
                user.set_password(new_password)
                user.save(update_fields=["password"])
                PasswordResetOTP.objects.filter(user=user, is_used=False).update(
                    is_used=True,
                    used_at=now,
                )
                result_user = user

    if failure:
        raise ValidationError({"otp": INVALID_OTP_MESSAGE})

    return result_user


def _send_login_2fa_email(user, otp, requested_ip=None):
    support_email = getattr(settings, "PASSWORD_RESET_SUPPORT_EMAIL", settings.DEFAULT_FROM_EMAIL)
    context = {
        "name": user.get_short_name() or user.get_full_name() or "there",
        "otp": otp,
        "expiry_minutes": LOGIN_2FA_OTP_TTL_MINUTES,
        "requested_at": timezone.localtime().strftime("%d %b %Y, %I:%M %p %Z"),
        "requested_ip": requested_ip or "Not available",
        "support_email": support_email,
    }
    message = EmailMultiAlternatives(
        subject="[ZuperHR Security] Your sign-in verification code",
        body=render_to_string("accounts/login_2fa_otp.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(
        render_to_string("accounts/login_2fa_otp.html", context),
        "text/html",
    )
    message.send(fail_silently=False)


def request_login_otp(user, requested_ip=None, enforce_resend_cooldown=False):
    """
    Send a fresh 2FA code to `user`. `user` is already password-verified by
    the caller.

    Every genuine login attempt (`enforce_resend_cooldown=False`, the
    default) always issues a brand-new code and invalidates any previous one
    — per spec, a prior *successful* login must never block the next one.
    The dedicated "Resend code" action passes `enforce_resend_cooldown=True`
    so a user mashing that button can't spam themselves (or someone else's
    inbox) with emails.

    Either way, an hourly cap still applies to prevent abuse.
    """
    now = timezone.now()
    resend_after = now - timedelta(seconds=LOGIN_2FA_OTP_RESEND_SECONDS)
    hourly_window = now - timedelta(hours=1)

    with transaction.atomic():
        requests = LoginTwoFactorOTP.objects.select_for_update().filter(user=user)
        if enforce_resend_cooldown and requests.filter(created_at__gte=resend_after, is_used=False).exists():
            return TWO_FA_CODE_SENT_MESSAGE
        if requests.filter(created_at__gte=hourly_window).count() >= LOGIN_2FA_OTP_MAX_REQUESTS_PER_HOUR:
            return TWO_FA_CODE_SENT_MESSAGE

        requests.filter(is_used=False).update(is_used=True, used_at=now)
        otp = _generate_otp()
        otp_request = LoginTwoFactorOTP.objects.create(
            user=user,
            otp_hash=make_password(otp),
            expires_at=now + timedelta(minutes=LOGIN_2FA_OTP_TTL_MINUTES),
            requested_ip=requested_ip,
        )

    try:
        _send_login_2fa_email(user, otp, requested_ip=requested_ip)
    except Exception:
        LoginTwoFactorOTP.objects.filter(pk=otp_request.pk).update(
            is_used=True,
            used_at=timezone.now(),
        )
        logger.exception("Unable to send login 2FA email.")
        raise ValidationError({"email": [EMAIL_DELIVERY_FAILED_MESSAGE]})

    return TWO_FA_CODE_SENT_MESSAGE


def verify_login_otp(email, otp):
    """Verify a login 2FA code and return the matching user on success.

    All state-changing writes (attempts increment, lockout) happen inside a
    single atomic block that is allowed to COMMIT before we ever raise —
    raising from inside the same atomic() block would roll back the very
    save() that records the failed attempt, defeating the attempt limit.
    """
    now = timezone.now()
    failure = False

    with transaction.atomic():
        user = User.objects.select_for_update().filter(
            email__iexact=email.strip(),
            is_active=True,
        ).first()
        if user is None:
            failure = True
        else:
            otp_request = (
                LoginTwoFactorOTP.objects.select_for_update()
                .filter(user=user, is_used=False)
                .order_by("-created_at")
                .first()
            )
            if otp_request is None or otp_request.expires_at <= now:
                if otp_request is not None:
                    otp_request.is_used = True
                    otp_request.used_at = now
                    otp_request.save(update_fields=["is_used", "used_at"])
                failure = True
            elif otp_request.attempts >= LOGIN_2FA_OTP_MAX_ATTEMPTS:
                otp_request.is_used = True
                otp_request.used_at = now
                otp_request.save(update_fields=["is_used", "used_at"])
                failure = True
            elif not check_password(otp, otp_request.otp_hash):
                otp_request.attempts += 1
                if otp_request.attempts >= LOGIN_2FA_OTP_MAX_ATTEMPTS:
                    otp_request.is_used = True
                    otp_request.used_at = now
                otp_request.save(update_fields=["attempts", "is_used", "used_at"])
                failure = True
            else:
                otp_request.is_used = True
                otp_request.used_at = now
                otp_request.save(update_fields=["is_used", "used_at"])

    if failure:
        raise ValidationError({"otp": INVALID_2FA_OTP_MESSAGE})

    return user


def generate_secure_temp_password() -> str:
    """
    A cryptographically random password for a freshly provisioned account
    that is never disclosed to anyone — including the account holder. They
    set their own password via the OTP-based "Forgot password" flow instead,
    so this value only needs to be strong, not memorable or communicable.
    """
    return secrets.token_urlsafe(24)


def send_company_admin_welcome_email(user, organization):
    """
    Notify a newly onboarded Company Admin that their workspace is ready.

    No password is included in this email — the account is provisioned with
    a random, never-disclosed password (see `generate_secure_temp_password`),
    and the recipient must set their own via the existing OTP-based password
    reset flow before they can sign in.
    """
    support_email = getattr(settings, "PASSWORD_RESET_SUPPORT_EMAIL", settings.DEFAULT_FROM_EMAIL)
    login_url = f"{settings.FRONTEND_BASE_URL}/admin/sign-in"
    context = {
        "name": user.get_short_name() or user.get_full_name() or "there",
        "organization_name": organization.name,
        "email": user.email,
        "login_url": login_url,
        "support_email": support_email,
    }
    message = EmailMultiAlternatives(
        subject="[ZuperHR] Your Company Admin workspace is ready",
        body=render_to_string("accounts/company_admin_welcome.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(
        render_to_string("accounts/company_admin_welcome.html", context),
        "text/html",
    )
    message.send(fail_silently=False)


def send_employee_welcome_email(user, employee, organization):
    """
    Notify a newly added employee that their ZuperHR login is ready.

    Same no-password-by-email pattern as `send_company_admin_welcome_email`:
    the account is provisioned with a random, never-disclosed password, and
    the recipient must set their own via the existing OTP-based password
    reset flow before they can sign in.
    """
    support_email = getattr(settings, "PASSWORD_RESET_SUPPORT_EMAIL", settings.DEFAULT_FROM_EMAIL)
    login_url = f"{settings.FRONTEND_BASE_URL}/sign-in"
    context = {
        "name": user.get_short_name() or user.get_full_name() or "there",
        "organization_name": organization.name if organization else "",
        "employee_id": employee.employee_id,
        "designation": employee.designation,
        "department": employee.department,
        "email": user.email,
        "login_url": login_url,
        "support_email": support_email,
    }
    message = EmailMultiAlternatives(
        subject=f"[ZuperHR] Your {organization.name if organization else 'ZuperHR'} account is ready",
        body=render_to_string("accounts/employee_welcome.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(
        render_to_string("accounts/employee_welcome.html", context),
        "text/html",
    )
    message.send(fail_silently=False)


def send_employee_registration_confirmation_email(user, employee, organization):
    """
    Confirms a *self*-registration (the employee signed up directly with an
    org invite code and chose their own password during the form) — unlike
    `send_employee_welcome_email`, there's no "set your password" step here
    since they already have one, so this is a plain confirmation.
    """
    support_email = getattr(settings, "PASSWORD_RESET_SUPPORT_EMAIL", settings.DEFAULT_FROM_EMAIL)
    login_url = f"{settings.FRONTEND_BASE_URL}/sign-in"
    context = {
        "name": user.get_short_name() or user.get_full_name() or "there",
        "organization_name": organization.name if organization else "",
        "employee_id": employee.employee_id,
        "email": user.email,
        "login_url": login_url,
        "support_email": support_email,
    }
    message = EmailMultiAlternatives(
        subject=f"[ZuperHR] Your {organization.name if organization else 'ZuperHR'} account is confirmed",
        body=render_to_string("accounts/employee_registration_confirmation.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(
        render_to_string("accounts/employee_registration_confirmation.html", context),
        "text/html",
    )
    message.send(fail_silently=False)


def send_purchase_thank_you_email(user, organization):
    """
    Confirms a bundle purchase (SimplyJob + ZuperHR) and tells the new
    Company Admin their ZuperHR workspace was auto-provisioned — no
    manual Super Admin onboarding step was needed. Same no-password,
    OTP-self-service pattern as `send_company_admin_welcome_email`.
    """
    support_email = getattr(settings, "PASSWORD_RESET_SUPPORT_EMAIL", settings.DEFAULT_FROM_EMAIL)
    login_url = f"{settings.FRONTEND_BASE_URL}/admin/sign-in"
    context = {
        "name": user.get_short_name() or user.get_full_name() or "there",
        "organization_name": organization.name,
        "email": user.email,
        "login_url": login_url,
        "support_email": support_email,
    }
    message = EmailMultiAlternatives(
        subject="[ZuperHR] Thanks for your SimplyJob + ZuperHR purchase",
        body=render_to_string("accounts/purchase_thank_you.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
        headers={"X-Auto-Response-Suppress": "All"},
    )
    message.attach_alternative(
        render_to_string("accounts/purchase_thank_you.html", context),
        "text/html",
    )
    message.send(fail_silently=False)
