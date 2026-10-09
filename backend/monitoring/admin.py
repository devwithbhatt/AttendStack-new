from django.contrib import admin

from .models import MonitoredDevice, MonitoringSession


@admin.register(MonitoredDevice)
class MonitoredDeviceAdmin(admin.ModelAdmin):
    list_display = ("device_name", "user", "organization", "platform", "is_active", "is_online", "last_seen_at")
    list_filter = ("is_active", "platform", "organization")
    search_fields = ("device_name", "device_fingerprint", "user__email")
    readonly_fields = ("token_hash", "created_at", "last_seen_at", "last_active_at", "revoked_at")


@admin.register(MonitoringSession)
class MonitoringSessionAdmin(admin.ModelAdmin):
    list_display = ("started_at", "viewer_email", "watched_user_email", "device_label", "ended_at", "duration_seconds")
    list_filter = ("organization", "started_at")
    search_fields = ("viewer_email", "watched_user_email", "device_label")
    readonly_fields = [f.name for f in MonitoringSession._meta.fields]
