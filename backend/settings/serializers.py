from rest_framework import serializers
from .models import SystemSettings, SettingsChangeLog


class SettingsChangeLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True)
    
    class Meta:
        model = SettingsChangeLog
        fields = [
            "id", "field_name", "old_value", "new_value", 
            "changed_at", "changed_by_name", "ip_address"
        ]


class SystemSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]
        
    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Format time fields to HH:MM for frontend
        time_fields = [
            "shift_start_time", "late_cutoff_time", 
            "shift_end_time", "auto_checkout_time"
        ]
        for field in time_fields:
            if data[field]:
                data[field] = data[field][:5]  # Convert "10:15:00" to "10:15"
        return data


class SystemSettingsUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")
        
    def validate_working_days(self, value):
        valid_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for day in value:
            if day not in valid_days:
                raise serializers.ValidationError(f"Invalid day: {day}")
        return value

    def validate(self, attrs):
        enabled = attrs.get(
            "geofencing_enabled",
            getattr(self.instance, "geofencing_enabled", False),
        )
        latitude = attrs.get(
            "office_latitude",
            getattr(self.instance, "office_latitude", None),
        )
        longitude = attrs.get(
            "office_longitude",
            getattr(self.instance, "office_longitude", None),
        )
        radius = attrs.get(
            "geofence_radius",
            getattr(self.instance, "geofence_radius", None),
        )

        if enabled and (latitude is None or longitude is None):
            raise serializers.ValidationError(
                "Office latitude and longitude must be configured when geofencing is enabled."
            )

        if latitude is not None and not (-90 <= float(latitude) <= 90):
            raise serializers.ValidationError({
                "office_latitude": "Latitude must be between -90 and 90 degrees."
            })

        if longitude is not None and not (-180 <= float(longitude) <= 180):
            raise serializers.ValidationError({
                "office_longitude": "Longitude must be between -180 and 180 degrees."
            })

        if radius is not None and int(radius) <= 0:
            raise serializers.ValidationError({
                "geofence_radius": "Geofence radius must be a positive integer."
            })

        return attrs