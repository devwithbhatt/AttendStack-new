"""
accounts – serializers
JWT token pair + user profile serializers
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
import re

from accounts.models import UserRole
User = get_user_model()

MB = 1024 * 1024
PROFILE_PHOTO_MAX_SIZE = 5 * MB
EMPLOYEE_DOCUMENT_MAX_SIZE = 5 * MB
EMPLOYEE_REGISTRATION_MAX_UPLOAD_SIZE = 18 * MB


def _split_full_name(full_name):
    parts = full_name.strip().split(maxsplit=1)
    return parts[0], parts[1] if len(parts) > 1 else ""


# ──────────────────────────────────────────────────────────────────────────────
# JWT – enriched token payload
# ──────────────────────────────────────────────────────────────────────────────
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Inject role, name, and employee_id into the JWT payload and return full profile."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"]        = user.role
        token["full_name"]   = user.get_full_name()
        token["email"]       = user.email
        token["employee_id"] = user.employee_id
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Append full user profile with granular RBAC permissions to the response body
        user_profile = UserProfileSerializer(self.user, context=self.context).data
        data["user"] = user_profile

        # Resolve and append organization meta
        try:
            from organizations.services import get_organization_for_user
            org = get_organization_for_user(self.user)
            if org:
                data["organization"] = {
                    "id": org.id,
                    "name": org.name,
                    "invite_code": org.invite_code,
                }
            else:
                data["organization"] = None
        except Exception:
            data["organization"] = None

        return data


# ──────────────────────────────────────────────────────────────────────────────
# User serializers
# ──────────────────────────────────────────────────────────────────────────────
class UserMiniSerializer(serializers.ModelSerializer):
    """Lightweight user representation (for nested use)."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ["id", "email", "full_name", "role", "employee_id", "avatar"]

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserProfileSerializer(serializers.ModelSerializer):
    """Full user profile with organization and granular RBAC permissions."""

    full_name = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    custom_role_title = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "role", "phone", "avatar", "employee_id",
            "permissions", "custom_role_title", "organization",
            "is_active", "date_joined", "last_login",
        ]
        read_only_fields = ["id", "email", "role", "employee_id", "date_joined", "last_login"]

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_custom_role_title(self, obj):
        if obj.role == UserRole.SUPER_ADMIN:
            return "Super Administrator"
        if obj.role == UserRole.HR:
            return "Company Administrator (HR)"
        if obj.role == UserRole.SUB_ADMIN:
            sub = getattr(obj, "subadmin_profile", None)
            if not sub:
                from accounts.models import SubAdminPermission
                sub = SubAdminPermission.objects.filter(user=obj).first()
            return sub.custom_role_title if sub else "HR Sub-Admin"
        return "Employee"

    def get_permissions(self, obj):
        if obj.role in (UserRole.SUPER_ADMIN, UserRole.HR):
            # Full unrestricted access for Super Admins and Primary HR
            all_modules = ["dashboard", "employees", "attendance", "leaves", "holidays", "payroll", "tasks", "chat", "settings", "subadmins"]
            return {mod: {"view": True, "edit": True, "delete": True} for mod in all_modules}
        if obj.role == UserRole.SUB_ADMIN:
            sub = getattr(obj, "subadmin_profile", None)
            if not sub:
                from accounts.models import SubAdminPermission
                sub = SubAdminPermission.objects.filter(user=obj).first()
            if sub and sub.permissions:
                return sub.permissions
            from accounts.models import SubAdminPermission
            return SubAdminPermission.get_default_permissions()
        return {}

    def get_organization(self, obj):
        try:
            from organizations.services import get_organization_for_user
            org = get_organization_for_user(obj)
            if org:
                return {
                    "id": org.id,
                    "name": org.name,
                    "invite_code": org.invite_code,
                }
        except Exception:
            pass
        return None


class UserUpdateSerializer(serializers.ModelSerializer):
    """Allows updating profile fields (not email/role)."""

    class Meta:
        model  = User
        fields = ["first_name", "last_name", "phone", "avatar"]


