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
    path("devices/<uuid:device_id>/unrevoke/", views.AdminDeviceUnrevokeView.as_view(), name="device_unrevoke"),
    path("devices/<uuid:device_id>/delete/", views.AdminDeviceDeleteView.as_view(), name="device_delete"),
    path("devices/<uuid:device_id>/snapshot-settings/", views.DeviceSnapshotSettingsView.as_view(), name="device_snapshot_settings"),
    path("sessions/", views.MonitoringSessionListView.as_view(), name="session_list"),
    path("snapshot-settings/", views.SnapshotSettingsView.as_view(), name="snapshot_settings"),
    path("snapshots/", views.SnapshotListView.as_view(), name="snapshot_list"),
    path("agent/download/", views.AgentDownloadView.as_view(), name="agent_download"),

    # Agent (device token)
    path("agent/snapshot/upload/", views.SnapshotUploadView.as_view(), name="snapshot_upload"),
    path("agent/snapshot/interval/", views.SnapshotIntervalView.as_view(), name="snapshot_interval"),
    path("agent/activity/upload/", views.ActivityUploadView.as_view(), name="activity_upload"),

    # Activity log & inactivity settings (Company Admin JWT)
    path("activity/", views.ActivityListView.as_view(), name="activity_list"),
    path("inactivity-settings/", views.InactivitySettingsView.as_view(), name="inactivity_settings"),

    # Auto-update (agent)
    path("agent/check-update/", views.AgentCheckUpdateView.as_view(), name="agent_check_update"),
    path("agent/download-update/", views.AgentDownloadUpdateView.as_view(), name="agent_download_update"),

    # Messaging
    path("messages/send/", views.SendMessageView.as_view(), name="send_message"),
    path("messages/", views.MessageStatusView.as_view(), name="message_status"),
    path("agent/messages/pending/", views.AgentPendingMessagesView.as_view(), name="agent_pending_messages"),
    path("agent/messages/<uuid:message_id>/acknowledge/", views.AgentAcknowledgeMessageView.as_view(), name="agent_acknowledge_message"),

    # Uninstall protection
    path("uninstall-password/", views.UninstallPasswordView.as_view(), name="uninstall_password"),
    path("agent/verify-uninstall-password/", views.AgentVerifyUninstallPasswordView.as_view(), name="verify_uninstall_password"),

    # Browser test harness (DEBUG only)
    path("agent/", views.agent_page, name="agent_page"),
    path("viewer/", views.viewer_page, name="viewer_page"),
]
