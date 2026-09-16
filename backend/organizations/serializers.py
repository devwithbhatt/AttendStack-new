from rest_framework import serializers
from django.utils import timezone
from .models import Organization
from employees.models import Employee, EmployeeStatus
from attendance.models import AttendanceRecord

class OrganizationSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.get_full_name", read_only=True)
    owner_email = serializers.CharField(source="owner.email", read_only=True)
    can_manage_invite_code = serializers.SerializerMethodField()
    employee_count = serializers.SerializerMethodField()
    active_employee_count = serializers.SerializerMethodField()
    today_attendance_count = serializers.SerializerMethodField()
    is_simplyjob_linked = serializers.SerializerMethodField()
    plan_features = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "invite_code",
            "external_company_id",
            "external_source",
            "api_key",
            "phone",
            "email",
            "website",
            "location",
            "industry",
            "plan_name",
            "plan_expires_at",
            "plan_status",
            "plan_source",
            "max_employees",
            "days_until_plan_expiry",
            "is_plan_expiring_soon",
            "is_plan_expired",
            "is_simplyjob_linked",
            "plan_features",
            "owner",
            "owner_name",
            "owner_email",
            "created_at",
            "is_active",
            "can_manage_invite_code",
            "employee_count",
            "active_employee_count",
            "today_attendance_count",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "owner_name",
            "owner_email",
            "invite_code",
            "days_until_plan_expiry",
            "is_plan_expiring_soon",
            "is_plan_expired",
            "plan_features",
        ]

    def get_plan_features(self, obj):
        from .models import Plan
        plan_name = obj.plan_name or ""
        plan = Plan.objects.filter(name__iexact=plan_name, is_active=True).first()
        if not plan:
            # Check by slug
            plan = Plan.objects.filter(slug__iexact=plan_name.lower().replace(" ", "-"), is_active=True).first()

        if plan:
            return {
                "allows_employees": plan.allows_employees,
                "allows_attendance": plan.allows_attendance,
                "allows_geofencing": plan.allows_geofencing,
                "allows_holidays": plan.allows_holidays,
                "allows_payroll_reports": plan.allows_payroll_reports,
                "allows_leaves": plan.allows_leaves,
                "allows_projects_tasks": plan.allows_projects_tasks,
                "allows_chat": plan.allows_chat,
                "allows_custom_shifts": plan.allows_custom_shifts,
                "allows_auto_checkout": plan.allows_auto_checkout,
                "allows_dedicated_api": plan.allows_dedicated_api,
                "allows_simplyjob_sync": plan.allows_simplyjob_sync,
            }

        if obj.plan_source == "SIMPLYJOB":
            return {
                "allows_employees": True,
                "allows_attendance": True,
                "allows_geofencing": False,
                "allows_holidays": True,
                "allows_payroll_reports": False,
                "allows_leaves": True,
                "allows_projects_tasks": False,
                "allows_chat": False,
                "allows_custom_shifts": False,
                "allows_auto_checkout": False,
                "allows_dedicated_api": False,
                "allows_simplyjob_sync": True,
            }

        return {
            "allows_employees": True,
            "allows_attendance": True,
            "allows_geofencing": True,
            "allows_holidays": True,
            "allows_payroll_reports": True,
            "allows_leaves": True,
            "allows_projects_tasks": True,
            "allows_chat": True,
            "allows_custom_shifts": True,
            "allows_auto_checkout": True,
            "allows_dedicated_api": False,
            "allows_simplyjob_sync": True,
        }

    def get_is_simplyjob_linked(self, obj):
        return bool(obj.external_company_id or obj.external_source == "SIMPLYJOB")

    def get_can_manage_invite_code(self, obj):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or getattr(request.user, "role", "") in ["SUPER_ADMIN", "HR"]
            or getattr(request.user, "is_staff", False)
            or obj.owner_id == request.user.id
        )

    def get_employee_count(self, obj):
        return obj.employees.count()

    def get_active_employee_count(self, obj):
        return obj.employees.filter(status=EmployeeStatus.ACTIVE).count()

    def get_today_attendance_count(self, obj):
        today = timezone.localdate()
        return AttendanceRecord.objects.filter(employee__organization=obj, date=today, status__in=["PRESENT", "LATE", "HALF_DAY"]).count()


from django.contrib.auth import get_user_model
User = get_user_model()


class AdministratorSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    organization_name = serializers.SerializerMethodField()
    custom_role_title = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'full_name', 'email', 'role', 'custom_role_title', 'organization_name', 'is_active', 'date_joined')

    def get_full_name(self, obj):
        name = obj.get_full_name()
        return name if name else obj.email.split('@')[0]

    def get_custom_role_title(self, obj):
        if obj.role == "SUPER_ADMIN":
            return "Super Administrator"
        if obj.role == "HR":
            return "Company Administrator (HR)"
        if obj.role == "SUB_ADMIN":
            sub = getattr(obj, "subadmin_profile", None)
            return sub.custom_role_title if sub else "HR Sub-Admin"
        return "Administrator"

    def get_organization_name(self, obj):
        if hasattr(obj, "subadmin_profile") and obj.subadmin_profile:
            return obj.subadmin_profile.organization.name
        org = getattr(obj, 'owned_organizations', None)
        if org:
            first_org = org.first()
            if first_org:
                return first_org.name
        return "Platform Global"


from .models import Plan

class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "monthly_price",
            "yearly_price",
            "max_employees",
            "badge_text",
            "is_popular",
            "is_active",
            "sort_order",
            "allows_employees",
            "allows_attendance",
            "allows_geofencing",
            "allows_holidays",
            "allows_payroll_reports",
            "allows_leaves",
            "allows_projects_tasks",
            "allows_chat",
            "allows_custom_shifts",
            "allows_auto_checkout",
            "allows_dedicated_api",
            "allows_simplyjob_sync",
            "features_list",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


