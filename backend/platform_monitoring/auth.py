"""Device-token authentication for the platform monitor agent.

Separate from ``monitoring.auth`` on purpose: a platform device token only
ever resolves to a :class:`PlatformMonitoredDevice`, and a company device token
never resolves here (different table, different prefix).
"""

from channels.db import database_sync_to_async
from rest_framework import authentication, exceptions

from .models import PlatformMonitoredDevice, hash_device_token


def lookup_active_device(raw_token: str):
    raw_token = (raw_token or "").strip()
    if not raw_token:
        return None
    device = (
        PlatformMonitoredDevice.objects.select_related("account")
        .filter(token_hash=hash_device_token(raw_token), is_active=True)
        .first()
    )
    if not device or not device.account.is_active:
        return None
    return device


class _DevicePrincipal:
    """Authenticated principal for DRF. There is no Django account behind a
    platform device, so it is never a user and never an admin."""

    is_authenticated = True
    is_active = True
    is_superuser = False
    is_staff = False
    role = None
    pk = None
    id = None


class PlatformDeviceAuthentication(authentication.BaseAuthentication):
    """``Authorization: Device <token>``; ``request.auth`` is the device."""

    keyword = "Device"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        if not header or not header.startswith(self.keyword + " "):
            return None
        device = lookup_active_device(header[len(self.keyword) + 1:])
        if device is None:
            raise exceptions.AuthenticationFailed("Invalid or revoked device token.")
        return (_DevicePrincipal(), device)

    def authenticate_header(self, request):
        return self.keyword


@database_sync_to_async
def get_device_from_token(raw_token: str):
    return lookup_active_device(raw_token)
