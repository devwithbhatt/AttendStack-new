import base64
import io
import hashlib
import logging
import secrets
import string
from datetime import timedelta
import jwt
import pyotp
import qrcode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import PasswordResetOTP, UserTwoFactor, TwoFactorOTP

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


# ──────────────────────────────────────────────────────────────────────────────
# Two-Factor Authentication (2FA) Services
# ──────────────────────────────────────────────────────────────────────────────

def mask_email(email: str) -> str:
    """Mask email for 2FA challenge hints, e.g., 'a***n@company.com'."""
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"


def generate_2fa_secret() -> str:
    """Generate cryptographically secure RFC 6238 Base32 TOTP secret."""
    return pyotp.random_base32()


def generate_backup_codes(count: int = 10):
    """
    Generate readable one-time backup recovery codes (format: XXXX-XXXX)
    and their SHA-256 hashed structures for storage.
    Returns (plain_codes: list[str], hashed_records: list[dict])
    """
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # Exclude easily confused chars (0, 1, O, I)
    plain_codes = []
    hashed_records = []
    now_iso = timezone.now().isoformat()

    for _ in range(count):
        part1 = "".join(secrets.choice(chars) for _ in range(4))
        part2 = "".join(secrets.choice(chars) for _ in range(4))
        code = f"{part1}-{part2}"
        plain_codes.append(code)

        cleaned = code.replace("-", "").strip().upper()
        code_hash = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        hashed_records.append({
            "code_hash": code_hash,
            "used": False,
            "used_at": None,
            "created_at": now_iso,
        })

    return plain_codes, hashed_records


def generate_totp_qr_data_uri(user, secret: str) -> str:
    """
    Generate standard otpauth:// URI and return Base64 PNG data URI.
    Works natively with Google Authenticator, Microsoft Authenticator, Authy, etc.
    """
    issuer = "AttendStack"
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user.email, issuer_name=issuer)

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(provisioning_uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64_img = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_img}"


def verify_totp_code(secret: str, code: str) -> bool:
    """
    Verify 6-digit TOTP code against secret.
    Allows valid_window=1 (clock drift tolerance of ±30 seconds).
    """
    if not secret or not code:
        return False
    cleaned_code = str(code).strip().replace(" ", "")
    if len(cleaned_code) != 6 or not cleaned_code.isdigit():
        return False
    totp = pyotp.TOTP(secret)
    return bool(totp.verify(cleaned_code, valid_window=1))


def verify_and_burn_backup_code(user_2fa: UserTwoFactor, code: str) -> bool:
    """
    Verify a one-time backup recovery code and mark it as burned/used.
    """
    if not user_2fa or not code or not user_2fa.backup_codes:
        return False

    cleaned = str(code).replace("-", "").replace(" ", "").strip().upper()
    target_hash = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()

    updated = False
    with transaction.atomic():
        obj = UserTwoFactor.objects.select_for_update().get(pk=user_2fa.pk)
        codes_list = list(obj.backup_codes)
        for item in codes_list:
            if item.get("code_hash") == target_hash and not item.get("used", False):
                item["used"] = True
                item["used_at"] = timezone.now().isoformat()
                updated = True
                break

        if updated:
            obj.backup_codes = codes_list
            obj.last_used_at = timezone.now()
            obj.save(update_fields=["backup_codes", "last_used_at", "updated_at"])
            return True

    return False


