"""
AttendStack – Live Monitoring

Read-only live screen monitoring of a company's registered work computers.

Two models:

* ``MonitoredDevice`` – one registered work computer, permanently bound to one
  employee account and one organization. Authenticates its background agent
  with a long-lived, individually revocable *device token* (only the SHA-256
  hash is stored, never the raw token).
* ``MonitoringSession`` – an immutable audit record of every time a Company
  Admin watched a device's screen: who watched whom, from where, and for how
  long. This log is as much a legal protection for the company as it is a
  governance control over admins.

Design notes:
* The agent is deliberately powerless – there is no input-injection, file or
  remote-control path anywhere in this feature. It streams the screen and
  nothing else.
* Presence (online/offline) is driven by the live WebSocket connection and a
  DB ``last_seen_at`` heartbeat, because the project has no shared cache layer
  (LocMem is per-process); the Redis channel layer handles fan-out only.
"""

import hashlib
import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

# A device is considered online if its agent heartbeat was seen within this
# many seconds. The agent heartbeats roughly every 20s over its WebSocket.
PRESENCE_TTL_SECONDS = 60

DEVICE_TOKEN_PREFIX = "astk_dev_"


def generate_device_token() -> str:
    """A long-lived opaque bearer token for one registered device agent."""
    return DEVICE_TOKEN_PREFIX + secrets.token_urlsafe(36)


def hash_device_token(raw_token: str) -> str:
    """SHA-256 of the raw token. Only this hash is ever persisted."""
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


class MonitoredDevice(models.Model):
    """One work computer, permanently associated with one employee + org."""

    class Platform(models.TextChoices):
        WINDOWS = "windows", "Windows"
        MACOS = "macos", "macOS"
        LINUX = "linux", "Linux"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="monitored_devices",
    )
    # The employee's *login* account (holds the password used at registration).
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="monitored_devices",
    )
    # Optional link to the HR Employee record, for display (name/photo/dept).
    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="monitored_devices",
    )

    # Agent-generated, persisted on the device. Stable across restarts and
    # reinstalls-with-same-store; a fresh install produces a new fingerprint
    # and therefore a new device row (multiple labelled devices per employee).
    device_fingerprint = models.CharField(max_length=128, unique=True, db_index=True)
    device_name = models.CharField(
        max_length=200, blank=True, help_text="Hostname / friendly label shown to the admin."
    )
    platform = models.CharField(
        max_length=20, choices=Platform.choices, default=Platform.WINDOWS
    )

    # SHA-256 of the device token. The raw token is shown exactly once, to the
    # agent, at registration, and never stored.
    token_hash = models.CharField(max_length=64, db_index=True)

    # Admin can revoke/deregister a device without touching the employee login.
    is_active = models.BooleanField(default=True, db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # Recorded consent: the employee acknowledged monitoring at registration.
    consent_acknowledged_at = models.DateTimeField(null=True, blank=True)

    registered_ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Heartbeat: last time the agent's WebSocket was alive.
    last_seen_at = models.DateTimeField(null=True, blank=True)
    # Last time real user activity (not idle) was reported by the agent.
    last_active_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Monitored Device"
        verbose_name_plural = "Monitored Devices"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "is_active"]),
            models.Index(fields=["user", "is_active"]),
        ]

    def __str__(self):
        label = self.device_name or self.device_fingerprint[:8]
        return f"{label} · {self.user.email} ({self.organization.name})"

    # ------------------------------------------------------------------ #
    @property
    def is_online(self) -> bool:
        if not self.is_active or not self.last_seen_at:
            return False
        return (timezone.now() - self.last_seen_at).total_seconds() <= PRESENCE_TTL_SECONDS

    def set_token(self) -> str:
        """Mint a fresh device token, store its hash, return the raw token."""
        raw = generate_device_token()
        self.token_hash = hash_device_token(raw)
        return raw

    def revoke(self):
        self.is_active = False
        self.revoked_at = timezone.now()
        self.save(update_fields=["is_active", "revoked_at"])

    def touch_seen(self, active: bool = False):
        now = timezone.now()
        fields = ["last_seen_at"]
        self.last_seen_at = now
        if active:
            self.last_active_at = now
            fields.append("last_active_at")
        self.save(update_fields=fields)


class MonitoringSession(models.Model):
    """Immutable audit record: one admin watched one device, start→end."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="monitoring_sessions",
    )
    device = models.ForeignKey(
        MonitoredDevice,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sessions",
    )
    # The admin who watched. SET_NULL so the audit trail outlives account deletion.
    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="monitoring_sessions_viewed",
    )
    # Denormalised so the record is readable even after FKs are nulled.
    viewer_email = models.CharField(max_length=254, blank=True)
    device_label = models.CharField(max_length=200, blank=True)
    watched_user_email = models.CharField(max_length=254, blank=True)

    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    viewer_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "Monitoring Session"
        verbose_name_plural = "Monitoring Sessions"
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["organization", "started_at"]),
        ]

    def __str__(self):
        return f"{self.viewer_email} → {self.device_label} @ {self.started_at:%Y-%m-%d %H:%M}"

    @property
    def duration_seconds(self):
        if not self.ended_at:
            return None
        return int((self.ended_at - self.started_at).total_seconds())

    def close(self):
        if self.ended_at is None:
            self.ended_at = timezone.now()
            self.save(update_fields=["ended_at"])
