from django.urls import path

from . import views

app_name = "monitoring"

urlpatterns = [
    # Agent (device token)
    path("devices/register/", views.DeviceRegisterView.as_view(), name="device_register"),
    path("devices/heartbeat/", views.DeviceHeartbeatView.as_view(), name="device_heartbeat"),

    # Company Admin (JWT)
    path("devices/", views.AdminDeviceListView.as_view(), name="device_list"),
    path("devices/<uuid:device_id>/revoke/", views.AdminDeviceRevokeView.as_view(), name="device_revoke"),
    path("devices/<uuid:device_id>/snapshot-settings/", views.DeviceSnapshotSettingsView.as_view(), name="device_snapshot_settings"),
    path("sessions/", views.MonitoringSessionListView.as_view(), name="session_list"),
    path("snapshot-settings/", views.SnapshotSettingsView.as_view(), name="snapshot_settings"),
    path("snapshots/", views.SnapshotListView.as_view(), name="snapshot_list"),
    path("agent/download/", views.AgentDownloadView.as_view(), name="agent_download"),

    # Agent (device token)
    path("agent/snapshot/upload/", views.SnapshotUploadView.as_view(), name="snapshot_upload"),
    path("agent/snapshot/interval/", views.SnapshotIntervalView.as_view(), name="snapshot_interval"),

    # Browser test harness (DEBUG only)
    path("agent/", views.agent_page, name="agent_page"),
    path("viewer/", views.viewer_page, name="viewer_page"),
]
