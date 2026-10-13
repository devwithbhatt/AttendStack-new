"""
HTTP API for Live Monitoring.

* Agent (device token auth): register, heartbeat.
* Company Admin (JWT): device roster, deregister, audit log, agent download.

The live screen stream itself is WebRTC and does not touch these views — see
``consumers.py`` for signalling.
"""

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
from .models import MonitoredDevice, MonitoringSession
from .serializers import (
    DeviceRegisterSerializer,
    MonitoredDeviceSerializer,
    MonitoringSessionSerializer,
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
        return Response({"ok": True, "ice_servers": build_ice_servers()})


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
        from django.conf import settings

        path = settings.MEDIA_ROOT / "monitoring" / "agent" / "ZuperHRMonitor-Setup.exe"
        if not path.exists():
            return Response(
                {"detail": "Agent installer is not available yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            open(path, "rb"),
            as_attachment=True,
            filename="ZuperHRMonitor-Setup.exe",
        )


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
