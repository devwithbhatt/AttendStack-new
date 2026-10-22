"""Serializers for Live Monitoring device registration and admin views."""

from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError
from rest_framework import serializers

from organizations.models import Organization
from organizations.services import get_organization_for_user

from .models import MonitoredDevice, MonitoringSession, SnapshotSettings, DeviceSnapshotOverride, Snapshot, InactivitySettings, ActivityEntry

User = get_user_model()


class DeviceRegisterSerializer(serializers.Serializer):
    """First-time agent registration.

    Validates, in order, exactly as the product flow requires:
      Organisation ID  →  employee account under that organisation  →
      login email  →  password.

    All three must line up with one real, active employee account.
    """

    organization_id = serializers.CharField(
        help_text="The organisation's invite code (e.g. ORG-XXXXXXXX)."
    )
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    # Device identity, generated and persisted by the agent on first run.
    device_fingerprint = serializers.CharField(max_length=128)
    device_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    platform = serializers.ChoiceField(
        choices=MonitoredDevice.Platform.choices,
        default=MonitoredDevice.Platform.WINDOWS,
    )
    consent_acknowledged = serializers.BooleanField(default=False)

    # Populated during validate().
    _user = None
    _organization = None

    def _resolve_org(self, raw_id):
        """Look up an organisation by invite code, then external id, then pk."""
        raw = (raw_id or "").strip()
        org = Organization.objects.filter(invite_code__iexact=raw, is_active=True).first()
        if org:
            return org
        org = Organization.objects.filter(
            external_company_id__iexact=raw, is_active=True
        ).first()
        if org:
            return org
        # Last resort: allow a raw numeric/UUID primary key.
        try:
            return Organization.objects.filter(pk=raw, is_active=True).first()
        except (ValueError, TypeError, ValidationError):
            return None

    def validate(self, attrs):
        generic = "Organisation ID, email, or password is incorrect."

        org = self._resolve_org(attrs["organization_id"])
        if org is None:
            raise serializers.ValidationError({"organization_id": generic})

        # Validate the login credentials against the real account.
        user = authenticate(username=attrs["email"], password=attrs["password"])
        if user is None:
            # authenticate() returns None for a wrong password OR unknown email;
            # keep the message generic so we don't leak which part was wrong.
            raise serializers.ValidationError({"detail": generic})
        if not user.is_active:
            raise serializers.ValidationError({"detail": "This account is disabled."})

        # Any active staff member may register their work computer — employees
        # and sub-admins/managers alike. The only accounts excluded are the
        # platform Super Admin and the Primary Company Admin — i.e. the person
        # who created this company (the organisation's owner) — who run the
        # monitoring rather than being monitored.
        is_platform_admin = getattr(user, "is_superuser", False) or getattr(user, "role", "") == "SUPER_ADMIN"
        is_primary_company_admin = org.owner_id is not None and org.owner_id == user.id
        if is_platform_admin or is_primary_company_admin:
            raise serializers.ValidationError(
                {"detail": "The Primary Company Admin (the account that created the company) "
                           "cannot register a monitored device. Use an employee or manager account."}
            )

        # The account must actually belong to the organisation they entered.
        user_org = get_organization_for_user(user)
        if user_org is None or user_org.pk != org.pk:
            raise serializers.ValidationError({"detail": generic})

        if not attrs.get("consent_acknowledged"):
            raise serializers.ValidationError(
                {"consent_acknowledged": "Monitoring consent must be acknowledged to register."}
            )

        self._user = user
        self._organization = org
        return attrs


class MonitoredDeviceSerializer(serializers.ModelSerializer):
    """Admin-facing roster row."""

    employee_name = serializers.SerializerMethodField()
    is_online = serializers.BooleanField(read_only=True)

    class Meta:
        model = MonitoredDevice
        fields = [
            "id",
            "employee_name",
            "device_name",
            "platform",
            "is_active",
            "is_online",
            "last_seen_at",
            "last_active_at",
            "created_at",
        ]

    def get_employee_name(self, obj):
        if obj.employee_id and obj.employee:
            return obj.employee.full_name
        return obj.user.get_full_name() or obj.user.email


class MonitoringSessionSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = MonitoringSession
        fields = [
            "id",
            "viewer_email",
            "watched_user_email",
            "device_label",
            "started_at",
            "ended_at",
            "duration_seconds",
            "viewer_ip",
        ]


class SnapshotSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SnapshotSettings
        fields = ["interval_minutes", "retention_days", "is_enabled", "updated_at"]
        read_only_fields = ["updated_at"]


class DeviceSnapshotOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceSnapshotOverride
        fields = ["device", "interval_minutes", "updated_at"]
        read_only_fields = ["updated_at"]


class SnapshotSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source="device.device_name", read_only=True)
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = Snapshot
        fields = ["id", "device", "device_name", "employee_name", "image", "captured_at"]

    def get_employee_name(self, obj):
        if obj.device.employee_id and obj.device.employee:
            return obj.device.employee.full_name
        return obj.device.user.get_full_name() or obj.device.user.email


class InactivitySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = InactivitySettings
        fields = ["idle_threshold_minutes", "long_interval_threshold_minutes", "updated_at"]
        read_only_fields = ["updated_at"]


class ActivityEntrySerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source="device.device_name", read_only=True)
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = ActivityEntry
        fields = [
            "id", "device", "device_name", "employee_name",
            "title", "app_name", "url", "started_at", "ended_at", "duration_seconds",
        ]

    def get_employee_name(self, obj):
        if obj.device.employee_id and obj.device.employee:
            return obj.device.employee.full_name
        return obj.device.user.get_full_name() or obj.device.user.email

