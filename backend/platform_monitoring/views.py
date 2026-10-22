"""
HTTP API for Super Admin Live Monitoring.

* Agent (no session → device token): sign in with User ID + password +
  passkey, heartbeat.
* Super Admin (JWT, ``IsSuperAdmin``): accounts (create / reset credentials /
  enable-disable / delete), device roster + revoke, activity log, app download.

The screen stream itself is WebRTC; see ``consumers.py`` for signalling.
"""

import logging
import math

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.http import FileResponse, Http404
from django.utils import timezone
from ipware import get_client_ip
from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin
from monitoring.ice import build_ice_servers

from .auth import PlatformDeviceAuthentication
from .models import (
    PlatformMonitorAccount,
    PlatformMonitoredDevice,
    PlatformMonitoringSession,
    PlatformSnapshotSettings,
    PlatformSnapshot,
    PlatformInactivitySettings,
    PlatformActivityEntry,
    DEFAULT_SNAPSHOT_INTERVAL,
    DEFAULT_IDLE_THRESHOLD,
    agent_group,
    generate_user_id,
)
from .serializers import (
    AccountSerializer,
    AgentSignInSerializer,
    DeviceSerializer,
    SessionSerializer,
    PlatformSnapshotSettingsSerializer,
    PlatformSnapshotSerializer,
    PlatformInactivitySettingsSerializer,
    PlatformActivityEntrySerializer,
)

logger = logging.getLogger(__name__)

INSTALLER_NAME = "ZuperHRMonitor-Setup.exe"
GENERIC_SIGNIN_ERROR = "User ID, password or passkey is incorrect."

# Compared against when the User ID doesn't exist, so a wrong ID takes as long
# as a wrong password (no timing hint about which IDs exist).
_DUMMY_HASH = None


def _dummy_hash():
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = make_password("platform-monitor-dummy")
    return _DUMMY_HASH


def kick_agents(device_ids):
    """Disconnect live agents (their next reconnect is refused)."""
    layer = get_channel_layer()
    if layer is None:
        return
    for device_id in device_ids:
        try:
            async_to_sync(layer.group_send)(agent_group(device_id), {"type": "agent.kick"})
        except Exception as e:  # pragma: no cover - best effort
            logger.warning("platform monitor: kick failed for %s: %s", device_id, e)


def _credentials_payload(account, password, passkey):
    return {
        "account": AccountSerializer(account).data,
        "credentials": {"user_id": account.user_id, "password": password, "passkey": passkey},
    }


# --------------------------------------------------------------------------- #
# Agent endpoints
# --------------------------------------------------------------------------- #
class AgentSignInView(APIView):
    """Sign in the ZuperHR Monitor app. All three credentials must match the
    account exactly; on success this computer gets its own device token."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "platform_monitor_signin"

    def post(self, request):
        serializer = AgentSignInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        account = PlatformMonitorAccount.objects.filter(user_id=data["user_id"]).first()
        if account is None:
            check_password(data["password"], _dummy_hash())
            return Response({"detail": GENERIC_SIGNIN_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        if account.is_locked:
            minutes = max(1, math.ceil((account.locked_until - timezone.now()).total_seconds() / 60))
            return Response(
                {"detail": f"Too many incorrect attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if not account.credentials_match(data["password"], data["passkey"]):
            account.record_failed_signin()
            return Response({"detail": GENERIC_SIGNIN_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        if not account.is_active:
            return Response(
                {"detail": "This account has been disabled. Contact the administrator."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not data.get("consent_acknowledged"):
            return Response(
                {"consent_acknowledged": "Please confirm that you understand this computer's screen may be monitored."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        account.record_successful_signin()
        ip, _ = get_client_ip(request)
        device, created = PlatformMonitoredDevice.objects.get_or_create(
            device_fingerprint=data["device_fingerprint"],
            defaults={"account": account, "token_hash": ""},
        )
        # Re-sign-in on the same computer (or after revoke): rebind + reissue.
        device.account = account
        if data.get("device_name"):
            device.device_name = data["device_name"]
        device.platform = data.get("platform", device.platform)
        device.is_active = True
        device.revoked_at = None
        device.consent_acknowledged_at = timezone.now()
        device.registered_ip = ip
        raw_token = device.set_token()
        device.save()

        return Response(
            {
                "device_id": str(device.id),
                "device_token": raw_token,  # shown once; the app stores it encrypted
                "user_id": account.user_id,
                "name": account.name,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AgentHeartbeatView(APIView):
    """HTTP heartbeat fallback; the WebSocket is the main presence signal."""

    authentication_classes = [PlatformDeviceAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.touch_seen(active=bool(request.data.get("active", False)))
        settings_obj = PlatformSnapshotSettings.objects.first()
        snap_interval = settings_obj.interval_minutes if settings_obj and settings_obj.is_enabled else DEFAULT_SNAPSHOT_INTERVAL
        return Response({"ok": True, "ice_servers": build_ice_servers(), "snapshot_interval_minutes": snap_interval})


# --------------------------------------------------------------------------- #
# Super Admin endpoints
# --------------------------------------------------------------------------- #
def _accounts_qs():
    return PlatformMonitorAccount.objects.select_related("created_by").prefetch_related(
        Prefetch("devices", queryset=PlatformMonitoredDevice.objects.all())
    )


class AccountListCreateView(generics.ListCreateAPIView):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = None

    def get_queryset(self):
        return _accounts_qs().order_by("-created_at")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for _ in range(25):
            account = PlatformMonitorAccount(
                user_id=generate_user_id(),
                name=serializer.validated_data["name"],
                note=serializer.validated_data.get("note", ""),
                created_by=request.user,
            )
            password, passkey = account.issue_credentials()
            try:
                with transaction.atomic():
                    account.save()
                break
            except IntegrityError:
                continue  # User ID already taken; draw another
        else:
            return Response(
                {"detail": "Could not allocate a free User ID. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(_credentials_payload(account, password, passkey), status=status.HTTP_201_CREATED)


class AccountDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH name / note / is_active; DELETE removes the account and its
    computers (the activity log is kept)."""

    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    http_method_names = ["get", "patch", "delete"]
    lookup_url_kwarg = "account_id"

    def get_queryset(self):
        return _accounts_qs()

    def perform_update(self, serializer):
        was_active = serializer.instance.is_active
        account = serializer.save()
        if was_active and not account.is_active:
            kick_agents([d.id for d in account.devices.filter(is_active=True)])

    def perform_destroy(self, instance):
        device_ids = list(instance.devices.values_list("id", flat=True))
        instance.delete()
        kick_agents(device_ids)


