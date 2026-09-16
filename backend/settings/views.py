from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from rest_framework.parsers import JSONParser, MultiPartParser, FormParser

from .models import SystemSettings, SettingsChangeLog
from .serializers import SystemSettingsSerializer, SystemSettingsUpdateSerializer, SettingsChangeLogSerializer
from accounts.permissions import IsAdminOrHR
from employees.models import Employee


class SystemSettingsView(generics.RetrieveUpdateAPIView):
    """
    API endpoint to view and update system settings
    GET: Returns current system settings (all authenticated users)
    PUT/PATCH: Updates system settings (only admins)
    """
    serializer_class = SystemSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]
    permission_module = "settings"
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_object(self):
        return SystemSettings.get_settings()
    
    def update(self, request, *args, **kwargs):
        # Only allow admins to update settings
        if not IsAdminOrHR().has_permission(request, self):
            raise PermissionDenied("Only admins can modify system settings")
            
        instance = self.get_object()
        serializer = SystemSettingsUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        
        # Log all changes for audit trail
        with transaction.atomic():
            changes = []
            for field, new_value in request.data.items():
                if hasattr(instance, field):
                    old_value = str(getattr(instance, field))
                    if old_value != str(new_value):
                        changes.append(
                            SettingsChangeLog(
                                settings=instance,
                                changed_by=request.user.employee if hasattr(request.user, 'employee') else None,
                                field_name=field,
                                old_value=old_value,
                                new_value=str(new_value),
                                ip_address=request.META.get('REMOTE_ADDR')
                            )
                        )
            
            paid_leave_policy_fields = {
                "casual_leave_days",
                "sick_leave_days",
                "maternity_leave_days",
                "paternity_leave_days",
                "bereavement_leave_days",
                "marriage_leave_days",
            }
            should_rebalance_paid_leaves = any(
                change.field_name in paid_leave_policy_fields for change in changes
            )

            increment_policy_fields = {
                "increment_enabled",
                "default_increment_months",
                "default_increment_type",
                "default_increment_value",
            }
            should_sync_increments = any(
                change.field_name in increment_policy_fields for change in changes
            )

            # Bulk create change logs
            if changes:
                SettingsChangeLog.objects.bulk_create(changes)
            
            # Update the instance
            instance.updated_by = request.user.employee if hasattr(request.user, 'employee') else None
            serializer.save()

            if should_rebalance_paid_leaves:
                from attendance.services import rebalance_paid_leave_attendance

                rebalance_paid_leave_attendance()

            if should_sync_increments:
                from payroll.increment_service import sync_employee_increments

                sync_employee_increments()
            
        return Response(serializer.data)


class SettingsChangeLogsView(generics.ListAPIView):
    """
    API endpoint to view settings change history (audit log)
    Only accessible by admins
    """
    serializer_class = SettingsChangeLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrHR]
    queryset = SettingsChangeLog.objects.all().order_by('-changed_at')
    
    def get_queryset(self):
        return super().get_queryset()[:100]  # Limit to last 100 changes


class SyncSimplyJobSettingsView(generics.GenericAPIView):
    """
    Extracts and synchronizes company profile info (Name, GSTIN, Address, Phone, Email, Website)
    from SimplyJob connected company into SystemSettings.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrHR]

    def post(self, request, *args, **kwargs):
        from django.conf import settings
        from organizations.models import Organization
        settings_instance = SystemSettings.get_settings()
        synced_fields = []
        company_data = {}

        # 1. Find connected organization strictly for this user
        from organizations.services import get_organization_for_user
        org = get_organization_for_user(request.user)

        # 2. Extract from SimplyJob DB if configured
        db_url = getattr(settings, "SIMPLYJOB_DATABASE_URL", "").strip()
        if db_url:
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                conn = psycopg2.connect(db_url, connect_timeout=5)
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    ext_id = None
                    if org and org.external_company_id and str(org.external_company_id).isdigit():
                        ext_id = int(org.external_company_id)
                    
                    org_id_str = str(org.id) if org else ""
                    invite_code_str = str(org.invite_code) if org else ""
                    user_email = str(request.user.email or "").strip().lower()

                    cur.execute(
                        """
                        SELECT c.*, u.email as user_email
                        FROM companies_company c
                        LEFT JOIN auth_user u ON c.owner_id = u.id
                        WHERE (%s IS NOT NULL AND c.id = %s)
                           OR (%s != '' AND c.attendstack_organization_id = %s)
                           OR (%s != '' AND c.attendstack_invite_code = %s)
                           OR (%s != '' AND LOWER(u.email) = %s)
                        ORDER BY c.updated_at DESC
                        LIMIT 1;
                        """,
                        (ext_id, ext_id, org_id_str, org_id_str, invite_code_str, invite_code_str, user_email, user_email)
                    )
                    row = cur.fetchone()
                    if row:
                        company_data = dict(row)
                conn.close()
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("SimplyJob DB extraction error: %s", exc)

        # 3. Apply extracted data (or fallback to local Organization model)
        updated = False
        if company_data:
            if company_data.get("name"):
                settings_instance.company_name = company_data["name"]
                synced_fields.append("Company Name")
            
            addr = company_data.get("billing_address") or company_data.get("location") or company_data.get("headquarters")
            if addr:
                settings_instance.company_address = addr
                synced_fields.append("Company Address")
            
            email = company_data.get("hiring_email") or company_data.get("user_email")
            if email:
                settings_instance.company_email = email
                synced_fields.append("Company Email")
            
            phone = company_data.get("contact_phone")
            if phone:
                settings_instance.company_phone = phone
                synced_fields.append("Company Phone")
            
            website = company_data.get("website")
            if website:
                settings_instance.company_website = website
                synced_fields.append("Website")
            
            gstin = company_data.get("gstin")
            if gstin:
                settings_instance.tax_id = gstin.upper()
                synced_fields.append("GSTIN / Tax ID")
            
            industry = company_data.get("industry")
            if industry:
                settings_instance.industry = industry
                synced_fields.append("Industry")
            
            size = company_data.get("company_size")
            if size:
                settings_instance.company_size = size
                synced_fields.append("Company Size")
            
            updated = True
        elif org:
            if org.name:
                settings_instance.company_name = org.name
                synced_fields.append("Company Name")
            if org.location:
                settings_instance.company_address = org.location
                synced_fields.append("Company Address")
            if org.email:
                settings_instance.company_email = org.email
                synced_fields.append("Company Email")
            if org.phone:
                settings_instance.company_phone = org.phone
                synced_fields.append("Company Phone")
            if org.website:
                settings_instance.company_website = org.website
                synced_fields.append("Website")
            if org.industry:
                settings_instance.industry = org.industry
                synced_fields.append("Industry")
            updated = True

        if updated:
            settings_instance.save()

        serializer = SystemSettingsSerializer(settings_instance)
        return Response({
            "ok": True,
            "message": f"Successfully extracted and synced {len(synced_fields)} field(s) from SimplyJob." if synced_fields else "No external SimplyJob data found to sync.",
            "synced_fields": synced_fields,
            "data": serializer.data,
        })
