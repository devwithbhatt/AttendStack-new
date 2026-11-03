"""
HTTP API for Live Monitoring.

* Agent (device token auth): register, heartbeat.
* Company Admin (JWT): device roster, deregister, audit log, agent download.

The live screen stream itself is WebRTC and does not touch these views — see
``consumers.py`` for signalling.
"""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import render
from django.utils import timezone
from ipware import get_client_ip
from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrHR
from organizations.services import get_organization_for_user, resolve_organization_for_request

from .access import is_full_monitor, visible_devices
from .auth import DeviceTokenAuthentication
from .ice import build_ice_servers
from .models import (
    MonitoredDevice, MonitoringSession, SnapshotSettings, DeviceSnapshotOverride, Snapshot,
    InactivitySettings, ActivityEntry, UninstallPassword, MonitorMessage, MessageStatus,
    agent_group,
    DEFAULT_SNAPSHOT_INTERVAL, DEFAULT_IDLE_THRESHOLD,
)
from .serializers import (
    DeviceRegisterSerializer,
    MonitoredDeviceSerializer,
    MonitoringSessionSerializer,
    SnapshotSettingsSerializer,
    SnapshotSerializer,
    InactivitySettingsSerializer,
    ActivityEntrySerializer,
    MonitorMessageSerializer,
    SendMessageSerializer,
)


def _admin_org(request):
    """The single organisation a Company Admin's monitoring views are scoped to."""
    user = request.user
    if user.is_superuser or getattr(user, "role", "") == "SUPER_ADMIN":
        return resolve_organization_for_request(request)
    return get_organization_for_user(user)


# --------------------------------------------------------------------------- #
# Agent endpoints (device token)
# --------------------------------------------------------------------------- #
class DeviceRegisterView(APIView):
    """First-time registration. Validates org + email + password, binds the
    computer to the employee, and returns a long-lived device token."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    # Rate-limit by IP: this endpoint validates email+password and is
    # unauthenticated, so without a throttle it is a password brute-force vector.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "monitor_register"

    def post(self, request):
        serializer = DeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer._user
        org = serializer._organization
        fingerprint = serializer.validated_data["device_fingerprint"]
        ip, _ = get_client_ip(request)

        # Link the HR Employee record if one exists for this account/org.
        from employees.models import Employee

        employee = Employee.objects.filter(organization=org, email__iexact=user.email).first()

        # One user = one active device. Deactivate all previous devices for
        # this user+org so the latest registration is the only active one.
        MonitoredDevice.objects.filter(
            user=user, organization=org, is_active=True
        ).exclude(device_fingerprint=fingerprint).update(
            is_active=False, revoked_at=timezone.now()
        )

        device, created = MonitoredDevice.objects.get_or_create(
            device_fingerprint=fingerprint,
            defaults={
                "organization": org,
                "user": user,
                "employee": employee,
                "device_name": serializer.validated_data.get("device_name", ""),
                "platform": serializer.validated_data.get("platform"),
            },
        )

        # Re-registration on the same computer (or after revoke): rebind + reissue.
        device.organization = org
        device.user = user
        device.employee = employee
        if serializer.validated_data.get("device_name"):
            device.device_name = serializer.validated_data["device_name"]
        device.platform = serializer.validated_data.get("platform", device.platform)
        device.is_active = True
        device.revoked_at = None
        device.consent_acknowledged_at = timezone.now()
        device.registered_ip = ip
        raw_token = device.set_token()
        device.save()

        return Response(
            {
                "device_id": str(device.id),
                "device_token": raw_token,  # shown exactly once; agent stores it securely
                "organization": {"id": org.pk, "name": org.name},
                "employee_name": device.user.get_full_name() or device.user.email,
                "created": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DeviceHeartbeatView(APIView):
    """Optional HTTP heartbeat. The live WebSocket is the primary presence
    signal; this is a fallback for agents that briefly lack a socket."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = request.auth  # set by DeviceTokenAuthentication
        active = bool(request.data.get("active", False))
        device.touch_seen(active=active)
        override = DeviceSnapshotOverride.objects.filter(device=device).first()
        if override:
            snap_interval = override.interval_minutes
        else:
            org_settings = SnapshotSettings.objects.filter(organization=device.organization).first()
            snap_interval = org_settings.interval_minutes if org_settings and org_settings.is_enabled else DEFAULT_SNAPSHOT_INTERVAL
        return Response({"ok": True, "ice_servers": build_ice_servers(), "snapshot_interval_minutes": snap_interval})