class AccountResetCredentialsView(APIView):
    """Issue a new password + passkey (shown once). The old ones stop working
    immediately; computers already signed in stay signed in."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, account_id):
        account = _accounts_qs().filter(id=account_id).first()
        if account is None:
            raise Http404
        password, passkey = account.issue_credentials()
        account.credentials_reset_at = timezone.now()
        account.save()
        return Response(_credentials_payload(account, password, passkey))


class DeviceListView(generics.ListAPIView):
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = None

    def get_queryset(self):
        return PlatformMonitoredDevice.objects.select_related("account").order_by(
            "-is_active", "account__user_id", "device_name"
        )


class DeviceRevokeView(APIView):
    """Sign one computer out. The account itself is untouched."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, device_id):
        device = PlatformMonitoredDevice.objects.filter(id=device_id).first()
        if device is None:
            raise Http404
        device.revoke()
        kick_agents([device.id])
        return Response({"ok": True})


class SessionListView(generics.ListAPIView):
    serializer_class = SessionSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get_queryset(self):
        return PlatformMonitoringSession.objects.all()


class AgentDownloadView(APIView):
    """Serve the platform monitor installer. 404 until one is published at
    ``MEDIA_ROOT/platform_monitoring/agent/<INSTALLER_NAME>``."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        path = settings.MEDIA_ROOT / "platform_monitoring" / "agent" / INSTALLER_NAME
        if not path.exists():
            return Response({"detail": "The app installer is not available yet."}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(open(path, "rb"), as_attachment=True, filename=INSTALLER_NAME)


# --------------------------------------------------------------------------- #
# Snapshot settings & data
# --------------------------------------------------------------------------- #
class PlatformSnapshotSettingsView(APIView):
    """GET / PATCH the platform-wide snapshot settings."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        settings_obj, _ = PlatformSnapshotSettings.objects.get_or_create(
            pk=1, defaults={"interval_minutes": DEFAULT_SNAPSHOT_INTERVAL}
        )
        return Response(PlatformSnapshotSettingsSerializer(settings_obj).data)

    def patch(self, request):
        settings_obj, _ = PlatformSnapshotSettings.objects.get_or_create(
            pk=1, defaults={"interval_minutes": DEFAULT_SNAPSHOT_INTERVAL}
        )
        interval = request.data.get("interval_minutes")
        if interval is not None:
            interval = int(interval)
            if interval < 1:
                return Response({"detail": "Interval must be at least 1 minute."}, status=status.HTTP_400_BAD_REQUEST)
            settings_obj.interval_minutes = interval

        retention = request.data.get("retention_days")
        if retention is not None:
            retention = int(retention)
            if retention < 1:
                return Response({"detail": "Retention must be at least 1 day."}, status=status.HTTP_400_BAD_REQUEST)
            settings_obj.retention_days = retention

        if "is_enabled" in request.data:
            settings_obj.is_enabled = bool(request.data["is_enabled"])

        settings_obj.save()
        return Response(PlatformSnapshotSettingsSerializer(settings_obj).data)


