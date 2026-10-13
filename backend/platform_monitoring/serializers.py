"""Serializers for Super Admin Live Monitoring."""

from rest_framework import serializers

from .models import PlatformMonitorAccount, PlatformMonitoredDevice, PlatformMonitoringSession


class AgentSignInSerializer(serializers.Serializer):
    """What the Bhatt Square Watch app sends at sign-in. Credentials are compared
    exactly (case-sensitive) in the view; nothing is normalised here."""

    user_id = serializers.CharField(max_length=10, trim_whitespace=True)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    passkey = serializers.CharField(max_length=32, trim_whitespace=False, write_only=True)

    device_fingerprint = serializers.CharField(max_length=128)
    device_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    platform = serializers.ChoiceField(
        choices=PlatformMonitoredDevice.Platform.choices,
        default=PlatformMonitoredDevice.Platform.WINDOWS,
    )
    consent_acknowledged = serializers.BooleanField(default=False)


class AccountSerializer(serializers.ModelSerializer):
    device_count = serializers.SerializerMethodField()
    online_count = serializers.SerializerMethodField()
    created_by_email = serializers.SerializerMethodField()
    is_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = PlatformMonitorAccount
        fields = [
            "id",
            "user_id",
            "name",
            "note",
            "is_active",
            "is_locked",
            "device_count",
            "online_count",
            "created_by_email",
            "created_at",
            "credentials_reset_at",
            "last_signin_at",
        ]
        read_only_fields = [
            "id", "user_id", "is_locked", "device_count", "online_count",
            "created_by_email", "created_at", "credentials_reset_at", "last_signin_at",
        ]

    def _active_devices(self, obj):
        return [d for d in obj.devices.all() if d.is_active]

    def get_device_count(self, obj):
        return len(self._active_devices(obj))

    def get_online_count(self, obj):
        return sum(1 for d in self._active_devices(obj) if d.is_online)

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by_id and obj.created_by else None

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value


class DeviceSerializer(serializers.ModelSerializer):
    is_online = serializers.BooleanField(read_only=True)
    account_id = serializers.UUIDField(source="account.id", read_only=True)
    account_user_id = serializers.CharField(source="account.user_id", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    account_is_active = serializers.BooleanField(source="account.is_active", read_only=True)

    class Meta:
        model = PlatformMonitoredDevice
        fields = [
            "id",
            "account_id",
            "account_user_id",
            "account_name",
            "account_is_active",
            "device_name",
            "platform",
            "is_active",
            "is_online",
            "last_seen_at",
            "last_active_at",
            "created_at",
        ]


class SessionSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = PlatformMonitoringSession
        fields = [
            "id",
            "viewer_email",
            "account_user_id",
            "account_name",
            "device_label",
            "started_at",
            "ended_at",
            "duration_seconds",
            "viewer_ip",
        ]