# --------------------------------------------------------------------------- #
# Admin endpoints (JWT)
# --------------------------------------------------------------------------- #
class AdminDeviceListView(generics.ListAPIView):
    """Roster of the admin's own organisation's registered devices."""

    serializer_class = MonitoredDeviceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get_queryset(self):
        org = _admin_org(self.request)
        if org is None:
            return MonitoredDevice.objects.none()
        return (
            visible_devices(self.request.user, MonitoredDevice.objects.filter(organization=org))
            .select_related("user", "employee")
            .order_by("-is_active", "device_name")
        )


class AdminDeviceRevokeView(APIView):
    """Deregister (revoke) one device. The employee login is untouched."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def post(self, request, device_id):
        org = _admin_org(request)
        device = visible_devices(request.user, MonitoredDevice.objects.filter(id=device_id, organization=org)).first()
        if not device:
            raise Http404
        device.revoke()
        return Response({"ok": True})


class AdminDeviceUnrevokeView(APIView):
    """Re-activate a previously revoked device."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def post(self, request, device_id):
        org = _admin_org(request)
        device = MonitoredDevice.objects.filter(id=device_id, organization=org, is_active=False).first()
        if not device:
            raise Http404
        device.unrevoke()
        return Response({"ok": True})


class AdminDeviceDeleteView(APIView):
    """Permanently delete a device and all its snapshots."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def delete(self, request, device_id):
        org = _admin_org(request)
        device = MonitoredDevice.objects.filter(id=device_id, organization=org).first()
        if not device:
            raise Http404
        device.delete()
        return Response({"ok": True})


class MonitoringSessionListView(generics.ListAPIView):
    """Audit log: who watched whom, when, for how long — scoped to the org."""

    serializer_class = MonitoringSessionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get_queryset(self):
        org = _admin_org(self.request)
        if org is None:
            return MonitoringSession.objects.none()
        sessions = MonitoringSession.objects.filter(organization=org)
        if is_full_monitor(self.request.user):
            return sessions  # complete log, including removed devices
        devices = visible_devices(self.request.user, MonitoredDevice.objects.filter(organization=org))
        return sessions.filter(device__in=devices)


class AgentDownloadView(APIView):
    """Serve the Windows agent installer to an authenticated admin.

    Returns 404 until a built installer is placed at ``MEDIA_ROOT/monitoring/
    agent/ZuperHRMonitor-Setup.exe``; the dashboard button hides/greys
    itself when this 404s.
    """

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get(self, request):
        import json as _json
        from django.conf import settings

        agent_dir = settings.MEDIA_ROOT / "monitoring" / "agent"
        path = agent_dir / "ZuperHRMonitor-Setup.exe"
        if not path.exists():
            return Response(
                {"detail": "Agent installer is not available yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        version = ""
        version_file = agent_dir / AGENT_VERSION_FILE
        if version_file.exists():
            try:
                with open(version_file) as f:
                    version = _json.load(f).get("version", "")
            except Exception:
                pass
        suffix = f" v{version}" if version else ""
        filename = f"ZuperHR Monitor{suffix}.exe"
        return FileResponse(
            open(path, "rb"),
            as_attachment=True,
            filename=filename,
        )


# --------------------------------------------------------------------------- #
# Snapshot settings & data
# --------------------------------------------------------------------------- #
class SnapshotSettingsView(APIView):
    """GET / PATCH the org-wide snapshot interval."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        settings_obj, _ = SnapshotSettings.objects.get_or_create(
            organization=org,
            defaults={"interval_minutes": DEFAULT_SNAPSHOT_INTERVAL},
        )
        data = SnapshotSettingsSerializer(settings_obj).data
        overrides = DeviceSnapshotOverride.objects.filter(
            device__organization=org, device__is_active=True
        ).select_related("device").values("device_id", "interval_minutes")
        data["device_overrides"] = {str(o["device_id"]): o["interval_minutes"] for o in overrides}
        return Response(data)

    def patch(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        settings_obj, _ = SnapshotSettings.objects.get_or_create(
            organization=org,
            defaults={"interval_minutes": DEFAULT_SNAPSHOT_INTERVAL},
        )
        interval = request.data.get("interval_minutes")
        if interval is not None:
            interval = int(interval)
            if interval < 1:
                return Response({"detail": "Interval must be at least 1 minute."}, status=400)
            settings_obj.interval_minutes = interval

        retention = request.data.get("retention_days")
        if retention is not None:
            retention = int(retention)
            if retention < 1:
                return Response({"detail": "Retention must be at least 1 day."}, status=400)
            settings_obj.retention_days = retention

        if "is_enabled" in request.data:
            settings_obj.is_enabled = bool(request.data["is_enabled"])

        settings_obj.save()

        if request.data.get("apply_to_all"):
            DeviceSnapshotOverride.objects.filter(device__organization=org).delete()

        return Response(SnapshotSettingsSerializer(settings_obj).data)


class DeviceSnapshotSettingsView(APIView):
    """Set or clear a per-device snapshot interval override."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def patch(self, request, device_id):
        org = _admin_org(request)
        device = MonitoredDevice.objects.filter(id=device_id, organization=org, is_active=True).first()
        if not device:
            raise Http404
        interval = request.data.get("interval_minutes")
        if interval is None:
            DeviceSnapshotOverride.objects.filter(device=device).delete()
            return Response({"detail": "Override removed."})
        interval = int(interval)
        if interval < 1:
            return Response({"detail": "Interval must be at least 1 minute."}, status=400)
        override, _ = DeviceSnapshotOverride.objects.update_or_create(
            device=device, defaults={"interval_minutes": interval}
        )
        return Response({"device": str(device.id), "interval_minutes": override.interval_minutes})


class SnapshotListView(generics.ListAPIView):
    """List snapshots for the org, optionally filtered by device and date."""

    serializer_class = SnapshotSerializer
    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get_queryset(self):
        org = _admin_org(self.request)
        if not org:
            return Snapshot.objects.none()
        qs = Snapshot.objects.filter(organization=org).select_related(
            "device", "device__employee", "device__user"
        )
        device_id = self.request.query_params.get("device")
        if device_id:
            qs = qs.filter(device_id=device_id)
        date_str = self.request.query_params.get("date")
        if date_str:
            from datetime import datetime, time as dtime
            try:
                day = datetime.strptime(date_str, "%Y-%m-%d").date()
                from django.utils import timezone as tz
                start = tz.make_aware(datetime.combine(day, dtime.min))
                end = tz.make_aware(datetime.combine(day, dtime.max))
                qs = qs.filter(captured_at__range=(start, end))
            except (ValueError, TypeError):
                pass
        return qs


class SnapshotUploadView(APIView):
    """Agent uploads a screenshot. Authenticated by device token."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = request.auth
        if not device.is_active:
            return Response({"detail": "Device is revoked."}, status=403)
        image = request.FILES.get("image")
        if not image:
            return Response({"detail": "No image provided."}, status=400)
        snapshot = Snapshot.objects.create(
            device=device,
            organization=device.organization,
            image=image,
        )
        return Response({"id": str(snapshot.id), "captured_at": snapshot.captured_at.isoformat()}, status=201)


class SnapshotIntervalView(APIView):
    """Agent asks what interval to use. Returns minutes."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        device = request.auth
        override = DeviceSnapshotOverride.objects.filter(device=device).first()
        if override:
            return Response({"interval_minutes": override.interval_minutes})
        org_settings = SnapshotSettings.objects.filter(organization=device.organization).first()
        interval = org_settings.interval_minutes if org_settings and org_settings.is_enabled else 0
        return Response({"interval_minutes": interval})


# --------------------------------------------------------------------------- #
# Activity log & inactivity settings
# --------------------------------------------------------------------------- #
class InactivitySettingsView(APIView):
    """GET / PATCH per-org inactivity thresholds."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        obj, _ = InactivitySettings.objects.get_or_create(
            organization=org,
            defaults={"idle_threshold_minutes": DEFAULT_IDLE_THRESHOLD},
        )
        return Response(InactivitySettingsSerializer(obj).data)

    def patch(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        obj, _ = InactivitySettings.objects.get_or_create(
            organization=org,
            defaults={"idle_threshold_minutes": DEFAULT_IDLE_THRESHOLD},
        )
        idle = request.data.get("idle_threshold_minutes")
        if idle is not None:
            idle = int(idle)
            if idle < 1:
                return Response({"detail": "Idle threshold must be at least 1 minute."}, status=400)
            obj.idle_threshold_minutes = idle

        long_int = request.data.get("long_interval_threshold_minutes")
        if long_int is not None:
            long_int = int(long_int)
            if long_int < 1:
                return Response({"detail": "Long interval threshold must be at least 1 minute."}, status=400)
            obj.long_interval_threshold_minutes = long_int

        obj.save()
        return Response(InactivitySettingsSerializer(obj).data)


class ActivityListView(generics.ListAPIView):
    """List activity entries for the org, filterable by device and date."""

    serializer_class = ActivityEntrySerializer
    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get_queryset(self):
        org = _admin_org(self.request)
        if not org:
            return ActivityEntry.objects.none()
        qs = ActivityEntry.objects.filter(organization=org).select_related(
            "device", "device__employee", "device__user"
        )
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


class ActivityUploadView(APIView):
    """Agent uploads batched activity entries. Authenticated by device token."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        device = request.auth
        if not device.is_active:
            return Response({"detail": "Device is revoked."}, status=403)
        entries = request.data.get("entries", [])
        if not entries:
            return Response({"detail": "No entries provided."}, status=400)
        created = 0
        for entry in entries:
            ActivityEntry.objects.create(
                device=device,
                organization=device.organization,
                title=entry.get("title", ""),
                app_name=entry.get("app_name", ""),
                url=entry.get("url", ""),
                started_at=entry["started_at"],
                ended_at=entry.get("ended_at"),
                duration_seconds=entry.get("duration_seconds", 0),
            )
            created += 1
        return Response({"created": created}, status=201)


# --------------------------------------------------------------------------- #
# Uninstall protection
# --------------------------------------------------------------------------- #
class UninstallPasswordView(APIView):
    """Company Admin sets or resets the uninstall protection password."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        exists = UninstallPassword.objects.filter(organization=org).exists()
        return Response({"is_set": exists})

    def post(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        password = request.data.get("password", "").strip()
        if not password or len(password) < 4:
            return Response({"detail": "Password must be at least 4 characters."}, status=400)
        obj, _ = UninstallPassword.objects.get_or_create(organization=org)
        obj.set_password(password)
        obj.set_by = request.user
        obj.save()
        return Response({"ok": True, "message": "Uninstall password set."})

    def delete(self, request):
        org = _admin_org(request)
        if not org:
            return Response({"detail": "No organisation."}, status=400)
        UninstallPassword.objects.filter(organization=org).delete()
        return Response({"ok": True, "message": "Uninstall password removed."})


class AgentVerifyUninstallPasswordView(APIView):
    """Agent verifies the uninstall password before allowing quit/uninstall."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Check whether an uninstall password is set for this device's org."""
        device = request.auth
        exists = UninstallPassword.objects.filter(organization=device.organization).exists()
        return Response({"protection_enabled": exists})

    def post(self, request):
        device = request.auth
        password = request.data.get("password", "")
        obj = UninstallPassword.objects.filter(organization=device.organization).first()
        if not obj:
            return Response({"verified": True})
        if obj.check_password(password):
            return Response({"verified": True})
        return Response({"verified": False, "detail": "Incorrect password."}, status=403)


INSTALLER_NAME = "ZuperHRMonitor-Setup.exe"
AGENT_VERSION_FILE = "version.json"


def _parse_version(v):
    try:
        return tuple(int(x) for x in v.strip().split("."))
    except (ValueError, AttributeError):
        return (0, 0, 0)


# --------------------------------------------------------------------------- #
# Auto-update (agent endpoints)
# --------------------------------------------------------------------------- #
class AgentCheckUpdateView(APIView):
    """Agent checks whether a newer version of the app is available."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import json as _json

        version_path = settings.MEDIA_ROOT / "monitoring" / "agent" / AGENT_VERSION_FILE
        if not version_path.exists():
            return Response({"update_available": False})
        try:
            with open(version_path) as f:
                info = _json.load(f)
        except Exception:
            return Response({"update_available": False})

        latest = info.get("version", "0.0.0")
        current = request.query_params.get("v", "0.0.0")
        return Response({
            "update_available": _parse_version(latest) > _parse_version(current),
            "latest_version": latest,
        })


class AgentDownloadUpdateView(APIView):
    """Agent downloads the latest app binary for auto-update."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        file_path = settings.MEDIA_ROOT / "monitoring" / "agent" / INSTALLER_NAME
        if not file_path.exists():
            return Response({"detail": "Update not available."}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(open(file_path, "rb"), as_attachment=True, filename=INSTALLER_NAME)


# --------------------------------------------------------------------------- #
# Company Admin → Employee messaging
# --------------------------------------------------------------------------- #
class SendMessageView(APIView):
    """Company Admin sends a message to a monitored device."""

    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def post(self, request):
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        org = _admin_org(request)
        device = MonitoredDevice.objects.select_related("user", "employee").filter(
            id=serializer.validated_data["device_id"],
            organization=org,
            is_active=True,
        ).first()
        if device is None:
            return Response({"detail": "Device not found or inactive."}, status=status.HTTP_404_NOT_FOUND)

        content = serializer.validated_data["content"].strip()
        if not content:
            return Response({"detail": "Message cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        employee_name = ""
        if device.employee:
            employee_name = device.employee.full_name
        if not employee_name:
            employee_name = device.user.get_full_name() or device.user.email

        msg = MonitorMessage.objects.create(
            sender=request.user,
            sender_name=request.user.get_full_name() or request.user.email,
            device=device,
            organization=org,
            employee_name=employee_name,
            content=content,
            status=MessageStatus.CREATED,
        )

        layer = get_channel_layer()
        if layer:
            try:
                async_to_sync(layer.group_send)(agent_group(device.id), {
                    "type": "admin.message",
                    "message_id": str(msg.id),
                    "sender_name": msg.sender_name,
                    "content": msg.content,
                    "created_at": msg.created_at.isoformat(),
                })
                msg.status = MessageStatus.SENT
                msg.save(update_fields=["status"])
            except Exception:
                msg.status = MessageStatus.FAILED
                msg.save(update_fields=["status"])

        return Response(MonitorMessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class MessageStatusView(generics.ListAPIView):
    """Company Admin views message statuses for a device."""

    serializer_class = MonitorMessageSerializer
    permission_classes = [IsAuthenticated, IsAdminOrHR]
    permission_module = "monitoring"

    def get_queryset(self):
        org = _admin_org(self.request)
        if not org:
            return MonitorMessage.objects.none()
        qs = MonitorMessage.objects.filter(organization=org).select_related("device")
        device_id = self.request.query_params.get("device")
        if device_id:
            qs = qs.filter(device_id=device_id)
        return qs[:50]


class AgentPendingMessagesView(APIView):
    """Agent fetches its unacknowledged messages."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        device = request.auth
        pending = MonitorMessage.objects.filter(
            device=device,
            status__in=[MessageStatus.CREATED, MessageStatus.SENT, MessageStatus.DELIVERED],
        ).order_by("created_at")
        data = [
            {
                "id": str(m.id),
                "sender_name": m.sender_name,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in pending
        ]
        pending.filter(status__in=[MessageStatus.CREATED, MessageStatus.SENT]).update(
            status=MessageStatus.DELIVERED, delivered_at=timezone.now()
        )
        return Response(data)


class AgentAcknowledgeMessageView(APIView):
    """Agent acknowledges a specific message (employee clicked OK)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        device = request.auth
        msg = MonitorMessage.objects.filter(id=message_id, device=device).first()
        if msg is None:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)

        msg.status = MessageStatus.ACKNOWLEDGED
        msg.acknowledged_at = timezone.now()
        msg.save(update_fields=["status", "acknowledged_at"])

        layer = get_channel_layer()
        if layer:
            try:
                async_to_sync(layer.group_send)(agent_group(device.id), {
                    "type": "message.acknowledged",
                    "message_id": str(msg.id),
                })
            except Exception:
                pass

        return Response({"ok": True})


# --------------------------------------------------------------------------- #
# Browser test harness pages (DEBUG only)
# --------------------------------------------------------------------------- #
# These let us exercise the full WebRTC pipeline without the Electron app:
# the agent page captures the screen in-browser (Electron is just a Chromium
# wrapper around the same code), and the viewer page is a stand-in for the
# dashboard UI. They are served only when DEBUG is on, never in production.

def agent_page(request):
    if not settings.DEBUG:
        raise Http404
    return render(request, "monitoring/agent.html")


def viewer_page(request):
    if not settings.DEBUG:
        raise Http404
    return render(request, "monitoring/viewer.html")