class ChangePasswordSerializer(serializers.Serializer):
    """Authenticated user changes their own password."""

    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True, validators=[validate_password]
    )
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords do not match."}
            )
        return attrs

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


# ──────────────────────────────────────────────────────────────────────────────
# Admin – Create HR/Employee/SubAdmin users & RBAC
# ──────────────────────────────────────────────────────────────────────────────
class RequestPasswordResetOTPSerializer(serializers.Serializer):
    """Request a password-reset verification code."""

    email = serializers.EmailField()


class ResetPasswordWithOTPSerializer(serializers.Serializer):
    """Reset a password using the emailed verification code."""

    email = serializers.EmailField()
    otp = serializers.RegexField(
        regex=r"^\d{6}$",
        write_only=True,
        error_messages={"invalid": "Enter the 6-digit verification code."},
    )
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords do not match."}
            )
        return attrs


class CreateHRSerializer(serializers.ModelSerializer):
    """Super Admin creates a new HR manager / Company Admin account."""

    password = serializers.CharField(
        write_only=True, required=False, help_text="Leave blank to auto-generate."
    )
    organization_id = serializers.IntegerField(
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model  = User
        fields = ["email", "first_name", "last_name", "phone", "password", "organization_id"]

    def create(self, validated_data):
        from accounts.utils import generate_temp_password
        from organizations.models import Organization

        password = validated_data.pop("password", None) or generate_temp_password()
        org_id = validated_data.pop("organization_id", None)
        email = validated_data.pop("email")

        user = User.objects.create_hr(email=email, password=password, **validated_data)
        user._raw_password = password

        if org_id:
            org = Organization.objects.filter(id=org_id).first()
            if org and not org.owner:
                org.owner = user
                org.save(update_fields=["owner"])

        return user


class SubAdminPermissionSerializer(serializers.ModelSerializer):
    """Serializes a Sub-Admin permission record with full user details."""
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        from accounts.models import SubAdminPermission
        model = SubAdminPermission
        fields = [
            "id",
            "user_id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "is_active",
            "organization",
            "organization_name",
            "custom_role_title",
            "permissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CreateSubAdminSerializer(serializers.Serializer):
    """Company Admin creates a new Sub-Admin with custom granular permissions."""
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    custom_role_title = serializers.CharField(max_length=120, default="HR Manager", required=False)
    permissions = serializers.DictField(required=False, default=dict)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    organization_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return email


class UpdateSubAdminSerializer(serializers.Serializer):
    """Company Admin updates an existing Sub-Admin's role title, active status, or permissions."""
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    custom_role_title = serializers.CharField(max_length=120, required=False)
    permissions = serializers.DictField(required=False)
    is_active = serializers.BooleanField(required=False)


class SimplyJobEmployeeOnboardingSerializer(serializers.Serializer):
    source_company_id = serializers.CharField(max_length=64)
    company_name = serializers.CharField(max_length=255)
    owner_email = serializers.EmailField(required=False, allow_blank=True)
    source_application_id = serializers.CharField(max_length=64)
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.RegexField(r"^\+?[0-9]{10,15}$")
    joining_date = serializers.DateField()
    department = serializers.CharField(max_length=100, required=False, allow_blank=True)
    designation = serializers.CharField(max_length=120, required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    emergency_contact_relationship = serializers.CharField(required=False, allow_blank=True, max_length=80)
    emergency_contact_phone = serializers.RegexField(
        r"^\+?[0-9]{10,15}$",
        required=False,
        allow_blank=True,
    )
    source_payload = serializers.DictField(required=False, default=dict)


class OrganizationRegistrationSerializer(serializers.Serializer):
    """Public first-run setup: creates one company and its HR owner."""

    organization_name = serializers.CharField(max_length=255)
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.RegexField(r"^\+?[0-9]{10,15}$")
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)
    api_key = serializers.CharField(max_length=128, required=False, allow_blank=True, allow_null=True)
    source_company_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    website = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    industry = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    plan_name = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)

    def validate_organization_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter an organization name.")
        return value

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter your full name.")
        return value

    def validate_email(self, value):
        from employees.models import Employee

        if User.objects.filter(email__iexact=value).exists() or Employee.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account already exists with this email address.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        source_company_id = attrs.get("source_company_id")
        if source_company_id:
            from organizations.models import Organization
            existing = Organization.objects.filter(external_company_id=source_company_id, is_active=True).first()
            if existing and existing.owner is not None:
                raise serializers.ValidationError({
                    "organization_name": "An active organization is already registered for this company. Please log in directly."
                })
        return attrs

    def create(self, validated_data):
        from employees.models import Employee
        from organizations.models import Organization

        validated_data.pop("confirm_password")
        source_company_id = validated_data.pop("source_company_id", None) or None
        api_key = validated_data.pop("api_key", None) or None
        website = validated_data.pop("website", None) or None
        location = validated_data.pop("location", None) or None
        industry = validated_data.pop("industry", None) or None
        plan_name = validated_data.pop("plan_name", None) or None

        first_name, last_name = _split_full_name(validated_data["full_name"])
        with transaction.atomic():
            owner = User.objects.create_hr(
                email=validated_data["email"],
                password=validated_data["password"],
                first_name=first_name,
                last_name=last_name,
                phone=validated_data["phone"],
            )
            organization = None
            if source_company_id:
                organization = Organization.objects.filter(external_company_id=source_company_id).first()
                if organization and organization.owner is None:
                    organization.name = validated_data["organization_name"]
                    organization.owner = owner
                    organization.external_source = "SIMPLYJOB"
                    if api_key:
                        organization.api_key = api_key
                    organization.phone = validated_data["phone"]
                    organization.email = validated_data["email"]
                    if website:
                        organization.website = website
                    if location:
                        organization.location = location
                    if industry:
                        organization.industry = industry
                    if plan_name:
                        organization.plan_name = plan_name
                    organization.save()
                elif organization and organization.owner is not None:
                    # Never overwrite an existing active owner
                    organization = None

            if organization is None:
                organization = Organization.objects.create(
                    name=validated_data["organization_name"],
                    owner=owner,
                    external_source="SIMPLYJOB" if (source_company_id or api_key) else "",
                    external_company_id=source_company_id,
                    api_key=api_key,
                    phone=validated_data["phone"],
                    email=validated_data["email"],
                    website=website,
                    location=location,
                    industry=industry,
                    plan_name=plan_name,
                )
            # The owner also receives an employee record so organization scoping works
            # consistently across the HR and workforce modules.
            Employee.objects.update_or_create(
                organization=organization,
                email=validated_data["email"],
                defaults={
                    "full_name": validated_data["full_name"],
                    "phone": validated_data["phone"],
                    "department": "Management",
                    "designation": "Organization Owner",
                },
            )
        return organization


class EmployeeSelfRegistrationSerializer(serializers.Serializer):
    """Public employee onboarding. Employment and pay details are intentionally absent."""

    organization_code = serializers.CharField(max_length=12)
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.RegexField(r"^\+?[0-9]{10,15}$")
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True)
    profile_photo = serializers.ImageField(required=False, write_only=True)
    aadhaar_number = serializers.RegexField(
        r"^[0-9]{12}$", required=False, allow_blank=True, allow_null=True
    )
    aadhaar_document = serializers.FileField(required=False, write_only=True)
    pan_card_document = serializers.FileField(required=False, write_only=True)
    cv_document = serializers.FileField(required=False, write_only=True)
    bank_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    bank_account_number = serializers.CharField(required=False, allow_blank=True, max_length=40)
    ifsc_code = serializers.CharField(required=False, allow_blank=True, max_length=11)
    tax_id = serializers.CharField(required=False, allow_blank=True, max_length=20)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    emergency_contact_relationship = serializers.CharField(required=False, allow_blank=True, max_length=80)
    emergency_contact_phone = serializers.RegexField(
        r"^\+?[0-9]{10,15}$", required=False, allow_blank=True
    )
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    def validate_organization_code(self, value):
        from organizations.models import Organization

        code = value.strip().upper()
        organization = Organization.objects.filter(invite_code__iexact=code, is_active=True).first()
        if organization is None:
            raise serializers.ValidationError("Enter a valid active organization code.")
        self.organization = organization
        return code

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter your full name.")
        return value

    def validate_profile_photo(self, value):
        if value.size > PROFILE_PHOTO_MAX_SIZE:
            raise serializers.ValidationError("Profile photo must be 5 MB or smaller.")
        image_format = getattr(getattr(value, "image", None), "format", "").upper()
        if image_format not in {"JPEG", "PNG", "WEBP"}:
            raise serializers.ValidationError("Upload a JPEG, PNG, or WebP profile photo.")
        return value

    def validate_ifsc_code(self, value):
        value = value.strip().upper()
        if value and not re.fullmatch(r"^[A-Z]{4}0[A-Z0-9]{6}$", value):
            raise serializers.ValidationError("Enter a valid 11-character IFSC code.")
        return value

    def validate_tax_id(self, value):
        value = value.strip().upper()
        if value and len(value) < 6:
            raise serializers.ValidationError("Enter a valid PAN or tax ID.")
        return value

    def _validate_document(self, value, allowed_extensions, label):
        if value.size > EMPLOYEE_DOCUMENT_MAX_SIZE:
            raise serializers.ValidationError(f"{label} must be 5 MB or smaller.")
        if not value.name.lower().endswith(allowed_extensions):
            raise serializers.ValidationError(f"Upload a valid {label} file.")
        return value

    def validate_aadhaar_document(self, value):
        return self._validate_document(value, (".pdf", ".jpg", ".jpeg", ".png", ".webp"), "Aadhaar document")

    def validate_pan_card_document(self, value):
        return self._validate_document(value, (".pdf", ".jpg", ".jpeg", ".png", ".webp"), "PAN card")

    def validate_cv_document(self, value):
        return self._validate_document(value, (".pdf", ".doc", ".docx"), "CV / resume")

    def validate_email(self, value):
        from employees.models import Employee

        if User.objects.filter(email__iexact=value).exists() or Employee.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account or employee record already exists with this email address.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        upload_fields = ("profile_photo", "aadhaar_document", "pan_card_document", "cv_document")
        total_upload_size = sum(getattr(attrs.get(field), "size", 0) for field in upload_fields)
        if total_upload_size > EMPLOYEE_REGISTRATION_MAX_UPLOAD_SIZE:
            raise serializers.ValidationError(
                {"upload_total": "All uploaded files together must be 18 MB or smaller."}
            )
        return attrs

    def create(self, validated_data):
        from employees.models import Employee

        validated_data.pop("confirm_password")
        validated_data.pop("organization_code")
        first_name, last_name = _split_full_name(validated_data["full_name"])
        aadhaar_number = validated_data.pop("aadhaar_number", None) or None
        with transaction.atomic():
            employee = Employee.objects.create(
                organization=self.organization,
                full_name=validated_data["full_name"],
                email=validated_data["email"],
                phone=validated_data["phone"],
                date_of_birth=validated_data.get("date_of_birth"),
                address=validated_data.get("address", ""),
                profile_photo=validated_data.get("profile_photo"),
                aadhaar_number=aadhaar_number,
                aadhaar_document=validated_data.get("aadhaar_document"),
                pan_card_document=validated_data.get("pan_card_document"),
                cv_document=validated_data.get("cv_document"),
                bank_name=validated_data.get("bank_name", ""),
                bank_account_number=validated_data.get("bank_account_number", ""),
                ifsc_code=validated_data.get("ifsc_code", ""),
                tax_id=validated_data.get("tax_id", ""),
                emergency_contact_name=validated_data.get("emergency_contact_name", ""),
                emergency_contact_relationship=validated_data.get("emergency_contact_relationship", ""),
                emergency_contact_phone=validated_data.get("emergency_contact_phone", ""),
            )
            User.objects.create_user(
                email=employee.email,
                password=validated_data["password"],
                first_name=first_name,
                last_name=last_name,
                phone=employee.phone,
                employee_id=employee.employee_id,
            )
        return employee