class PlatformSnapshotListView(generics.ListAPIView):
    """List all platform snapshots, optionally filtered by device."""

    serializer_class = PlatformSnapshotSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get_queryset(self):
        qs = PlatformSnapshot.objects.select_related("device", "device__account")
        device_id = self.request.query_params.get("device")
        if device_id:
            qs = qs.filter(device_id=device_id)
        account_id = self.request.query_params.get("account")
        if account_id:
            qs = qs.filter(device__account_id=account_id)
        return qs


class PlatformSnapshotUploadView(APIView):
    """Agent uploads a screenshot."""

    authentication_classes = [PlatformDeviceAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = request.auth
        if not device.is_active:
            return Response({"detail": "Device is revoked."}, status=status.HTTP_403_FORBIDDEN)
        image = request.FILES.get("image")
        if not image:
            return Response({"detail": "No image provided."}, status=status.HTTP_400_BAD_REQUEST)
        snapshot = PlatformSnapshot.objects.create(device=device, image=image)
        return Response({"id": str(snapshot.id), "captured_at": snapshot.captured_at.isoformat()}, status=status.HTTP_201_CREATED)


class PlatformSnapshotIntervalView(APIView):
    """Agent asks what interval to use."""

    authentication_classes = [PlatformDeviceAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_obj = PlatformSnapshotSettings.objects.first()
        interval = settings_obj.interval_minutes if settings_obj and settings_obj.is_enabled else 0
        return Response({"interval_minutes": interval})


# --------------------------------------------------------------------------- #
# Inactivity settings & activity log
# --------------------------------------------------------------------------- #
class PlatformInactivitySettingsView(APIView):
    """GET / PATCH the global inactivity thresholds."""

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        obj, _ = PlatformInactivitySettings.objects.get_or_create(
            pk=1, defaults={"idle_threshold_minutes": DEFAULT_IDLE_THRESHOLD}
        )
        return Response(PlatformInactivitySettingsSerializer(obj).data)

    def patch(self, request):
        obj, _ = PlatformInactivitySettings.objects.get_or_create(
            pk=1, defaults={"idle_threshold_minutes": DEFAULT_IDLE_THRESHOLD}
        )
        idle = request.data.get("idle_threshold_minutes")
        if idle is not None:
            idle = int(idle)
            if idle < 1:
                return Response({"detail": "Idle threshold must be at least 1 minute."}, status=status.HTTP_400_BAD_REQUEST)
            obj.idle_threshold_minutes = idle

        long_int = request.data.get("long_interval_threshold_minutes")
        if long_int is not None:
            long_int = int(long_int)
            if long_int < 1:
                return Response({"detail": "Long interval threshold must be at least 1 minute."}, status=status.HTTP_400_BAD_REQUEST)
            obj.long_interval_threshold_minutes = long_int

        obj.save()
        return Response(PlatformInactivitySettingsSerializer(obj).data)


class PlatformActivityListView(generics.ListAPIView):
    """List activity entries, filterable by account and date."""

    serializer_class = PlatformActivityEntrySerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get_queryset(self):
        qs = PlatformActivityEntry.objects.select_related("device", "device__account")
        account_id = self.request.query_params.get("account")
        if account_id:
            qs = qs.filter(device__account_id=account_id)
        device_id = self.request.query_params.get("device")
        if device_id:
            qs = qs.filter(device_id=device_id)
        date_str = self.request.query_params.get("date")
        if date_str:
            from datetime import datetime
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
                qs = qs.filter(started_at__date=d)
            except ValueError:
                pass
        return qs


class PlatformActivityUploadView(APIView):
    """Agent uploads batched activity entries."""

    authentication_classes = [PlatformDeviceAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = request.auth
        if not device.is_active:
            return Response({"detail": "Device is revoked."}, status=status.HTTP_403_FORBIDDEN)
        entries = request.data.get("entries", [])
        if not entries:
            return Response({"detail": "No entries provided."}, status=status.HTTP_400_BAD_REQUEST)
        created = 0
        for entry in entries:
            PlatformActivityEntry.objects.create(
                device=device,
                title=entry.get("title", ""),
                app_name=entry.get("app_name", ""),
                url=entry.get("url", ""),
                started_at=entry["started_at"],
                ended_at=entry.get("ended_at"),
                duration_seconds=entry.get("duration_seconds", 0),
            )
            created += 1
        return Response({"created": created}, status=status.HTTP_201_CREATED)
