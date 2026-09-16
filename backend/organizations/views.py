from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserRole
from accounts.permissions import IsAdminOrHR, IsSuperAdmin
from attendance.models import AttendanceRecord, LeaveRequest
from employees.models import Employee, EmployeeStatus
from .models import Organization
from .serializers import OrganizationSerializer, AdministratorSerializer

User = get_user_model()


class OrganizationVerifyCodeView(APIView):
    """
    Public endpoint to verify if an AttendStack Organization Code is valid and active.
    Used by SimplyJob to check status before sending invitations.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        code = str(request.query_params.get("code") or "").strip().upper()
        if not code:
            return Response({"valid": False, "error": "Code is required."}, status=status.HTTP_400_BAD_REQUEST)

        org = Organization.objects.filter(invite_code__iexact=code, is_active=True).first()
        if not org:
            return Response({
                "valid": False,
                "code": code,
                "error": "The organization code does not exist or has been expired/reset."
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "valid": True,
            "code": org.invite_code,
            "organization_id": org.id,
            "organization_name": org.name,
            "is_active": org.is_active,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        code = str(request.data.get("code") or request.query_params.get("code") or "").strip().upper()
        if not code:
            return Response({"valid": False, "error": "Code is required."}, status=status.HTTP_400_BAD_REQUEST)

        org = Organization.objects.filter(invite_code__iexact=code, is_active=True).first()
        if not org:
            return Response({
                "valid": False,
                "code": code,
                "error": "The organization code does not exist or has been expired/reset."
            }, status=status.HTTP_404_NOT_FOUND)

class OrganizationVerifyApiKeyView(APIView):
    """
    Public endpoint to verify an AttendStack API Key.
    Used by SimplyJob to connect and auto-sync Organization details & Plan status.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return self._verify(request)

    def post(self, request):
        return self._verify(request)

    def _verify(self, request):
        raw_key = (
            request.query_params.get("api_key")
            or request.data.get("api_key")
            or request.headers.get("X-API-Key")
            or request.headers.get("Authorization", "").replace("Bearer ", "")
            or ""
        ).strip()

        if not raw_key:
            return Response(
                {"valid": False, "error": "API Key is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        org = Organization.objects.filter(api_key=raw_key, is_active=True).first()
        if not org:
            return Response(
                {
                    "valid": False,
                    "error": "Invalid or inactive AttendStack API Key. Please verify the key in AttendStack Settings > API & Integrations.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # If POST contains plan sync data, update the organization record
        if request.method == "POST" and request.data:
            from django.utils.dateparse import parse_datetime

            plan_name = request.data.get("plan_name")
            plan_expires_at = request.data.get("plan_expires_at")
            plan_source = request.data.get("plan_source")
            max_employees = request.data.get("max_employees")

            update_fields = ["plan_status"]
            if plan_name:
                org.plan_name = str(plan_name).strip()
                update_fields.append("plan_name")
            if plan_expires_at:
                if isinstance(plan_expires_at, str):
                    parsed_exp = parse_datetime(plan_expires_at)
                    org.plan_expires_at = parsed_exp or plan_expires_at
                else:
                    org.plan_expires_at = plan_expires_at
                update_fields.append("plan_expires_at")
            if plan_source:
                org.plan_source = str(plan_source).strip()
                update_fields.append("plan_source")
            if max_employees is not None:
                org.max_employees = int(max_employees)
                update_fields.append("max_employees")

            org.plan_status = org.computed_plan_status
            org.save(update_fields=update_fields)
        else:
            # Refresh plan status in DB
            org.plan_status = org.computed_plan_status
            org.save(update_fields=["plan_status"])

        return Response({
            "valid": True,
            "organization_id": org.id,
            "organization_name": org.name,
            "invite_code": org.invite_code,
            "external_company_id": org.external_company_id,
            "plan_name": org.plan_name or "Standard Plan",
            "plan_expires_at": org.plan_expires_at.isoformat() if org.plan_expires_at else None,
            "plan_status": org.computed_plan_status,
            "plan_source": org.plan_source,
            "days_until_plan_expiry": org.days_until_plan_expiry,
            "is_plan_expiring_soon": org.is_plan_expiring_soon,
            "is_plan_expired": org.is_plan_expired,
            "max_employees": org.max_employees,
            "employee_count": org.employees.count(),
            "active_employee_count": org.employees.filter(status=EmployeeStatus.ACTIVE).count(),
        }, status=status.HTTP_200_OK)


class OrganizationEmployeesSyncStatusView(APIView):
    """
    Endpoint used by SimplyJob to query real-time onboarding and login status of employees.
    Supports matching by email, external_application_id, or whole organization.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return self._get_status(request)

    def post(self, request):
        return self._get_status(request)

    def _get_status(self, request):
        raw_key = (
            request.query_params.get("api_key")
            or request.data.get("api_key")
            or request.headers.get("X-API-Key")
            or request.headers.get("Authorization", "").replace("Bearer ", "")
            or ""
        ).strip()
        code = str(request.query_params.get("code") or request.data.get("code") or "").strip().upper()
        external_company_id = str(request.query_params.get("external_company_id") or request.data.get("external_company_id") or "").strip()

        if not raw_key and not code:
            return Response(
                {"ok": False, "error": "API key or organization code is required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        org = None
        if raw_key:
            org = Organization.objects.filter(api_key=raw_key, is_active=True).first()
        if not org and code:
            if external_company_id:
                org = Organization.objects.filter(invite_code__iexact=code, external_company_id=external_company_id, is_active=True).first()
            if not org:
                org = Organization.objects.filter(invite_code__iexact=code, is_active=True).first()

        if not org:
            return Response(
                {"ok": False, "error": "Organization not found or API key/code is invalid."},
                status=status.HTTP_404_NOT_FOUND,
            )

        employees = Employee.objects.filter(organization=org)
        employee_emails = [e.email.lower() for e in employees if e.email]
        users = {u.email.lower(): u for u in User.objects.filter(email__in=employee_emails)}

        emp_list = []
        by_email = {}
        by_app_id = {}

        for emp in employees:
            email_lower = emp.email.lower() if emp.email else ""
            user = users.get(email_lower)

            is_account_created = bool(user)
            has_logged_in = bool(user and user.last_login)
            last_login = user.last_login.isoformat() if user and user.last_login else None

            # Determine high-level sync status
            if has_logged_in or emp.status in (EmployeeStatus.ACTIVE, EmployeeStatus.NOTICE_PERIOD):
                sync_status = "ACTIVE_ONBOARDED"
                status_display = "Active in AttendStack"
            elif is_account_created or emp.status == EmployeeStatus.PROVISION:
                sync_status = "ONBOARDED"
                status_display = "Onboarded (Account Created)"
            else:
                sync_status = "INVITED"
                status_display = "Invited"

            emp_data = {
                "id": str(emp.id),
                "employee_id": emp.employee_id,
                "full_name": emp.full_name,
                "email": emp.email,
                "status": emp.status,
                "department": emp.department,
                "designation": emp.designation,
                "joining_date": str(emp.joining_date) if emp.joining_date else None,
                "external_application_id": emp.external_application_id,
                "is_account_created": is_account_created,
                "has_logged_in": has_logged_in,
                "last_login": last_login,
                "sync_status": sync_status,
                "status_display": status_display,
            }
            emp_list.append(emp_data)
            if email_lower:
                by_email[email_lower] = emp_data
            if emp.external_application_id:
                by_app_id[str(emp.external_application_id)] = emp_data

        return Response({
            "ok": True,
            "organization_id": org.id,
            "organization_name": org.name,
            "invite_code": org.invite_code,
            "total_employees": len(emp_list),
            "active_employees": sum(1 for e in emp_list if e["sync_status"] == "ACTIVE_ONBOARDED"),
            "employees": emp_list,
            "by_email": by_email,
            "by_app_id": by_app_id,
        }, status=status.HTTP_200_OK)




class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all().order_by("-created_at")
    serializer_class = OrganizationSerializer

    def get_permissions(self):
        if self.action == "verify_code":
            return [permissions.AllowAny()]
        if self.action in ["create", "update", "partial_update", "destroy", "toggle_status", "superadmin_overview", "stats"]:
            return [IsAdminOrHR()]
        return [permissions.IsAuthenticated()]

    def get_authenticators(self):
        if getattr(self, "action", None) == "verify_code":
            return []
        return super().get_authenticators()

    def _find_user_organization(self, user):
        from organizations.services import get_organization_for_user
        return get_organization_for_user(user)

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Organization.objects.none()

        scope = self.request.query_params.get("scope")
        if scope == "me":
            org = self._find_user_organization(user)
            if org:
                return Organization.objects.filter(id=org.id)
            return Organization.objects.none()

        user_role = getattr(user, "role", "")

        if user.is_superuser or user_role == UserRole.SUPER_ADMIN:
            return Organization.objects.all().order_by("-created_at")

        # Multi-tenant isolation: HR / Owner / Staff / Sub-Admins see their organization(s)
        user_orgs = (
            Organization.objects.filter(owner=user)
            | Organization.objects.filter(employees__email__iexact=user.email)
            | Organization.objects.filter(subadmin_permissions__user=user)
        ).distinct()

        return user_orgs.order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        user = request.user
        org = self._find_user_organization(user)
        if not org:
            return Response(
                {"detail": "No organization workspace is associated with this account."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(OrganizationSerializer(org, context={"request": request}).data)

    def perform_create(self, serializer):
        owner = self.request.user
        owner_email = self.request.data.get("owner_email")
        if owner_email and (self.request.user.is_superuser or self.request.user.role == UserRole.SUPER_ADMIN):
            target_user = User.objects.filter(email__iexact=owner_email.strip()).first()
            if target_user:
                owner = target_user
            else:
                owner = User.objects.create_hr(
                    email=owner_email.strip(),
                    password="OrgOwner@123",
                    first_name=self.request.data.get("owner_first_name", "HR"),
                    last_name=self.request.data.get("owner_last_name", "Manager"),
                )
        serializer.save(owner=owner)

    def perform_update(self, serializer):
        organization = self.get_object()
        user = self.request.user
        if not (user.is_superuser or user.role == UserRole.SUPER_ADMIN or organization.owner_id == user.id or user.role == UserRole.HR or user.is_staff):
            raise PermissionDenied("Only the organization owner, HR, or Super Admin can edit organization details.")
        
        owner_id = self.request.data.get("owner_id")
        if owner_id and (user.is_superuser or user.role == UserRole.SUPER_ADMIN):
            new_owner = User.objects.filter(id=owner_id).first()
            if new_owner:
                serializer.save(owner=new_owner)
                return

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if not (user.is_superuser or user.role == UserRole.SUPER_ADMIN):
            raise PermissionDenied("Only Super Admins can delete an organization.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="toggle-status")
    def toggle_status(self, request, pk=None):
        organization = self.get_object()
        if not (request.user.is_superuser or request.user.role == UserRole.SUPER_ADMIN):
            raise PermissionDenied("Only Super Admins can toggle organization status.")
        organization.is_active = not organization.is_active
        organization.save(update_fields=["is_active"])
        return Response(OrganizationSerializer(organization, context={"request": request}).data)

    @action(detail=False, methods=["get", "post"], url_path="verify-code", permission_classes=[permissions.AllowAny], authentication_classes=[])
    def verify_code(self, request):
        """Public verification endpoint used by SimplyJob to check if an Org Code is valid and active."""
        code = str(request.query_params.get("code") or request.data.get("code") or "").strip().upper()
        if not code:
            return Response({"valid": False, "error": "Code is required."}, status=status.HTTP_400_BAD_REQUEST)

        org = Organization.objects.filter(invite_code__iexact=code, is_active=True).first()
        if not org:
            return Response({
                "valid": False,
                "code": code,
                "error": "The organization code does not exist or has been expired/reset."
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "valid": True,
            "code": org.invite_code,
            "organization_id": org.id,
            "organization_name": org.name,
            "is_active": org.is_active,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="regenerate-invite-code")
    def regenerate_invite_code(self, request, pk=None):
        if pk == "me":
            organization = self._find_user_organization(request.user)
            if not organization:
                return Response({"detail": "No organization found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            try:
                organization = self.get_object()
            except Exception:
                organization = Organization.objects.filter(id=pk).first() if str(pk).isdigit() else None
                if not organization:
                    organization = self._find_user_organization(request.user)
                if not organization:
                    return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)

        user_role = getattr(request.user, "role", "")
        if not (request.user.is_superuser or user_role in [UserRole.SUPER_ADMIN, UserRole.HR] or getattr(request.user, "is_staff", False) or organization.owner_id == request.user.id):
            raise PermissionDenied("Only the organization owner, HR, or Super Admin can regenerate its invite code.")

        from .models import generate_invite_code

        while True:
            invite_code = generate_invite_code()
            if not Organization.objects.filter(invite_code=invite_code).exists():
                organization.invite_code = invite_code
                organization.save(update_fields=["invite_code"])
                break

        data = OrganizationSerializer(organization, context={"request": request}).data
        data["message"] = f"New organization code generated: {organization.invite_code}. Please update this code in SimplyJob."
        return Response(data)

    @action(detail=True, methods=["post"], url_path="regenerate-api-key")
    def regenerate_api_key(self, request, pk=None):
        if pk == "me":
            organization = self._find_user_organization(request.user)
            if not organization:
                return Response({"detail": "No organization found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            try:
                organization = self.get_object()
            except Exception:
                organization = Organization.objects.filter(id=pk).first() if str(pk).isdigit() else None
                if not organization:
                    organization = self._find_user_organization(request.user)
                if not organization:
                    return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)

        user_role = getattr(request.user, "role", "")
        if not (request.user.is_superuser or user_role in [UserRole.SUPER_ADMIN, UserRole.HR] or getattr(request.user, "is_staff", False) or organization.owner_id == request.user.id):
            raise PermissionDenied("Only the organization owner, HR, or Super Admin can regenerate the API key.")

        from .models import generate_api_key

        while True:
            new_key = generate_api_key()
            if not Organization.objects.filter(api_key=new_key).exists():
                organization.api_key = new_key
                organization.save(update_fields=["api_key"])
                break

        data = OrganizationSerializer(organization, context={"request": request}).data
        data["message"] = "New API Key generated successfully. Please copy and paste it into SimplyJob."
        return Response(data)

    @action(detail=True, methods=["post"], url_path="sync-plan")
    def sync_plan(self, request, pk=None):
        organization = self.get_object()
        user = request.user
        api_key = request.headers.get("X-API-Key") or request.data.get("api_key")
        is_key_valid = bool(api_key and organization.api_key == api_key)

        if not (is_key_valid or (user.is_authenticated and (user.is_superuser or user.role == UserRole.SUPER_ADMIN or organization.owner_id == user.id))):
            raise PermissionDenied("Invalid credentials to sync organization plan.")

        plan_name = request.data.get("plan_name")
        plan_expires_at = request.data.get("plan_expires_at")
        plan_source = request.data.get("plan_source", "SIMPLYJOB")
        max_employees = request.data.get("max_employees")

        if plan_name:
            organization.plan_name = str(plan_name).strip()
        if plan_expires_at:
            organization.plan_expires_at = plan_expires_at
        if plan_source:
            organization.plan_source = str(plan_source).strip()
        if max_employees is not None:
            organization.max_employees = int(max_employees)

        organization.plan_status = organization.computed_plan_status
        organization.save()

        return Response(OrganizationSerializer(organization, context={"request": request}).data)

    def _process_plan_renewal(self, organization, user, request):
        allowed_roles = [UserRole.SUPER_ADMIN, UserRole.HR, getattr(UserRole, "ADMIN", "ADMIN")]
        is_authorized = (
            user.is_superuser
            or getattr(user, "role", "") in allowed_roles
            or organization.owner_id == user.id
            or organization.owner_id is None
        )
        if not is_authorized:
            raise PermissionDenied("Only organization administrators or owners can renew subscriptions.")

        if organization.owner_id is None and user.is_authenticated:
            organization.owner = user

        from datetime import timedelta
        from django.utils import timezone

        plan_name = str(request.data.get("plan_name", "Starter Plan")).strip()
        duration_days = int(request.data.get("duration_days", 30))
        max_employees = int(request.data.get("max_employees", 50))
        plan_source = str(request.data.get("plan_source", "ATTENDSTACK_DIRECT")).strip()

        base_date = organization.plan_expires_at if (organization.plan_expires_at and organization.plan_expires_at > timezone.now()) else timezone.now()
        organization.plan_name = plan_name
        organization.plan_expires_at = base_date + timedelta(days=duration_days)
        organization.plan_source = plan_source
        organization.max_employees = max_employees
        organization.plan_status = Organization.PlanStatus.ACTIVE
        organization.save(update_fields=["owner", "plan_name", "plan_expires_at", "plan_source", "max_employees", "plan_status"])

        data = OrganizationSerializer(organization, context={"request": request}).data
        data["message"] = f"Plan '{plan_name}' successfully renewed for {duration_days} days."
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="renew-plan")
    def renew_plan(self, request, pk=None):
        """Allows purchasing or renewing an AttendStack standalone plan by ID."""
        organization = self.get_object()
        return self._process_plan_renewal(organization, request.user, request)

    @action(detail=False, methods=["post"], url_path="renew-plan")
    def renew_plan_current(self, request):
        """Allows purchasing or renewing an AttendStack plan for the current user's workspace."""
        user = request.user
        org_id = request.data.get("organization_id")
        organization = Organization.objects.filter(id=org_id).first() if org_id else self._find_user_organization(user)
        if not organization:
            organization = Organization.objects.first()
        if not organization:
            return Response({"detail": "No organization found to activate plan."}, status=status.HTTP_404_NOT_FOUND)
        return self._process_plan_renewal(organization, user, request)

    @action(detail=True, methods=["post"], url_path="link-simplyjob")
    def link_simplyjob(self, request, pk=None):
        organization = self.get_object()
        user = request.user
        if not (user.is_superuser or user.role == UserRole.SUPER_ADMIN or organization.owner_id == user.id):
            raise PermissionDenied("Only organization owners or Super Admins can configure SimplyJob integration.")

        from .services import sync_invite_code_to_simplyjob

        simplyjob_org_id = request.data.get("simplyjob_org_id", "").strip()
        if not simplyjob_org_id:
            return Response({"detail": "SimplyJob Organization ID is required."}, status=status.HTTP_400_BAD_REQUEST)

        organization.external_company_id = simplyjob_org_id
        organization.external_source = "SIMPLYJOB"
        organization.save(update_fields=["external_company_id", "external_source"])

        # Instant real-time webhook sync to SimplyJob
        sync_result = sync_invite_code_to_simplyjob(organization)

        data = OrganizationSerializer(organization, context={"request": request}).data
        data["simplyjob_sync"] = sync_result
        return Response(data)

    @action(detail=True, methods=["get", "post"], url_path="generate-invite-link")
    def generate_invite_link(self, request, pk=None):
        organization = self.get_object()
        user = request.user
        if not (user.is_superuser or user.role == UserRole.SUPER_ADMIN or organization.owner_id == user.id):
            raise PermissionDenied("Only organization owners or Super Admins can generate invitation links.")

        # ENFORCE RULE: If company has not set their SimplyJob org_id / external_company_id, block invitation!
        if not (organization.external_company_id or organization.external_source == "SIMPLYJOB"):
            return Response(
                {
                    "error": "SIMPLYJOB_NOT_LINKED",
                    "detail": "SimplyJob Organization ID is not configured. Please paste and save your SimplyJob Org ID before sending employee invitations.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.conf import settings
        base_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        invite_url = f"{base_url}/register?org_id={organization.invite_code}&source=simplyjob"
        return Response({
            "organization_id": organization.id,
            "organization_name": organization.name,
            "invite_code": organization.invite_code,
            "simplyjob_org_id": organization.external_company_id,
            "invite_url": invite_url,
            "is_simplyjob_linked": True,
        })

    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        organization = self.get_object()
        user = request.user
        if not (user.is_superuser or user.role == UserRole.SUPER_ADMIN or organization.owner_id == user.id):
            raise PermissionDenied("Access restricted to Super Admins and Organization owner.")

        today = timezone.localdate()
        employees = organization.employees.all()
        employee_count = employees.count()
        active_employees = employees.filter(status=EmployeeStatus.ACTIVE).count()
        
        today_records = AttendanceRecord.objects.filter(employee__organization=organization, date=today)
        present_count = today_records.filter(status__in=["PRESENT", "HALF_DAY"]).count()
        late_count = today_records.filter(status="LATE").count()
        absent_count = today_records.filter(status="ABSENT").count()
        on_leave_count = today_records.filter(status__in=["LEAVE", "PAID_LEAVE"]).count()

        pending_leaves = LeaveRequest.objects.filter(employee__organization=organization, status="PENDING").count()

        employees_list = [
            {
                "id": str(emp.id),
                "employee_id": emp.employee_id,
                "full_name": emp.full_name,
                "email": emp.email,
                "department": emp.department,
                "designation": emp.designation,
                "status": emp.status,
                "joining_date": emp.joining_date,
            }
            for emp in employees[:50]
        ]

        return Response({
            "id": organization.id,
            "name": organization.name,
            "invite_code": organization.invite_code,
            "is_active": organization.is_active,
            "created_at": organization.created_at,
            "owner_name": organization.owner.get_full_name() if organization.owner else None,
            "owner_email": organization.owner.email if organization.owner else None,
            "employee_count": employee_count,
            "active_employees": active_employees,
            "today_attendance": {
                "present": present_count,
                "late": late_count,
                "absent": absent_count,
                "on_leave": on_leave_count,
            },
            "pending_leaves": pending_leaves,
            "employees": employees_list,
        })

    @action(detail=False, methods=["get"], url_path="superadmin-overview")
    def superadmin_overview(self, request):
        user = request.user
        if not (user.is_superuser or user.role == UserRole.SUPER_ADMIN):
            raise PermissionDenied("Only Super Admins can access platform overview.")

        import datetime
        from django.db.models import Count
        from accounts.models import SubAdminPermission

        today = timezone.localdate()
        orgs = Organization.objects.all().order_by("-created_at")
        total_companies = orgs.count()
        active_companies = orgs.filter(is_active=True).count()
        inactive_companies = orgs.filter(is_active=False).count()

        total_users = User.objects.count()
        total_hrs = User.objects.filter(role=UserRole.HR).count()
        total_subadmins = User.objects.filter(role=UserRole.SUB_ADMIN).count()
        total_employees = Employee.objects.count()

        today_attendance = AttendanceRecord.objects.filter(date=today, status__in=["PRESENT", "HALF_DAY"]).count()
        today_late = AttendanceRecord.objects.filter(date=today, status="LATE").count()
        total_checked_in = today_attendance + today_late
        total_pending_leaves = LeaveRequest.objects.filter(status="PENDING").count()

        attendance_rate = 0
        if total_employees > 0:
            attendance_rate = round((total_checked_in / total_employees) * 100, 1)

        # 1. 7-Day Attendance Trend
        attendance_trend_7d = []
        for i in range(6, -1, -1):
            day = today - datetime.timedelta(days=i)
            present_c = AttendanceRecord.objects.filter(date=day, status__in=["PRESENT", "HALF_DAY"]).count()
            late_c = AttendanceRecord.objects.filter(date=day, status="LATE").count()
            attendance_trend_7d.append({
                "date": day.strftime("%Y-%m-%d"),
                "day": day.strftime("%a"),
                "label": day.strftime("%b %d"),
                "present": present_c,
                "late": late_c,
                "total": present_c + late_c,
            })

        # 2. Plan & Tier Distribution (Unique consolidated counts)
        plan_dict = {}
        for org in orgs:
            p_name = (org.plan_name or "").strip() or "Standard Plan"
            plan_dict[p_name] = plan_dict.get(p_name, 0) + 1

        plan_distribution = []
        for p_name, c in sorted(plan_dict.items(), key=lambda x: x[1], reverse=True):
            pct = round((c / total_companies * 100), 1) if total_companies > 0 else 0
            plan_distribution.append({
                "name": p_name,
                "count": c,
                "percentage": pct,
            })

        if not plan_distribution:
            plan_distribution = [
                {"name": "Standard Plan", "count": active_companies, "percentage": 100.0 if active_companies > 0 else 0},
            ]

        # 3. Recent Platform Activities
        recent_activities = []
        for org in orgs[:5]:
            emp_count = org.employees.count() if hasattr(org, "employees") else 0
            recent_activities.append({
                "id": f"org-{org.id}",
                "type": "COMPANY_REGISTERED",
                "title": f"Tenant Onboarded: {org.name}",
                "description": f"Invite Code: {org.invite_code} • {emp_count} staff",
                "timestamp": org.created_at.isoformat() if org.created_at else None,
                "badge": "Company",
                "badge_color": "primary",
            })

        recent_hrs = User.objects.filter(role__in=[UserRole.HR, UserRole.SUB_ADMIN]).order_by("-date_joined")[:4]
        for hr_u in recent_hrs:
            recent_activities.append({
                "id": f"user-{hr_u.id}",
                "type": "ADMIN_CREATED",
                "title": f"Admin Added: {hr_u.get_full_name() or hr_u.email}",
                "description": f"Role: {hr_u.role} • {hr_u.email}",
                "timestamp": hr_u.date_joined.isoformat() if hr_u.date_joined else None,
                "badge": hr_u.role,
                "badge_color": "warning" if hr_u.role == UserRole.HR else "info",
            })

        # Sort activities newest first
        recent_activities.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
        recent_activities = recent_activities[:6]

        orgs_serialized = OrganizationSerializer(orgs, many=True, context={"request": request}).data

        return Response({
            "summary": {
                "total_companies": total_companies,
                "active_companies": active_companies,
                "inactive_companies": inactive_companies,
                "total_users": total_users,
                "total_hrs": total_hrs,
                "total_subadmins": total_subadmins,
                "total_employees": total_employees,
                "today_attendance": today_attendance,
                "today_late": today_late,
                "today_checked_in": total_checked_in,
                "attendance_rate": attendance_rate,
                "pending_leaves": total_pending_leaves,
            },
            "attendance_trend_7d": attendance_trend_7d,
            "plan_distribution": plan_distribution,
            "recent_activities": recent_activities,
            "organizations": orgs_serialized,
        })


class AdministratorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.none()
    serializer_class = AdministratorSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return User.objects.none()
        if user.is_superuser or getattr(user, "role", "") == UserRole.SUPER_ADMIN:
            # Exclude superadmin users from tenant HR & company administrators directory
            return User.objects.filter(
                role__in=[UserRole.HR, UserRole.SUB_ADMIN],
                is_superuser=False
            ).exclude(role=UserRole.SUPER_ADMIN).order_by("-date_joined")
        if getattr(user, "role", "") == UserRole.HR:
            from accounts.models import SubAdminPermission
            subadmin_user_ids = list(SubAdminPermission.objects.filter(organization__owner=user).values_list("user_id", flat=True))
            return User.objects.filter(id__in=[user.id, *subadmin_user_ids]).exclude(role=UserRole.SUPER_ADMIN).order_by("-date_joined")
        return User.objects.filter(id=user.id).exclude(role=UserRole.SUPER_ADMIN)


from .models import Plan
from .serializers import PlanSerializer

class PlanViewSet(viewsets.ModelViewSet):
    queryset = Plan.objects.all().order_by("sort_order", "monthly_price")
    serializer_class = PlanSerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        user = self.request.user
        if user and user.is_authenticated and (user.is_superuser or getattr(user, "role", "") == UserRole.SUPER_ADMIN):
            return Plan.objects.all().order_by("sort_order", "monthly_price")
        return Plan.objects.filter(is_active=True).order_by("sort_order", "monthly_price")

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        if not (request.user.is_superuser or getattr(request.user, "role", "") == UserRole.SUPER_ADMIN):
            raise PermissionDenied("Only Super Admins can seed default plans.")

        defaults = [
            {
                "name": "Starter Plan",
                "slug": "starter",
                "description": "Essential attendance tracking for startups & small teams.",
                "monthly_price": 499.00,
                "yearly_price": 4990.00,
                "max_employees": 15,
                "badge_text": "STARTER",
                "is_popular": False,
                "is_active": True,
                "sort_order": 1,
                "allows_employees": True,
                "allows_attendance": True,
                "allows_holidays": True,
                "allows_leaves": True,
                "allows_geofencing": False,
                "allows_payroll_reports": False,
                "allows_projects_tasks": False,
                "allows_chat": False,
                "allows_custom_shifts": False,
                "allows_auto_checkout": False,
                "allows_dedicated_api": False,
                "allows_simplyjob_sync": True,
                "features_list": [
                    "Up to 15 Active Employees",
                    "Real-Time Clock In / Out & Live Feed",
                    "SimplyJob 1-Click Candidate Onboarding",
                    "Standard Leave Management",
                    "Holidays Calendar Management",
                    "Monthly Attendance PDF Export",
                    "Standard Email Support",
                ],
            },
            {
                "name": "Growth Pro Plan",
                "slug": "growth-pro",
                "description": "Advanced automation, geofencing, payroll, tasks and team chat for scaling companies.",
                "monthly_price": 999.00,
                "yearly_price": 9990.00,
                "max_employees": 50,
                "badge_text": "MOST POPULAR",
                "is_popular": True,
                "is_active": True,
                "sort_order": 2,
                "allows_employees": True,
                "allows_attendance": True,
                "allows_holidays": True,
                "allows_leaves": True,
                "allows_geofencing": True,
                "allows_payroll_reports": True,
                "allows_projects_tasks": True,
                "allows_chat": True,
                "allows_custom_shifts": True,
                "allows_auto_checkout": True,
                "allows_dedicated_api": False,
                "allows_simplyjob_sync": True,
                "features_list": [
                    "Up to 50 Active Employees",
                    "Office IP Shield & GPS Geofencing",
                    "Salary & Payroll Processing (Payslips/Reports)",
                    "Projects & Tasks Workspace",
                    "Internal Team Chat & Direct Messaging",
                    "Automated Auto-Checkout & Overtime Rules",
                    "Multi-Shift & Late Rulebooks",
                    "Real-Time Two-Way SimplyJob Sync Engine",
                    "Priority WhatsApp & Ticket Support",
                ],
            },
            {
                "name": "Enterprise Sovereign Plan",
                "slug": "enterprise",
                "description": "Complete workforce sovereignty, custom shift logic, and dedicated API infrastructure.",
                "monthly_price": 1999.00,
                "yearly_price": 19990.00,
                "max_employees": -1,
                "badge_text": "UNLIMITED CAPACITY",
                "is_popular": False,
                "is_active": True,
                "sort_order": 3,
                "allows_employees": True,
                "allows_attendance": True,
                "allows_holidays": True,
                "allows_leaves": True,
                "allows_geofencing": True,
                "allows_payroll_reports": True,
                "allows_projects_tasks": True,
                "allows_chat": True,
                "allows_custom_shifts": True,
                "allows_auto_checkout": True,
                "allows_dedicated_api": True,
                "allows_simplyjob_sync": True,
                "features_list": [
                    "Unlimited Employees (500+ Active)",
                    "All HR, Attendance, Payroll & Leave Modules",
                    "Projects, Tasks & Team Chat Modules",
                    "Dedicated API Keys & Real-Time Webhooks",
                    "Multi-Branch & Location Hierarchy",
                    "Custom Overtime & Shift Rules Engine",
                    "Custom ERP & Payroll Export Pipelines",
                    "Single Sign-On (SSO) & Audit Logs",
                    "99.9% Uptime Guarantee & 24/7 SLA Support",
                ],
            },
        ]
        results = []
        for d in defaults:
            p, _ = Plan.objects.update_or_create(slug=d["slug"], defaults=d)
            results.append(PlanSerializer(p).data)
        return Response({"message": "Default plans seeded successfully.", "plans": results})


