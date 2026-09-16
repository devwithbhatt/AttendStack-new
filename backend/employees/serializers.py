import re

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.models import UserRole
from .models import Employee, EmployeeStatus
from .services import sync_employee_user_email

User = get_user_model()
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024


def _validate_document(value, allowed_extensions, label):
    if value and value.size > MAX_DOCUMENT_SIZE_BYTES:
        raise serializers.ValidationError(f"{label} cannot exceed 10 MB.")
    if value and not value.name.lower().endswith(allowed_extensions):
        raise serializers.ValidationError(f"Upload a valid {label} file.")
    return value


class EmployeeProfileSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    aadhaar_document_url = serializers.SerializerMethodField()
    pan_card_document_url = serializers.SerializerMethodField()
    cv_document_url = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            "full_name",
            "phone",
            "date_of_birth",
            "address",
            "profile_photo",
            "profile_photo_url",
            "aadhaar_number",
            "tax_id",
            "aadhaar_document",
            "aadhaar_document_url",
            "pan_card_document",
            "pan_card_document_url",
            "cv_document",
            "cv_document_url",
            "emergency_contact_name",
            "emergency_contact_relationship",
            "emergency_contact_phone",
        ]
        read_only_fields = ["profile_photo_url", "aadhaar_document_url", "pan_card_document_url", "cv_document_url"]

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a valid name.")
        return value

    def validate_aadhaar_number(self, value):
        value = value.strip()
        if not value:
            return value
        if not re.fullmatch(r"^[0-9]{12}$", value):
            raise serializers.ValidationError("Enter a valid 12-digit Aadhaar number.")
        return value

    def validate_tax_id(self, value):
        value = value.strip().upper()
        if not value:
            return value
        if len(value) < 6:
            raise serializers.ValidationError("Enter a valid PAN or tax ID.")
        return value

    def get_profile_photo_url(self, obj):
        return self._absolute_file_url(obj.profile_photo)

    def get_aadhaar_document_url(self, obj):
        return self._absolute_file_url(obj.aadhaar_document)

    def get_pan_card_document_url(self, obj):
        return self._absolute_file_url(obj.pan_card_document)

    def get_cv_document_url(self, obj):
        return self._absolute_file_url(obj.cv_document)

    def _absolute_file_url(self, file_field):
        if not file_field:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(file_field.url) if request else file_field.url

    def validate_aadhaar_document(self, value):
        return _validate_document(value, (".pdf", ".jpg", ".jpeg", ".png", ".webp"), "Aadhaar document")

    def validate_pan_card_document(self, value):
        return _validate_document(value, (".pdf", ".jpg", ".jpeg", ".png", ".webp"), "PAN card")

    def validate_cv_document(self, value):
        return _validate_document(value, (".pdf", ".doc", ".docx"), "CV")


class EmployeeListSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    account_exists = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    status_effective_date = serializers.SerializerMethodField()
    auto_transition_status_label = serializers.CharField(
        source="get_auto_transition_status_display", read_only=True, allow_null=True
    )

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_id",
            "full_name",
            "email",
            "department",
            "designation",
            "joining_date",
            "profile_photo_url",
            "account_exists",
            "status",
            "status_label",
            "status_effective_date",
            "status_end_date",
            "auto_transition_status",
            "auto_transition_status_label",
            "annual_salary",
        ]

    def get_profile_photo_url(self, obj):
        if not obj.profile_photo:
            return None
        request = self.context.get("request")
        url = obj.profile_photo.url
        return request.build_absolute_uri(url) if request else url

    def get_account_exists(self, obj):
        annotated_value = getattr(obj, "account_exists_annotation", None)
        if annotated_value is not None:
            return bool(annotated_value)
        return User.objects.filter(email__iexact=obj.email, role=UserRole.EMPLOYEE).exists()

    def get_status_effective_date(self, obj):
        match = obj.status_history.filter(status=obj.status).order_by("-created_at", "-pk").first()
        if match and match.effective_date:
            return str(match.effective_date)
        latest = obj.status_history.order_by("-created_at", "-pk").first()
        if latest and latest.effective_date:
            return str(latest.effective_date)
        return str(obj.joining_date) if obj.joining_date else None

class EmployeeDirectorySerializer(serializers.ModelSerializer):
    """Safe employee directory serializer for non-admin/regular employee views (zero salary or private PII)."""
    profile_photo_url = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_id",
            "full_name",
            "email",
            "department",
            "designation",
            "joining_date",
            "profile_photo_url",
            "status",
            "status_label",
        ]

    def get_profile_photo_url(self, obj):
        if not obj.profile_photo:
            return None
        request = self.context.get("request")
        url = obj.profile_photo.url
        return request.build_absolute_uri(url) if request else url


class EmployeeStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=EmployeeStatus.choices)
    effective_date = serializers.DateField(default=timezone.localdate)
    end_date = serializers.DateField(required=False, allow_null=True, default=None)
    auto_transition_status = serializers.ChoiceField(
        choices=EmployeeStatus.choices, required=False, allow_null=True, default=None
    )

    def validate_effective_date(self, value):
        employee = self.context.get("employee")
        if employee and employee.joining_date and value < employee.joining_date:
            raise serializers.ValidationError(f"The effective date cannot be before the joining date ({employee.joining_date}).")
        return value

    def validate(self, data):
        effective_date = data.get("effective_date")
        end_date = data.get("end_date")
        if end_date and effective_date and end_date < effective_date:
            raise serializers.ValidationError({"end_date": "The end date cannot be before the effective date."})
        return data


class EmployeeSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    aadhaar_document_url = serializers.SerializerMethodField()
    pan_card_document_url = serializers.SerializerMethodField()
    cv_document_url = serializers.SerializerMethodField()
    account_exists = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    auto_transition_status_label = serializers.CharField(
        source="get_auto_transition_status_display", read_only=True, allow_null=True
    )
    employment_type_label = serializers.CharField(source="get_employment_type_display", read_only=True)
    pay_frequency_label = serializers.CharField(source="get_pay_frequency_display", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_id",
            "full_name",
            "email",
            "phone",
            "date_of_birth",
            "aadhaar_number",
            "address",
            "profile_photo",
            "profile_photo_url",
            "aadhaar_document",
            "aadhaar_document_url",
            "pan_card_document",
            "pan_card_document_url",
            "cv_document",
            "cv_document_url",
            "account_exists",
            "emergency_contact_name",
            "emergency_contact_relationship",
            "emergency_contact_phone",
            "joining_date",
            "department",
            "designation",
            "employment_type",
            "employment_type_label",
            "reporting_manager",
            "status",
            "status_label",
            "status_end_date",
            "auto_transition_status",
            "auto_transition_status_label",
            "annual_salary",
            "casual_leave_days_override",
            "sick_leave_days_override",
            "override_increment_policy",
            "custom_increment_months",
            "custom_increment_type",
            "custom_increment_value",
            "increment_status",
            "last_increment_date",
            "next_increment_date",
            "pay_frequency",
            "pay_frequency_label",
            "bank_name",
            "bank_account_number",
            "ifsc_code",
            "tax_id",
            "pan_number",
            "pf_number",
            "uan_number",
            "esic_number",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a valid name.")
        return value

    def validate_tax_id(self, value):
        value = value.strip().upper()
        if not value:
            return value
        if len(value) < 6:
            raise serializers.ValidationError("Enter a valid PAN or tax ID.")
        return value

    def validate_ifsc_code(self, value):
        value = value.strip().upper()
        if value and not re.fullmatch(r"^[A-Z]{4}0[A-Z0-9]{6}$", value):
            raise serializers.ValidationError("Enter a valid 11-character IFSC code.")
        return value

    def validate_aadhaar_document(self, value):
        return _validate_document(value, (".pdf", ".jpg", ".jpeg", ".png", ".webp"), "Aadhaar document")

    def validate_pan_card_document(self, value):
        return _validate_document(value, (".pdf", ".jpg", ".jpeg", ".png", ".webp"), "PAN card")

    def validate_cv_document(self, value):
        return _validate_document(value, (".pdf", ".doc", ".docx"), "CV")

    def validate_annual_salary(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Annual salary must be greater than zero.")
        return value

    def update(self, instance, validated_data):
        previous_email = instance.email
        with transaction.atomic():
            employee = super().update(instance, validated_data)
            if employee.email != previous_email:
                sync_employee_user_email(employee, previous_email)
        return employee

    def get_profile_photo_url(self, obj):
        return self._absolute_file_url(obj.profile_photo)

    def get_aadhaar_document_url(self, obj):
        return self._absolute_file_url(obj.aadhaar_document)

    def get_pan_card_document_url(self, obj):
        return self._absolute_file_url(obj.pan_card_document)

    def get_cv_document_url(self, obj):
        return self._absolute_file_url(obj.cv_document)

    def get_account_exists(self, obj):
        annotated_value = getattr(obj, "account_exists_annotation", None)
        if annotated_value is not None:
            return bool(annotated_value)
        return User.objects.filter(email__iexact=obj.email, role=UserRole.EMPLOYEE).exists()

    def _absolute_file_url(self, file_field):
        if not file_field:
            return None
        request = self.context.get("request")
        url = file_field.url
        return request.build_absolute_uri(url) if request else url
