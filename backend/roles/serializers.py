from rest_framework import serializers

from .models import Role, RolePermission
from .registry import MODULE_KEYS, MODULE_REGISTRY


def validate_permission_matrix(data):
    if not isinstance(data, dict):
        raise serializers.ValidationError("permissions must be an object of {module: {view, edit, delete}}.")
    cleaned = {}
    for module, flags in data.items():
        if module not in MODULE_KEYS:
            raise serializers.ValidationError(f"Unknown module '{module}'.")
        if not isinstance(flags, dict):
            raise serializers.ValidationError(f"Permissions for '{module}' must be an object.")
        view = bool(flags.get("view", False))
        edit = bool(flags.get("edit", False))
        delete = bool(flags.get("delete", False))
        # Keep the matrix internally consistent: delete implies edit implies view.
        if delete:
            edit = True
        if edit:
            view = True
        cleaned[module] = {"view": view, "edit": edit, "delete": delete}
    return cleaned


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    employee_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id", "name", "description", "is_admin", "is_system",
            "permissions", "employee_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_system", "employee_count", "created_at", "updated_at"]

    def get_employee_count(self, obj):
        return obj.assigned_users.count()

    def get_permissions(self, obj):
        return obj.permissions_dict()

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Role name must be at least 2 characters.")
        return value

    def validate(self, attrs):
        if "permissions" in self.initial_data:
            attrs["_permissions"] = validate_permission_matrix(self.initial_data["permissions"])
        return attrs

    def create(self, validated_data):
        permissions = validated_data.pop("_permissions", None)
        validated_data["organization"] = self.context["organization"]
        role = Role.objects.create(**validated_data)
        if permissions:
            self._sync_permissions(role, permissions)
        return role

    def update(self, instance, validated_data):
        permissions = validated_data.pop("_permissions", None)
        if instance.is_system:
            # The seeded Admin role's name/admin-flag are protected; only its
            # description may be edited (there's nothing to configure on an
            # always-full-access role anyway).
            validated_data.pop("name", None)
            validated_data.pop("is_admin", None)
            permissions = None
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if permissions:
            self._sync_permissions(instance, permissions)
        return instance

    def _sync_permissions(self, role: Role, permissions):
        for module, flags in permissions.items():
            RolePermission.objects.update_or_create(
                role=role,
                module=module,
                defaults={
                    "can_view": flags["view"],
                    "can_edit": flags["edit"],
                    "can_delete": flags["delete"],
                },
            )


class ModuleSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()


def get_module_registry_data():
    return MODULE_REGISTRY
