"""
WebRTC signalling for Live Monitoring.

The video never flows through here. These consumers only relay the small
WebRTC handshake (SDP offer/answer + ICE candidates) between two peers:

    Employee agent  ⇄  (signalling relay)  ⇄  Company Admin browser

Once the handshake completes, the screen streams peer-to-peer (TURN-relayed
only if a firewall forces it). The agent is the offerer because it owns the
media; the admin's browser only ever *receives* a track and has no data channel
or control path back.

Two consumers share one Redis channel group per device,
``monitor_device_<device_id>``:

* :class:`AgentConsumer` – authenticated by device token; marks the device
  online, streams on demand, heartbeats.
* :class:`ViewerConsumer` – authenticated by the admin's JWT (via the project's
  existing ``JWTAuthMiddleware``); opens an audit session, asks the agent to
  start, relays the handshake, closes the session on disconnect.

Relay rule: every signalling payload is broadcast to the device group tagged
with the sender's role; a consumer forwards it to its socket only when the tag
is the *other* role. Simple and correct for the one-viewer-per-device MVP.
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .auth import get_device_from_token
from .ice import build_ice_servers

logger = logging.getLogger(__name__)

ROLE_AGENT = "agent"
ROLE_VIEWER = "viewer"


def _group(device_id) -> str:
    return f"monitor_device_{device_id}"


class AgentConsumer(AsyncWebsocketConsumer):
    """The employee computer's background agent."""

    async def connect(self):
        qs = self.scope.get("query_string", b"").decode("utf-8")
        from urllib.parse import parse_qs

        token = parse_qs(qs).get("device_token", [None])[0]
        self.device = await get_device_from_token(token)
        if self.device is None:
            await self.close(code=4001)
            return

        self.device_id = str(self.device.id)
        self.group_name = _group(self.device_id)

        await self.accept()
        await self._mark_seen(active=True)
        try:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        except Exception as e:  # pragma: no cover
            logger.warning("monitor: agent group_add failed: %s", e)

        await self.send(text_data=json.dumps({
            "type": "ready",
            "ice_servers": build_ice_servers(),
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            try:
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
            except Exception:
                pass

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (ValueError, TypeError):
            return
        action = data.get("action")

        if action == "heartbeat":
            await self._mark_seen(active=bool(data.get("active", False)))
            return

        # Relay the agent's handshake (offer / ICE) to the viewer.
        if action in ("offer", "answer", "ice", "stream_error"):
            await self.channel_layer.group_send(self.group_name, {
                "type": "signal.relay",
                "from_role": ROLE_AGENT,
                "action": action,
                "session": data.get("session"),
                "payload": data.get("payload"),
            })

    # ---- group events ---- #
    async def signal_relay(self, event):
        # Deliver only messages coming from the *other* role.
        if event.get("from_role") == ROLE_AGENT:
            return
        await self.send(text_data=json.dumps({
            "type": event["action"],
            "session": event.get("session"),
            "payload": event.get("payload"),
        }))

    async def viewer_joined(self, event):
        await self.send(text_data=json.dumps({
            "type": "viewer_joined",
            "session": event.get("session"),
        }))

    async def viewer_left(self, event):
        await self.send(text_data=json.dumps({
            "type": "viewer_left",
            "session": event.get("session"),
        }))

    async def admin_message(self, event):
        logger.info("AgentConsumer.admin_message CALLED device=%s", getattr(self, "device_id", "?"))
        await self.send(text_data=json.dumps({
            "type": "admin_message",
            "message_id": event["message_id"],
            "sender_name": event.get("sender_name", ""),
            "content": event["content"],
            "created_at": event.get("created_at", ""),
        }))
        logger.info("AgentConsumer.admin_message SENT to websocket")

    async def message_acknowledged(self, event):
        pass

    @database_sync_to_async
    def _mark_seen(self, active=False):
        self.device.touch_seen(active=active)


class ViewerConsumer(AsyncWebsocketConsumer):
    """A Company Admin watching one device's screen, read-only."""

    async def connect(self):
        self.user = self.scope.get("user")
        self.device_id = self.scope["url_route"]["kwargs"]["device_id"]

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.device = await self._authorized_device(self.user, self.device_id)
        if self.device is None:
            # Not an admin of this device's org, or device missing/revoked.
            await self.close(code=4003)
            return

        self.group_name = _group(self.device_id)
        self.session = await self._open_session()

        await self.accept()
        try:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        except Exception as e:  # pragma: no cover
            logger.warning("monitor: viewer group_add failed: %s", e)

        await self.send(text_data=json.dumps({
            "type": "ready",
            "ice_servers": build_ice_servers(),
            "session": str(self.session.id),
        }))
        # Ask the agent to start capturing and send an offer.
        await self.channel_layer.group_send(self.group_name, {
            "type": "viewer.joined",
            "session": str(self.session.id),
        })

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            try:
                await self.channel_layer.group_send(self.group_name, {
                    "type": "viewer.left",
                    "session": str(getattr(self, "session", "") and self.session.id),
                })
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
            except Exception:
                pass
        if getattr(self, "session", None):
            await self._close_session()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (ValueError, TypeError):
            return
        action = data.get("action")
        # The admin browser only ever answers and trickles ICE. No control path.
        if action in ("answer", "ice"):
            await self.channel_layer.group_send(self.group_name, {
                "type": "signal.relay",
                "from_role": ROLE_VIEWER,
                "action": action,
                "session": data.get("session"),
                "payload": data.get("payload"),
            })

    # ---- group events ---- #
    async def signal_relay(self, event):
        if event.get("from_role") == ROLE_VIEWER:
            return
        await self.send(text_data=json.dumps({
            "type": event["action"],
            "session": event.get("session"),
            "payload": event.get("payload"),
        }))

    async def viewer_joined(self, event):
        pass

    async def viewer_left(self, event):
        pass

    async def admin_message(self, event):
        pass

    async def message_acknowledged(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_acknowledged",
            "message_id": event["message_id"],
        }))

    # ---- db helpers ---- #
    @database_sync_to_async
    def _authorized_device(self, user, device_id):
        from organizations.services import get_organization_for_user
        from .models import MonitoredDevice

        qs = MonitoredDevice.objects.select_related("organization", "user").filter(
            id=device_id, is_active=True
        )

        # Super Admin / superuser: platform oversight — may watch any tenant's
        # device (the device_id only ever reaches them via an org-scoped roster).
        if user.is_superuser or getattr(user, "role", "") == "SUPER_ADMIN":
            return qs.first()

        # Everyone else: a full-access admin, or someone whose Role grants
        # Live Monitoring (never an admin's device), and only devices of the
        # single organisation they belong to. No cross-tenant access.
        from .access import visible_devices

        org = get_organization_for_user(user)
        if org is None:
            return None
        return visible_devices(user, qs.filter(organization=org)).first()

    @database_sync_to_async
    def _open_session(self):
        from .models import MonitoringSession

        # nginx's /ws/ block forwards the real client IP as X-Real-IP; some
        # setups use X-Forwarded-For. Check both before falling back to the
        # (proxy) socket address, so the audit log records the admin's real IP.
        headers = dict(self.scope.get("headers", []))
        ip = None
        for key in (b"x-real-ip", b"x-forwarded-for"):
            raw = headers.get(key)
            if raw:
                ip = raw.decode().split(",")[0].strip()
                break
        if not ip:
            client = self.scope.get("client")
            ip = client[0] if client else None
        return MonitoringSession.objects.create(
            organization=self.device.organization,
            device=self.device,
            viewer=self.user,
            viewer_email=self.user.email,
            device_label=self.device.device_name or str(self.device.id),
            watched_user_email=self.device.user.email,
            viewer_ip=ip,
        )

    @database_sync_to_async
    def _close_session(self):
        self.session.close()
