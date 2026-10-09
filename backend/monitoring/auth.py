"""
Authentication helpers for Live Monitoring.

Two distinct identities touch this feature:

* The **background agent** on an employee's computer, which authenticates with
  its long-lived *device token* (``Authorization: Device <token>`` for HTTP,
  ``?device_token=<token>`` for its WebSocket). It is NOT a user session.
* The **Company Admin** in the dashboard, who uses the project's normal JWT
  (reused as-is via the existing ``JWTAuthMiddleware`` / DRF JWT auth).

Keeping the agent on a separate, individually revocable credential means an
admin can deregister one computer without disturbing the employee's login, and
a leaked device token can never be replayed as a user session.
"""

from channels.db import database_sync_to_async
from rest_framework import authentication, exceptions

from .models import MonitoredDevice, hash_device_token


def _lookup_active_device(raw_token: str):
    raw_token = (raw_token or "").strip()
    if not raw_token:
        return None
    device = (
        MonitoredDevice.objects.select_related("organization", "user", "employee")
        .filter(token_hash=hash_device_token(raw_token), is_active=True)
        .first()
    )
    if not device or not device.organization.is_active or not device.user.is_active:
        return None
    return device


class DeviceTokenAuthentication(authentication.BaseAuthentication):
    """DRF auth for agent HTTP calls: ``Authorization: Device <token>``.

    On success, ``request.user`` is the employee's account and
    ``request.auth`` is the :class:`MonitoredDevice`.
    """

    keyword = "Device"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        if not header or not header.startswith(self.keyword + " "):
            return None  # fall through to other authenticators / anonymous
        raw_token = header[len(self.keyword) + 1:].strip()
        device = _lookup_active_device(raw_token)
        if device is None:
            raise exceptions.AuthenticationFailed("Invalid or revoked device token.")
        return (device.user, device)


@database_sync_to_async
def get_device_from_token(raw_token: str):
    """Async lookup used by the agent WebSocket consumer."""
    return _lookup_active_device(raw_token)
