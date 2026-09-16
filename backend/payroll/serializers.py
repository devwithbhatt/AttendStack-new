from decimal import Decimal
from rest_framework import serializers
from .models import Payroll
from employees.models import Employee

class EmployeeMiniSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    employment_type_display = serializers.CharField(source="get_employment_type_display", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_id",
            "full_name",
            "email",
            "department",
            "designation",
            "status",
            "status_display",
            "employment_type",
            "employment_type_display",
            "joining_date",
            "bank_name",
            "bank_account_number",
            "ifsc_code",
            "aadhaar_number",
            "pan_number",
            "pf_number",
            "uan_number",
            "esic_number",
            "tax_id",
            "annual_salary",
            "profile_photo_url",
        ]

    def get_profile_photo_url(self, obj):
        if obj.profile_photo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.profile_photo.url)
            return obj.profile_photo.url
        return None

class PayrollSerializer(serializers.ModelSerializer):
    employee_details = EmployeeMiniSerializer(source="employee", read_only=True)
    employee_id = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        source="employee",
        write_only=True
    )
    month_name = serializers.SerializerMethodField()
    payable_salary = serializers.SerializerMethodField()
    attendance_summary = serializers.SerializerMethodField()
    company_details = serializers.SerializerMethodField()
    modified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Payroll
        fields = [
            "id",
            "employee_id",
            "employee_details",
            "company_details",
            "month",
            "year",
            "month_name",
            "basic_salary",
            "allowances",
            "deductions",
            "deduction_details",
            "net_salary",
            "payable_salary",
            "attendance_summary",
            "status",
            "paid_on",
            "modification_reason",
            "modified_by",
            "modified_by_name",
            "is_modified_after_payment",
            "modification_history",
            "created_at",
            "updated_at"
        ]
        read_only_fields = [
            "id",
            "net_salary",
            "paid_on",
            "modified_by",
            "modified_by_name",
            "is_modified_after_payment",
            "modification_history",
            "created_at",
            "updated_at"
        ]

    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return obj.modified_by.get_full_name() or obj.modified_by.username or obj.modified_by.email
        return None

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        if instance and instance.status == "PAID":
            # Check if any financial amount or status is being altered
            from decimal import Decimal
            new_basic = attrs.get("basic_salary", instance.basic_salary)
            new_allowances = attrs.get("allowances", instance.allowances)
            new_deductions = attrs.get("deductions", instance.deductions)
            new_status = attrs.get("status", instance.status)

            has_changed = (
                Decimal(str(new_basic)) != Decimal(str(instance.basic_salary)) or
                Decimal(str(new_allowances)) != Decimal(str(instance.allowances)) or
                Decimal(str(new_deductions)) != Decimal(str(instance.deductions)) or
                new_status != instance.status
            )

            if has_changed:
                reason = (attrs.get("modification_reason") or self.initial_data.get("modification_reason", "")).strip()
                if not reason or len(reason) < 5:
                    raise serializers.ValidationError({
                        "modification_reason": "This salary has already been disbursed as PAID. Altering paid payroll figures requires a mandatory audit remark (minimum 5 characters)."
                    })
                attrs["modification_reason"] = reason

        return attrs

    def update(self, instance, validated_data):
        from decimal import Decimal
        from django.utils import timezone

        if instance.status == "PAID":
            new_basic = validated_data.get("basic_salary", instance.basic_salary)
            new_allowances = validated_data.get("allowances", instance.allowances)
            new_deductions = validated_data.get("deductions", instance.deductions)
            new_status = validated_data.get("status", instance.status)

            has_changed = (
                Decimal(str(new_basic)) != Decimal(str(instance.basic_salary)) or
                Decimal(str(new_allowances)) != Decimal(str(instance.allowances)) or
                Decimal(str(new_deductions)) != Decimal(str(instance.deductions)) or
                new_status != instance.status
            )

            if has_changed:
                request = self.context.get("request")
                user = request.user if request and getattr(request.user, "is_authenticated", False) else None
                user_id_str = str(user.id) if user and getattr(user, "id", None) else None
                user_name_str = (user.get_full_name() or user.username or "Administrator") if user else "System Administrator"
                user_email_str = str(user.email) if user and getattr(user, "email", None) else ""
                reason = validated_data.get("modification_reason") or instance.modification_reason

                history_entry = {
                    "modified_at": timezone.now().isoformat(),
                    "modified_by_id": user_id_str,
                    "modified_by_name": user_name_str,
                    "modified_by_email": user_email_str,
                    "reason": str(reason),
                    "old_values": {
                        "basic_salary": str(instance.basic_salary),
                        "allowances": str(instance.allowances),
                        "deductions": str(instance.deductions),
                        "net_salary": str(instance.net_salary),
                        "status": str(instance.status),
                    },
                    "new_values": {
                        "basic_salary": str(new_basic),
                        "allowances": str(new_allowances),
                        "deductions": str(new_deductions),
                        "status": str(new_status),
                    }
                }
                history = list(instance.modification_history or [])
                history.insert(0, history_entry)
                instance.modification_history = history
                instance.is_modified_after_payment = True
                instance.modified_by = user
                instance.modification_reason = reason

        return super().update(instance, validated_data)

    def get_company_details(self, obj):
        try:
            settings = SystemSettings.get_settings()
            logo_url = None
            if settings.company_logo:
                request = self.context.get("request")
                logo_url = request.build_absolute_uri(settings.company_logo.url) if request else settings.company_logo.url
            return {
                "company_name": settings.company_name or "AttendStack",
                "company_address": settings.company_address or "",
                "company_email": settings.company_email or "",
                "company_phone": settings.company_phone or "",
                "company_website": settings.company_website or "",
                "registration_number": settings.registration_number or "",
                "tax_id": settings.tax_id or "",
                "company_bank_name": settings.company_bank_name or "",
                "company_bank_account_no": settings.company_bank_account_no or "",
                "company_bank_ifsc": settings.company_bank_ifsc or "",
                "company_bank_branch": settings.company_bank_branch or "",
                "company_upi_id": settings.company_upi_id or "",
                "company_logo": logo_url,
                "currency": settings.currency or "INR",
            }
        except Exception:
            return {}

    def get_month_name(self, obj):
        import calendar
        try:
            return calendar.month_name[obj.month]
        except (IndexError, TypeError):
            return ""

    def get_payable_salary(self, obj):
        return obj.net_salary

    def get_attendance_summary(self, obj):
        from .services import calculate_attendance_payroll

        payroll = calculate_attendance_payroll(
            obj.employee,
            obj.month,
            obj.year,
            allowances=obj.allowances,
        )
        return {
            **payroll["attendance_summary"],
            "unpaid_days": payroll["unpaid_days"],
            "days_in_month": payroll["days_in_month"],
            "per_day_salary": payroll["per_day_salary"],
            "leave_breakdown": payroll["leave_breakdown"],
        }


