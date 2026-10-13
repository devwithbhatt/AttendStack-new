"""
Serve sensitive media behind a signed-URL check.

nginx proxies the protected ``/media/`` prefixes here; this view validates the
``?md5=...&expires=...`` signature (produced by ``media_signing.build_media_url``)
and, on success, hands the file back to nginx via ``X-Accel-Redirect`` so nginx
streams it efficiently from an internal location — Django never streams the
bytes itself. An invalid signature is 403, an expired one is 410.
"""

import posixpath

from django.conf import settings
from django.http import (
    Http404,
    HttpResponse,
    HttpResponseForbidden,
    HttpResponseGone,
)

from .media_signing import verify_signed_request

# nginx internal location that maps back onto MEDIA_ROOT.
INTERNAL_PREFIX = "/_protected_media/"


def serve_protected_media(request, path):
    status = verify_signed_request(
        request.path, request.GET.get("md5"), request.GET.get("expires")
    )
    if status == "expired":
        return HttpResponseGone("This link has expired.")
    if status != "ok":
        return HttpResponseForbidden("Invalid or missing signature.")

    # Defang path traversal: normalise and reject anything climbing out.
    safe = posixpath.normpath("/" + path).lstrip("/")
    if not safe or safe.startswith("../") or "/../" in ("/" + safe):
        return HttpResponseForbidden("Bad path.")

    full = (settings.MEDIA_ROOT / safe)
    if not full.is_file():
        raise Http404("Not found.")

    resp = HttpResponse()
    # Let nginx serve the bytes and set the content type from its mime map.
    resp["X-Accel-Redirect"] = INTERNAL_PREFIX + safe
    del resp["Content-Type"]
    return resp
