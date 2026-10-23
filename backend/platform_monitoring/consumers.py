"""
WebRTC signalling for Super Admin Live Monitoring.

Same shape as ``monitoring.consumers`` (which is left untouched), with its own
groups, tokens and tables:

    Platform monitor app  ⇄  (signalling relay)  ⇄  Super Admin browser

Only the SDP/ICE handshake passes through here; the screen streams
peer-to-peer. The app is the offerer; the browser only receives.
"""

import json
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from monitoring.ice import build_ice_servers

from .auth import get_device_from_token
from .models import agent_group

logger = logging.getLogger(__name__)

ROLE_AGENT = "agent"
ROLE_VIEWER = "viewer"

# Close codes the app understands: 4001 = signed out (token revoked, account
# disabled or deleted) → show the sign-in screen instead of reconnecting.
CLOSE_SIGNED_OUT = 4001
CLOSE_FORBIDDEN = 4003


def _is_super_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") == "SUPER_ADMIN")
    )


class PlatformAgentConsumer(AsyncWebsocketConsumer):
    """The Bhatt Square Watch app on the person's computer."""

    async def connect(self):
        token = parse_qs(self.scope.get("query_string", b"").decode("utf-8")).get("device_token", [None])[0]
        self.device = await get_device_from_token(token)
        if self.device is None:
            await self.close(code=CLOSE_SIGNED_OUT)
            return

        self.group_name = agent_group(self.device.id)
        await self.accept()
        await self._mark_seen(active=True)
        try:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        except Exception as e:  # pragma: no cover
            logger.warning("platform monitor: agent group_add failed: %s", e)

        await self.send(text_data=json.dumps({"type": "ready", "ice_servers": build_ice_servers()}))

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
            # Stop at once if the account was disabled/deleted or the device revoked.
            if not await self._still_valid():
                await self.close(code=CLOSE_SIGNED_OUT)
                return
            await self._mark_seen(active=bool(data.get("active", False)))
            return

        if action in ("offer", "ice", "stream_error"):
            await self.channel_layer.group_send(self.group_name, {
                "type": "signal.relay",
                "from_role": ROLE_AGENT,
                "action": action,
                "session": data.get("session"),
                "payload": data.get("payload"),
            })

    # ---- group events ---- #
    async def signal_relay(self, event):
        if event.get("from_role") == ROLE_AGENT:
            return
        await self.send(text_data=json.dumps({
            "type": event["action"],
            "session": event.get("session"),
            "payload": event.get("payload"),
        }))

    async def viewer_joined(self, event):
        await self.send(text_data=json.dumps({"type": "viewer_joined", "session": event.get("session")}))

    async def viewer_left(self, event):
        await self.send(text_data=json.dumps({"type": "viewer_left", "session": event.get("session")}))

    async def agent_kick(self, event):
        await self.close(code=CLOSE_SIGNED_OUT)

    async def admin_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "admin_message",
            "message_id": event["message_id"],
            "sender_name": event.get("sender_name", ""),
            "content": event["content"],
            "created_at": event.get("created_at", ""),
        }))

    async def message_acknowledged(self, event):
        pass

    # ---- db helpers ---- #
    @database_sync_to_async
    def _mark_seen(self, active=False):
        self.device.touch_seen(active=active)

    @database_sync_to_async
    def _still_valid(self):
        from .models import PlatformMonitoredDevice

        return PlatformMonitoredDevice.objects.filter(
            id=self.device.id, is_active=True, account__is_active=True
        ).exists()


class PlatformViewerConsumer(AsyncWebsocketConsumer):
    """A Super Admin watching one platform device's screen, read-only."""

    async def connect(self):
        self.user = self.scope.get("user")
        device_id = self.scope["url_route"]["kwargs"]["device_id"]

        if not _is_super_admin(self.user):
            await self.close(code=CLOSE_FORBIDDEN)
            return

        self.device = await self._get_device(device_id)
        if self.device is None:
            await self.close(code=CLOSE_FORBIDDEN)
            return

        self.group_name = agent_group(self.device.id)
        self.session = await self._open_session()

        await self.accept()
        try:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        except Exception as e:  # pragma: no cover
            logger.warning("platform monitor: viewer group_add failed: %s", e)

        await self.send(text_data=json.dumps({
            "type": "ready",
            "ice_servers": build_ice_servers(),
            "session": str(self.session.id),
        }))
        await self.channel_layer.group_send(self.group_name, {
            "type": "viewer.joined",
            "session": str(self.session.id),
        })

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            try:
                await self.channel_layer.group_send(self.group_name, {
                    "type": "viewer.left",
                    "session": str(self.session.id) if getattr(self, "session", None) else "",
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
        # The browser only answers and trickles ICE. No control path.
        if data.get("action") in ("answer", "ice"):
            await self.channel_layer.group_send(self.group_name, {
                "type": "signal.relay",
                "from_role": ROLE_VIEWER,
                "action": data.get("action"),
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

    async def agent_kick(self, event):
        await self.close()

    async def admin_message(self, event):
        pass

    async def message_acknowledged(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_acknowledged",
            "message_id": event["message_id"],
        }))

    # ---- db helpers ---- #
    @database_sync_to_async
    def _get_device(self, device_id):
        from django.core.exceptions import ValidationError

        from .models import PlatformMonitoredDevice

        try:
            return (
                PlatformMonitoredDevice.objects.select_related("account")
                .filter(id=device_id, is_active=True, account__is_active=True)
                .first()
            )
        except (ValidationError, ValueError):
            return None

    @database_sync_to_async
    def _open_session(self):
        from .models import PlatformMonitoringSession

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
        return PlatformMonitoringSession.objects.create(
            device=self.device,
            viewer=self.user,
            viewer_email=self.user.email,
            account_user_id=self.device.account.user_id,
            account_name=self.device.account.name,
            device_label=self.device.device_name or str(self.device.id),
            viewer_ip=ip,
        )

    @database_sync_to_async
    def _close_session(self):
        self.session.close()
