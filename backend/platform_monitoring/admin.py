from django.contrib import admin

from .models import PlatformMonitorAccount, PlatformMonitoredDevice, PlatformMonitoringSession


@admin.register(PlatformMonitorAccount)
class PlatformMonitorAccountAdmin(admin.ModelAdmin):
    list_display = ("user_id", "name", "is_active", "last_signin_at", "created_at")
    list_filter = ("is_active",)
    search_fields = ("user_id", "name")
    readonly_fields = ("user_id", "password_hash", "passkey_hash", "created_at", "updated_at",
                       "credentials_reset_at", "last_signin_at", "failed_signin_count", "locked_until")


@admin.register(PlatformMonitoredDevice)
class PlatformMonitoredDeviceAdmin(admin.ModelAdmin):
    list_display = ("device_name", "account", "is_active", "is_online", "last_seen_at")
    list_filter = ("is_active",)
    search_fields = ("device_name", "device_fingerprint", "account__user_id", "account__name")
    readonly_fields = ("token_hash", "created_at", "last_seen_at", "last_active_at", "revoked_at")


@admin.register(PlatformMonitoringSession)
class PlatformMonitoringSessionAdmin(admin.ModelAdmin):
    list_display = ("started_at", "viewer_email", "account_user_id", "account_name", "device_label", "ended_at")
    search_fields = ("viewer_email", "account_user_id", "account_name", "device_label")
    readonly_fields = [f.name for f in PlatformMonitoringSession._meta.fields]