def generate_2fa_preauth_token(user) -> str:
    """
    Issue short-lived signed JWT token (valid for 5 mins) to bridge
    primary password auth and 2FA verification.
    """
    payload = {
        "user_id": str(user.id),
        "email": user.email,
        "type": "2fa_pre_auth",
        "exp": timezone.now() + timedelta(minutes=5),
        "iat": timezone.now(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_2fa_preauth_token(token_str: str):
    """
    Validate and decode interim 2FA pre-auth token, returning the User object.
    """
    try:
        payload = jwt.decode(token_str, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "2fa_pre_auth":
            raise ValidationError({"temp_token": "Invalid 2FA challenge token."})
        user_id = payload.get("user_id")
        user = User.objects.filter(id=user_id, is_active=True).first()
        if not user:
            raise ValidationError({"temp_token": "User account is inactive or not found."})
        return user
    except jwt.ExpiredSignatureError:
        raise ValidationError({"temp_token": "2FA session expired. Please log in again."})
    except (jwt.InvalidTokenError, Exception) as e:
        logger.warning("Failed to decode 2FA token: %s", str(e))
        raise ValidationError({"temp_token": "Invalid 2FA challenge token. Please log in again."})


def send_2fa_email_otp(user, requested_ip: str = None) -> str:
    """
    Generate and send 6-digit email OTP for 2FA challenge fallback.
    """
    now = timezone.now()
    resend_after = now - timedelta(seconds=30)
    hourly_window = now - timedelta(hours=1)

    with transaction.atomic():
        requests = TwoFactorOTP.objects.select_for_update().filter(user=user)
        if requests.filter(created_at__gte=resend_after).exists():
            return "A verification code was recently sent. Please check your inbox or wait 30 seconds."
        if requests.filter(created_at__gte=hourly_window).count() >= 10:
            return "Too many OTP requests. Please wait or use your Authenticator app / backup code."

        # Invalidate old unused OTPs
        requests.filter(is_used=False).update(is_used=True, used_at=now)

        otp = f"{secrets.randbelow(1_000_000):06d}"
        TwoFactorOTP.objects.create(
            user=user,
            otp_hash=make_password(otp),
            expires_at=now + timedelta(minutes=5),
            requested_ip=requested_ip,
        )

    # Send email
    subject = "[AttendStack Security] Two-Factor Verification Code"
    support_email = getattr(settings, "PASSWORD_RESET_SUPPORT_EMAIL", None)
    text_content = (
        f"Hello {user.get_short_name() or 'there'},\n\n"
        f"Your AttendStack 2FA verification code is:\n\n"
        f"    {otp}\n\n"
        f"This code will expire in 5 minutes.\n"
        f"If you did not request this code, please immediately check your account security.\n\n"
        f"- The AttendStack Security Team"
    )
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">AttendStack Security Code</h2>
        <p style="color: #475569; font-size: 15px;">Hello {user.get_short_name() or 'there'},</p>
        <p style="color: #475569; font-size: 15px;">Use the following 6-digit verification code to complete your two-factor login:</p>
        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b; font-family: monospace;">{otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This code is valid for <strong>5 minutes</strong>. Never share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you did not attempt to sign in, your password may be known to someone else. Please change it immediately.</p>
    </div>
    """
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
        reply_to=[support_email] if support_email else None,
    )
    message.attach_alternative(html_content, "text/html")
    try:
        message.send(fail_silently=False)
    except Exception as e:
        logger.exception("Failed to dispatch 2FA email OTP: %s", str(e))
        # Do not block completely if email fails in local testing, but log
    return "Verification code has been sent to your email address."


def verify_2fa_email_otp(user, otp: str) -> bool:
    """
    Validate 6-digit email OTP for 2FA login challenge.
    """
    now = timezone.now()
    with transaction.atomic():
        record = (
            TwoFactorOTP.objects.select_for_update()
            .filter(user=user, is_used=False)
            .order_by("-created_at")
            .first()
        )
        if record is None or record.expires_at <= now:
            if record is not None:
                record.is_used = True
                record.used_at = now
                record.save(update_fields=["is_used", "used_at"])
            return False

        if record.attempts >= 5:
            record.is_used = True
            record.used_at = now
            record.save(update_fields=["is_used", "used_at"])
            return False

        if not check_password(str(otp).strip(), record.otp_hash):
            record.attempts += 1
            if record.attempts >= 5:
                record.is_used = True
                record.used_at = now
            record.save(update_fields=["attempts", "is_used", "used_at"])
            return False

        record.is_used = True
        record.used_at = now
        record.save(update_fields=["is_used", "used_at"])
        return True