from .models import EmployeeIncrement


from settings.models import SystemSettings

class EmployeeIncrementSerializer(serializers.ModelSerializer):
    employee_details = EmployeeMiniSerializer(source="employee", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    increment_type_display = serializers.CharField(source="get_increment_type_display", read_only=True)
    action_by_name = serializers.CharField(source="action_by.get_full_name", read_only=True)
    cycle_months = serializers.SerializerMethodField()
    cycle_display = serializers.SerializerMethodField()
    is_custom = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeIncrement
        fields = [
            "id",
            "employee",
            "employee_details",
            "due_date",
            "current_salary",
            "increment_type",
            "increment_type_display",
            "increment_value",
            "calculated_increment_amount",
            "new_salary",
            "status",
            "status_display",
            "rescheduled_date",
            "action_date",
            "action_by",
            "action_by_name",
            "notes",
            "cycle_months",
            "cycle_display",
            "is_custom",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "calculated_increment_amount",
            "new_salary",
            "action_date",
            "action_by",
            "cycle_months",
            "cycle_display",
            "is_custom",
            "created_at",
            "updated_at",
        ]

    def get_is_custom(self, obj):
        return bool(obj.employee.override_increment_policy or getattr(obj, "is_custom", False))

    def get_cycle_months(self, obj):
        if obj.employee.override_increment_policy and obj.employee.custom_increment_months:
            return obj.employee.custom_increment_months
        try:
            settings = SystemSettings.get_settings()
            return settings.default_increment_months or 12
        except Exception:
            return 12

    def get_cycle_display(self, obj):
        months = self.get_cycle_months(obj)
        labels = {
            1: "Monthly (Every 1 Month)",
            3: "Quarterly (Every 3 Months)",
            6: "Half-Yearly (Every 6 Months)",
            9: "Every 9 Months",
            12: "Annually (Every 12 Months / 1 Year)",
            18: "Every 18 Months (1.5 Years)",
            24: "Every 24 Months (2 Years)",
        }
        return labels.get(months, f"Every {months} Months")


class RescheduleIncrementSerializer(serializers.Serializer):
    rescheduled_date = serializers.DateField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ProcessIncrementActionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class EditIncrementHikeSerializer(serializers.Serializer):
    increment_type = serializers.ChoiceField(choices=["PERCENTAGE", "FLAT_AMOUNT"], required=False, default="PERCENTAGE")
    increment_value = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.00"), required=False, default=Decimal("0.00"))
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    update_employee_policy = serializers.BooleanField(required=False, default=False)
    reset_to_company_policy = serializers.BooleanField(required=False, default=False)


