from django.urls import path
from .views import SystemSettingsView, SettingsChangeLogsView, SyncSimplyJobSettingsView

urlpatterns = [
    path('settings/', SystemSettingsView.as_view(), name='system-settings'),
    path('settings/sync-simplyjob/', SyncSimplyJobSettingsView.as_view(), name='sync-simplyjob-settings'),
    path('settings/logs/', SettingsChangeLogsView.as_view(), name='settings-change-logs'),
]