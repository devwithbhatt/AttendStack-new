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

from .models import PasswordResetOTP

logger = logging.getLogger(__name__)
User = get_user_model()

RESET_CODE_SENT_MESSAGE = "A verification code has been sent to your email address."
ACCOUNT_NOT_FOUND_MESSAGE = "No active account was found with this email address."
INVALID_OTP_MESSAGE = "The verification code is invalid or has expired."
EMAIL_DELIVERY_FAILED_MESSAGE = (
    "We could not send the verification code right now. Please try again shortly."
)


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
        subject="[AttendStack Security] Password reset verification code",
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
    now = timezone.now()

    with transaction.atomic():
        user = User.objects.select_for_update().filter(
            email__iexact=email.strip(),
            is_active=True,
        ).first()
        if user is None:
            raise ValidationError({"otp": INVALID_OTP_MESSAGE})

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
            raise ValidationError({"otp": INVALID_OTP_MESSAGE})

        if reset_request.attempts >= settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS:
            reset_request.is_used = True
            reset_request.used_at = now
            reset_request.save(update_fields=["is_used", "used_at"])
            raise ValidationError({"otp": INVALID_OTP_MESSAGE})

        if not check_password(otp, reset_request.otp_hash):
            reset_request.attempts += 1
            if reset_request.attempts >= settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS:
                reset_request.is_used = True
                reset_request.used_at = now
            reset_request.save(update_fields=["attempts", "is_used", "used_at"])
            raise ValidationError({"otp": INVALID_OTP_MESSAGE})

        user.set_password(new_password)
        user.save(update_fields=["password"])
        PasswordResetOTP.objects.filter(user=user, is_used=False).update(
            is_used=True,
            used_at=now,
        )

    return user
