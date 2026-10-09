from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # Employee agent (authenticated by ?device_token=...)
    re_path(r"ws/monitor/agent/$", consumers.AgentConsumer.as_asgi()),
    # Company Admin viewer (authenticated by ?token=<JWT> via JWTAuthMiddleware)
    re_path(r"ws/monitor/view/(?P<device_id>[^/]+)/$", consumers.ViewerConsumer.as_asgi()),
]
