"""
ZuperHR – Super Admin Live Monitoring

A platform-level monitoring flow, separate from the Company Admin Live
Monitoring in ``monitoring/`` (which this app does not touch):

* The Super Admin creates a ``PlatformMonitorAccount`` — a 5-digit User ID plus
  a generated password and passkey. Accounts belong to no company.
* The person installs the Bhatt Square Watch app and signs in with all three.
  Their computer becomes a ``PlatformMonitoredDevice`` with its own long-lived,
  individually revocable device token (only its SHA-256 hash is stored).
* Only the Super Admin can watch; every view is recorded as a
  ``PlatformMonitoringSession``.

Password and passkey are stored as Django password hashes: they are shown to
the Super Admin once, at creation or reset, and can never be read back.
"""

import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone

# Online if the agent was seen within this many seconds (it heartbeats ~20s).
PRESENCE_TTL_SECONDS = 60

# Consecutive wrong sign-ins before an account is locked, and for how long.
MAX_FAILED_SIGNINS = 5
LOCKOUT_MINUTES = 15

DEVICE_TOKEN_PREFIX = "astk_pmon_"

# No look-alike characters (0/O, 1/l/I), so credentials survive being read
# out or retyped from a message.
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_LOWER = "abcdefghijkmnpqrstuvwxyz"
_DIGITS = "23456789"
_SYMBOLS = "@#$%&*!?"


def generate_user_id() -> str:
    """Random 5-digit User ID (10000-99999, never a leading zero)."""
    return str(10000 + secrets.randbelow(90000))


def generate_password(length: int = 10) -> str:
    """Random password with at least one upper, lower, digit and symbol."""
    pools = [_UPPER, _LOWER, _DIGITS, _SYMBOLS]
    chars = [secrets.choice(p) for p in pools]
    everything = "".join(pools)
    chars += [secrets.choice(everything) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def generate_passkey() -> str:
    """Random passkey like ``K7Q2-M9XD``."""
    alphabet = _UPPER + _DIGITS
    raw = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def generate_device_token() -> str:
    return DEVICE_TOKEN_PREFIX + secrets.token_urlsafe(36)


def hash_device_token(raw_token: str) -> str:
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


def agent_group(device_id) -> str:
    """Channels group shared by one device's app and its Super Admin viewer."""
    return f"platform_monitor_device_{device_id}"


class PlatformMonitorAccount(models.Model):
    """One person the Super Admin has issued monitor-app credentials to."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.CharField(max_length=5, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    note = models.CharField(max_length=255, blank=True)

    password_hash = models.CharField(max_length=128)
    passkey_hash = models.CharField(max_length=128)

    is_active = models.BooleanField(default=True, db_index=True)

    failed_signin_count = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_monitor_accounts_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    credentials_reset_at = models.DateTimeField(null=True, blank=True)
    last_signin_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Platform Monitor Account"
        verbose_name_plural = "Platform Monitor Accounts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id} · {self.name}"

    # -------------------------------------------------------------- creds
    def issue_credentials(self) -> tuple[str, str]:
        """Set a fresh password + passkey; return the raw values (shown once)."""
        password, passkey = generate_password(), generate_passkey()
        self.password_hash = make_password(password)
        self.passkey_hash = make_password(passkey)
        self.failed_signin_count = 0
        self.locked_until = None
        return password, passkey

    def credentials_match(self, password: str, passkey: str) -> bool:
        # Check both, so timing doesn't reveal which one was wrong.
        ok_password = check_password(password or "", self.password_hash)
        ok_passkey = check_password(passkey or "", self.passkey_hash)
        return ok_password and ok_passkey

    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > timezone.now())

    def record_failed_signin(self):
        self.failed_signin_count += 1
        if self.failed_signin_count >= MAX_FAILED_SIGNINS:
            self.locked_until = timezone.now() + timedelta(minutes=LOCKOUT_MINUTES)
            self.failed_signin_count = 0
        self.save(update_fields=["failed_signin_count", "locked_until"])

    def record_successful_signin(self):
        self.failed_signin_count = 0
        self.locked_until = None
        self.last_signin_at = timezone.now()
        self.save(update_fields=["failed_signin_count", "locked_until", "last_signin_at"])


class PlatformMonitoredDevice(models.Model):
    """One computer signed in with a platform monitor account."""

    class Platform(models.TextChoices):
        WINDOWS = "windows", "Windows"
        MACOS = "macos", "macOS"
        LINUX = "linux", "Linux"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(
        PlatformMonitorAccount,
        on_delete=models.CASCADE,
        related_name="devices",
    )

    device_fingerprint = models.CharField(max_length=128, unique=True, db_index=True)
    device_name = models.CharField(max_length=200, blank=True)
    platform = models.CharField(max_length=20, choices=Platform.choices, default=Platform.WINDOWS)

    token_hash = models.CharField(max_length=64, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    consent_acknowledged_at = models.DateTimeField(null=True, blank=True)
    registered_ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    last_seen_at = models.DateTimeField(null=True, blank=True)
    last_active_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Platform Monitored Device"
        verbose_name_plural = "Platform Monitored Devices"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["account", "is_active"])]

    def __str__(self):
        return f"{self.device_name or self.device_fingerprint[:8]} · {self.account}"

    @property
    def is_online(self) -> bool:
        if not self.is_active or not self.last_seen_at:
            return False
        return (timezone.now() - self.last_seen_at).total_seconds() <= PRESENCE_TTL_SECONDS

    def set_token(self) -> str:
        raw = generate_device_token()
        self.token_hash = hash_device_token(raw)
        return raw

    def revoke(self):
        self.is_active = False
        self.revoked_at = timezone.now()
        self.save(update_fields=["is_active", "revoked_at"])

    def touch_seen(self, active: bool = False):
        now = timezone.now()
        self.last_seen_at = now
        fields = ["last_seen_at"]
        if active:
            self.last_active_at = now
            fields.append("last_active_at")
        self.save(update_fields=fields)


class PlatformMonitoringSession(models.Model):
    """Audit record: one Super Admin watched one device, start → end."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(
        PlatformMonitoredDevice,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sessions",
    )
    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="platform_monitoring_sessions_viewed",
    )
    # Denormalised so the log stays readable after accounts/devices are deleted.
    viewer_email = models.CharField(max_length=254, blank=True)
    account_user_id = models.CharField(max_length=5, blank=True)
    account_name = models.CharField(max_length=150, blank=True)
    device_label = models.CharField(max_length=200, blank=True)

    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    viewer_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "Platform Monitoring Session"
        verbose_name_plural = "Platform Monitoring Sessions"
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.viewer_email} → {self.account_user_id} @ {self.started_at:%Y-%m-%d %H:%M}"

    @property
    def duration_seconds(self):
        if not self.ended_at:
            return None
        return int((self.ended_at - self.started_at).total_seconds())

    def close(self):
        if self.ended_at is None:
            self.ended_at = timezone.now()
            self.save(update_fields=["ended_at"])
