from django.urls import path

from . import views

app_name = "platform_monitoring"

urlpatterns = [
    # Platform monitor app
    path("agent/sign-in/", views.AgentSignInView.as_view(), name="agent_signin"),
    path("agent/heartbeat/", views.AgentHeartbeatView.as_view(), name="agent_heartbeat"),

    # Super Admin
    path("accounts/", views.AccountListCreateView.as_view(), name="account_list"),
    path("accounts/<uuid:account_id>/", views.AccountDetailView.as_view(), name="account_detail"),
    path("accounts/<uuid:account_id>/reset-credentials/", views.AccountResetCredentialsView.as_view(), name="account_reset"),
    path("devices/", views.DeviceListView.as_view(), name="device_list"),
    path("devices/<uuid:device_id>/revoke/", views.DeviceRevokeView.as_view(), name="device_revoke"),
    path("sessions/", views.SessionListView.as_view(), name="session_list"),
    path("agent/download/", views.AgentDownloadView.as_view(), name="agent_download"),
]
