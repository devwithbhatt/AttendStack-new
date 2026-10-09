"""
WebRTC ICE server configuration (STUN + optional TURN).

The live screen stream travels **peer-to-peer** between the employee's computer
and the admin's browser; it never passes through the AttendStack app server.
ICE servers only help the two peers find each other:

* STUN lets peers discover their public address (free, stateless).
* TURN relays media *only* when a restrictive NAT/firewall blocks the direct
  path. We self-host coturn and mint short-lived, HMAC time-limited credentials
  (coturn's ``use-auth-secret`` / REST API scheme) so a credential can't be
  reused indefinitely.

Everything is env-driven so the MVP runs on public STUN alone, and TURN can be
switched on later by setting ``TURN_HOST`` + ``TURN_SHARED_SECRET`` — no code
change.
"""

import base64
import hashlib
import hmac
import time

from django.conf import settings

# TTL for a minted TURN credential.
_TURN_TTL_SECONDS = 12 * 60 * 60


def _public_stun():
    return [{"urls": "stun:stun.l.google.com:19302"}]


def build_ice_servers():
    """Return an ``iceServers`` list suitable for RTCPeerConnection config."""
    servers = []

    stun_host = getattr(settings, "STUN_HOST", "") or ""
    if stun_host:
        servers.append({"urls": f"stun:{stun_host}"})
    else:
        servers.extend(_public_stun())

    turn_host = getattr(settings, "TURN_HOST", "") or ""
    secret = getattr(settings, "TURN_SHARED_SECRET", "") or ""
    if turn_host and secret:
        # coturn long-term-credential REST scheme: username = "<expiry>:<id>",
        # password = base64(HMAC-SHA1(secret, username)).
        expiry = int(time.time()) + _TURN_TTL_SECONDS
        username = f"{expiry}:attendstack"
        digest = hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
        credential = base64.b64encode(digest).decode()
        servers.append(
            {
                "urls": [
                    f"turn:{turn_host}?transport=udp",
                    f"turn:{turn_host}?transport=tcp",
                ],
                "username": username,
                "credential": credential,
            }
        )

    return servers
