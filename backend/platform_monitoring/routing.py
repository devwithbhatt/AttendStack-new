from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Platform monitor app (authenticated by ?device_token=...)
    re_path(r"ws/platform-monitor/agent/$", consumers.PlatformAgentConsumer.as_asgi()),
    # Super Admin viewer (authenticated by ?token=<JWT> via JWTAuthMiddleware)
    re_path(r"ws/platform-monitor/view/(?P<device_id>[^/]+)/$", consumers.PlatformViewerConsumer.as_asgi()),
]
