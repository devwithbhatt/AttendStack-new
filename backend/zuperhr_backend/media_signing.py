"""
Signed URLs for sensitive media (nginx ``secure_link``).

Problem: nginx serves ``/media/`` as a public alias, so anything under it is
downloadable by anyone with the URL — including employee ID documents
(Aadhaar / PAN / CV) and chat attachments. That is unauthenticated PII/file
exposure.

Fix: for the *sensitive* media prefixes only, nginx requires a short-lived HMAC
signature (``?md5=...&expires=...``) and returns 403 otherwise. The backend
emits already-signed URLs from the serializers, so the frontend needs no
changes (it just uses the URL it is given) and display assets (logos, avatars,
profile photos) stay public so nothing visual breaks.

The signature must match nginx exactly:

    secure_link_md5 "$secure_link_expires$uri <MEDIA_SIGNING_SECRET>";

i.e. md5(  "<expires><decoded-uri-path> <secret>"  ), base64url, no padding.
We build the *decoded* path from ``MEDIA_URL + file.name`` (what nginx sees as
``$uri``) while handing the client the normal (percent-encoded) URL.
"""

import base64
import hashlib
import hmac
import time

from django.conf import settings

# Media name prefixes that must be signed. Everything else stays public.
PROTECTED_PREFIXES = (
    "employees/aadhaar/",
    "employees/pan/",
    "employees/cv/",
    "chat_attachments/",
)


def _is_protected(name: str) -> bool:
    return bool(name) and name.lstrip("/").startswith(PROTECTED_PREFIXES)


def build_media_url(request, file_field):
    """Absolute URL for a FileField, signed iff it is under a protected prefix.

    Returns ``None`` for an empty field. Falls back to the plain URL when no
    signing secret is configured (e.g. local dev), so nothing breaks there.
    """
    if not file_field:
        return None

    url = file_field.url
    abs_url = request.build_absolute_uri(url) if request else url

    name = getattr(file_field, "name", "") or ""
    secret = getattr(settings, "MEDIA_SIGNING_SECRET", "") or ""
    if not secret or not _is_protected(name):
        return abs_url

    ttl = getattr(settings, "MEDIA_SIGNED_TTL", 86400)
    expires = int(time.time()) + int(ttl)

    media_prefix = settings.MEDIA_URL if settings.MEDIA_URL.startswith("/") else "/" + settings.MEDIA_URL
    uri = media_prefix.rstrip("/") + "/" + name.lstrip("/")  # decoded $uri nginx sees

    token = _token(uri, expires, secret)
    sep = "&" if "?" in abs_url else "?"
    return f"{abs_url}{sep}md5={token}&expires={expires}"


def _token(uri: str, expires: int, secret: str) -> str:
    digest = hashlib.md5(f"{expires}{uri} {secret}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def verify_signed_request(uri_path: str, md5: str, expires: str) -> str:
    """Validate a signed media request. Returns 'ok', 'expired', or 'bad'.

    ``uri_path`` is the decoded request path (e.g. ``/media/employees/...``),
    matching exactly what :func:`build_media_url` signed.
    """
    secret = getattr(settings, "MEDIA_SIGNING_SECRET", "") or ""
    if not secret or not md5 or not expires:
        return "bad"
    try:
        exp = int(expires)
    except (TypeError, ValueError):
        return "bad"
    if not hmac.compare_digest(_token(uri_path, exp, secret), md5):
        return "bad"
    if exp < int(time.time()):
        return "expired"
    return "ok"
