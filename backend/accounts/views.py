"""
accounts – views
Login, profile, and user management views
"""

import base64
import hashlib
import hmac
import json
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import UserRole, SubAdminPermission
from .permissions import IsSuperAdmin, IsAdminOrHR, IsHR
from .serializers import (
    ChangePasswordSerializer,
    CreateHRSerializer,
    CreateSubAdminSerializer,
    CustomTokenObtainPairSerializer,
    RequestPasswordResetOTPSerializer,
    ResetPasswordWithOTPSerializer,
    SimplyJobEmployeeOnboardingSerializer,
    EmployeeSelfRegistrationSerializer,
    OrganizationRegistrationSerializer,
    SubAdminPermissionSerializer,
    UpdateSubAdminSerializer,
    UserProfileSerializer,
    UserUpdateSerializer,
)
from .services import request_password_reset_otp, reset_password_with_otp
from employees.services import sync_employee_from_simplyjob

User = get_user_model()


# ──────────────────────────────────────────────────────────────────────────────
# Auth Views
# ──────────────────────────────────────────────────────────────────────────────
class LoginView(TokenObtainPairView):
    """
    Login with email and password.
    Returns access/refresh token pair + user profile.
    """
    serializer_class = CustomTokenObtainPairSerializer


class VerifyRegistrationTokenView(APIView):
    """Verify signed registration token from SimplyJob and return pre-fill data."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def _verify(self, payload_b64, signature):
        if not payload_b64 or not signature:
            return None, "Missing payload or signature."

        secret = (
            getattr(settings, "SIMPLYJOB_ONBOARDING_SECRET", "")
            or getattr(settings, "ATTENDSTACK_ONBOARDING_SECRET", "")
        ).strip()
        if not secret:
            return None, "Integration secret is not configured."

        try:
            payload_bytes = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
            expected_sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected_sig):
                return None, "Invalid signature."

            payload_data = json.loads(payload_bytes.decode("utf-8"))
        except Exception as exc:
            return None, f"Malformed token payload: {exc}"

        timestamp = payload_data.get("timestamp", 0)
        current_time = int(timezone.now().timestamp())
        # 24 hour validity for registration token
        if abs(current_time - timestamp) > 86400:
            return None, "Registration link has expired. Please open registration again from SimplyJob."

        return payload_data, None

    def get(self, request):
        payload_b64 = str(request.query_params.get("payload", "")).strip()
        signature = str(request.query_params.get("signature", "")).strip()
        data, err = self._verify(payload_b64, signature)
        if err:
            return Response({"valid": False, "detail": err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "valid": True,
            "source": "SIMPLYJOB",
            "data": {
                "source_company_id": str(data.get("source_company_id", "")),
                "organization_name": data.get("company_name", ""),
                "full_name": data.get("full_name", ""),
                "email": data.get("email", "") or data.get("owner_email", ""),
                "phone": data.get("phone", ""),
                "website": data.get("website", ""),
                "location": data.get("location", ""),
                "industry": data.get("industry", ""),
                "api_key": data.get("api_key", ""),
                "plan_name": data.get("plan_name", "SimplyJob Integrated Plan"),
            }
        })

    def post(self, request):
        payload_b64 = str(request.data.get("payload", "")).strip()
        signature = str(request.data.get("signature", "")).strip()
        data, err = self._verify(payload_b64, signature)
        if err:
            return Response({"valid": False, "detail": err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "valid": True,
            "source": "SIMPLYJOB",
            "data": {
                "source_company_id": str(data.get("source_company_id", "")),
                "organization_name": data.get("company_name", ""),
                "full_name": data.get("full_name", ""),
                "email": data.get("email", "") or data.get("owner_email", ""),
                "phone": data.get("phone", ""),
                "website": data.get("website", ""),
                "location": data.get("location", ""),
                "industry": data.get("industry", ""),
                "api_key": data.get("api_key", ""),
                "plan_name": data.get("plan_name", "SimplyJob Integrated Plan"),
            }
        })


class OrganizationRegistrationView(generics.CreateAPIView):
    """Public organization setup. The created account is the organization's HR owner."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    serializer_class = OrganizationRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = serializer.save()
        return Response(
            {
                "detail": "Organization created successfully.",
                "organization": {
                    "id": organization.id,
                    "name": organization.name,
                    "invite_code": organization.invite_code,
                    "api_key": organization.api_key,
                    "is_simplyjob_linked": bool(organization.external_company_id or organization.external_source == "SIMPLYJOB"),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class EmployeeSelfRegistrationView(generics.CreateAPIView):
    """Public employee account registration using an organization invite code."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    serializer_class = EmployeeSelfRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = serializer.save()
        return Response(
            {
                "detail": "Your employee account has been created. You can now sign in.",
                "employee": {
                    "employee_id": employee.employee_id,
                    "full_name": employee.full_name,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class OrganizationCodeLookupView(APIView):
    """Confirm the organization attached to an employee onboarding code."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        code = str(request.query_params.get("code", "")).strip().upper()
        if not code:
            return Response(
                {"detail": "Enter an organization code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from organizations.models import Organization

        organization = Organization.objects.filter(
            invite_code__iexact=code,
            is_active=True,
        ).first()
        if organization is None:
            organization = Organization.objects.filter(
                api_key__iexact=code,
                is_active=True,
            ).first()
        if organization is None:
            return Response(
                {
                    "valid": False,
                    "code": code,
                    "detail": "Enter a valid active organization code.",
                    "error": "The organization code does not exist or has expired in AttendStack.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "organization_name": organization.name,
        })



class RequestPasswordResetOTPView(APIView):
    """Email a password-reset verification code."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RequestPasswordResetOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = request_password_reset_otp(
            serializer.validated_data["email"],
            requested_ip=request.META.get("REMOTE_ADDR"),
        )
        return Response({"detail": message}, status=status.HTTP_200_OK)


class ResetPasswordWithOTPView(APIView):
    """Set a new password using a valid verification code."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = ResetPasswordWithOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reset_password_with_otp(
            serializer.validated_data["email"],
            serializer.validated_data["otp"],
            serializer.validated_data["new_password"],
        )
        return Response(
            {"detail": "Password reset successfully. You can now sign in."},
            status=status.HTTP_200_OK,
        )


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    GET: Retrieve the authenticated user's profile.
    PUT/PATCH: Update the authenticated user's profile.
    """
    queryset = User.objects.all()
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return UserUpdateSerializer
        return self.serializer_class


class ChangePasswordView(generics.UpdateAPIView):
    """
    Update the authenticated user's password.
    """
    serializer_class = ChangePasswordSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


class AdminLiveStatusView(APIView):
    """
    Returns the most recently active admin/HR account for employee dashboards.
    Admin/HR requests also refresh their activity heartbeat.
    """

    permission_classes = [permissions.IsAuthenticated]
    online_window = timedelta(minutes=5)

    def get(self, request, *args, **kwargs):
        now = timezone.now()

        if request.user.role in (UserRole.SUPER_ADMIN, UserRole.HR):
            request.user.last_login = now
            request.user.save(update_fields=["last_login"])

        admin_user = (
            User.objects.filter(
                role__in=(UserRole.SUPER_ADMIN, UserRole.HR),
                is_active=True,
                last_login__isnull=False,
            )
            .order_by("-last_login")
            .first()
        )

        if admin_user is None:
            admin_user = (
                User.objects.filter(
                    role__in=(UserRole.SUPER_ADMIN, UserRole.HR),
                    is_active=True,
                )
                .order_by("date_joined")
                .first()
            )

        if admin_user is None:
            return Response(
                {
                    "is_online": False,
                    "last_seen_at": None,
                    "name": "Admin",
                    "role": "Admin",
                }
            )

        last_seen = admin_user.last_login
        is_online = bool(last_seen and now - last_seen <= self.online_window)

        return Response(
            {
                "is_online": is_online,
                "last_seen_at": last_seen,
                "name": admin_user.get_full_name() or admin_user.email,
                "role": admin_user.get_role_display(),
            }
        )


# ──────────────────────────────────────────────────────────────────────────────
# Admin Views
# ──────────────────────────────────────────────────────────────────────────────
class CreateHRView(generics.CreateAPIView):
    """
    SUPER_ADMIN creates a new HR manager.
    Provides the initial password in the response.
    """
    queryset = User.objects.none()
    serializer_class = CreateHRSerializer
    permission_classes = [IsSuperAdmin]

    def perform_create(self, serializer):
        # The serializer handles user creation and password generation
        self.created_user = serializer.save()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Return the user's details and their temporary password
        user_data = UserProfileSerializer(self.created_user).data
        response_data = {
            "user": user_data,
            "temp_password": self.created_user._raw_password,
        }
        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)


class SimplyJobEmployeeOnboardingView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        secret = (
            getattr(settings, "SIMPLYJOB_ONBOARDING_SECRET", "")
            or getattr(settings, "ATTENDSTACK_ONBOARDING_SECRET", "")
        ).strip()
        if not secret:
            raise AuthenticationFailed("Onboarding secret is not configured.")

        raw_body = request.body or b""
        signature = str(request.headers.get("X-SimplyJob-Signature", "")).strip()
        expected_signature = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected_signature):
            raise AuthenticationFailed("Invalid onboarding signature.")

        serializer = SimplyJobEmployeeOnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization, employee, user, temporary_password = sync_employee_from_simplyjob(
            company_data=serializer.validated_data,
            employee_data=serializer.validated_data,
        )
        join_base = (
            getattr(settings, "ATTENDSTACK_APP_URL", "")
            or getattr(settings, "ATTENDSTACK_DASHBOARD_URL", "http://localhost:3000")
        ).strip().rstrip("/")
        query = urlencode({"code": organization.invite_code, "email": employee.email})
        join_url = f"{join_base}/join?{query}"

        return Response(
            {
                "detail": "Employee synced successfully.",
                "organization": {
                    "id": organization.id,
                    "name": organization.name,
                    "invite_code": organization.invite_code,
                },
                "employee": {
                    "id": str(employee.id),
                    "employee_id": employee.employee_id,
                    "full_name": employee.full_name,
                    "email": employee.email,
                    "status": employee.status,
                    "joining_date": employee.joining_date,
                    "department": employee.department,
                    "designation": employee.designation,
                },
                "user": {
                    "id": str(user.id) if user else None,
                    "email": user.email if user else employee.email,
                    "temporary_password": temporary_password,
                },
                "join_url": join_url,
                "temporary_password": temporary_password,
            },
            status=status.HTTP_201_CREATED if temporary_password else status.HTTP_200_OK,
        )


class SSOLoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        import base64
        import json
        from rest_framework_simplejwt.tokens import RefreshToken
        from organizations.models import Organization

        payload_b64 = request.data.get("payload") or request.query_params.get("payload")
        signature = request.data.get("signature") or request.query_params.get("signature")

        if not payload_b64 or not signature:
            return Response({"detail": "Missing SSO payload or signature."}, status=status.HTTP_400_BAD_REQUEST)

        secret = (
            getattr(settings, "SIMPLYJOB_ONBOARDING_SECRET", "")
            or getattr(settings, "ATTENDSTACK_ONBOARDING_SECRET", "")
        ).strip()
        if not secret:
            return Response({"detail": "SSO secret is not configured on this server."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            payload_bytes = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
            expected_sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected_sig):
                return Response({"detail": "Invalid SSO signature."}, status=status.HTTP_403_FORBIDDEN)

            payload_data = json.loads(payload_bytes.decode("utf-8"))
        except Exception:
            return Response({"detail": "Malformed SSO payload."}, status=status.HTTP_400_BAD_REQUEST)

        timestamp = payload_data.get("timestamp", 0)
        current_time = int(timezone.now().timestamp())
        if abs(current_time - timestamp) > 900:  # 15 minute window
            return Response({"detail": "SSO link has expired. Please jump again from SimplyJob."}, status=status.HTTP_400_BAD_REQUEST)

        email = str(payload_data.get("email") or payload_data.get("owner_email", "")).strip().lower()
        company_name = str(payload_data.get("company_name", "")).strip()
        source_company_id = str(payload_data.get("source_company_id", "")).strip()
        role = str(payload_data.get("role", "HR")).upper()

        if not email:
            return Response({"detail": "Invalid SSO payload parameters."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            full_name = str(payload_data.get("full_name", "Workspace User")).strip()
            parts = full_name.split()
            first_name = parts[0] if parts else "User"
            last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
            if role == "EMPLOYEE":
                user = User.objects.create_employee(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                )
            else:
                user = User.objects.create_hr(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                )

        organization = None
        if source_company_id and role != "EMPLOYEE":
            organization, _ = Organization.objects.update_or_create(
                external_company_id=source_company_id,
                defaults={
                    "name": company_name or "Company Workspace",
                    "owner": user,
                    "external_source": "simplyjob",
                },
            )
        elif user.employee_profile and user.employee_profile.organization:
            organization = user.employee_profile.organization

        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": str(user.id),
                "email": user.email,
                "role": user.role,
                "first_name": user.first_name,
                "last_name": user.last_name,
            },
            "organization": {
                "id": organization.id,
                "name": organization.name,
                "invite_code": organization.invite_code,
            } if organization else None
        })


class HealthCheckView(APIView):
    """
    Check the health of the application.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({"status": "ok"})


from rest_framework import viewsets
from rest_framework.decorators import action
from organizations.models import Organization
from accounts.utils import generate_temp_password


class SubAdminViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoint for Sub-Admins and their Granular RBAC Permissions.
    Accessible exclusively by Super Admins and Company Admins (HR).
    """
    queryset = SubAdminPermission.objects.all()
    serializer_class = SubAdminPermissionSerializer
    permission_classes = [permissions.IsAuthenticated, IsHR]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return SubAdminPermission.objects.none()
        if user.is_superuser or user.role == UserRole.SUPER_ADMIN:
            return SubAdminPermission.objects.select_related("user", "organization").all()
        # For HR, show sub-admins in organizations they own
        return SubAdminPermission.objects.filter(
            organization__owner=user
        ).select_related("user", "organization")

    def create(self, request, *args, **kwargs):
        serializer = CreateSubAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user_auth = request.user
        organization = None
        org_id = data.get("organization_id")

        if user_auth.is_superuser or user_auth.role == UserRole.SUPER_ADMIN:
            if org_id:
                organization = Organization.objects.filter(id=org_id).first()
            if not organization:
                organization = Organization.objects.order_by("created_at").first()
        else:
            # HR manager
            organization = Organization.objects.filter(owner=user_auth).first()

        if not organization:
            return Response(
                {"detail": "No organization workspace found to associate this sub-admin with."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password = data.get("password") or generate_temp_password()
        email = data["email"]
        first_name = data.get("first_name", "").strip()
        last_name = data.get("last_name", "").strip()
        phone = data.get("phone", "").strip()
        custom_role_title = data.get("custom_role_title", "HR Manager").strip() or "HR Manager"
        permissions_matrix = data.get("permissions") or SubAdminPermission.get_default_permissions()

        # Create user
        user = User.objects.create_sub_admin(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
        )
        user._raw_password = password

        # Create permission record
        sub_perm = SubAdminPermission.objects.create(
            user=user,
            organization=organization,
            custom_role_title=custom_role_title,
            permissions=permissions_matrix,
        )

        resp_data = SubAdminPermissionSerializer(sub_perm).data
        resp_data["temp_password"] = password
        return Response(resp_data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        sub_perm = self.get_object()
        serializer = UpdateSubAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = sub_perm.user
        if "first_name" in data:
            user.first_name = data["first_name"].strip()
        if "last_name" in data:
            user.last_name = data["last_name"].strip()
        if "phone" in data:
            user.phone = data["phone"].strip()
        if "is_active" in data:
            user.is_active = data["is_active"]
        user.save()

        if "custom_role_title" in data:
            sub_perm.custom_role_title = data["custom_role_title"].strip() or sub_perm.custom_role_title
        if "permissions" in data:
            sub_perm.permissions = data["permissions"]
        sub_perm.save()

        return Response(SubAdminPermissionSerializer(sub_perm).data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        sub_perm = self.get_object()
        user = sub_perm.user
        email = user.email
        # Delete both permission and user record
        sub_perm.delete()
        user.delete()
        return Response({"detail": f"Sub-admin account for {email} has been permanently deleted."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        sub_perm = self.get_object()
        user = sub_perm.user
        custom_password = str(request.data.get("password", "")).strip()
        if custom_password:
            if len(custom_password) < 6:
                return Response(
                    {"detail": "Password must be at least 6 characters."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            new_password = custom_password
        else:
            new_password = generate_temp_password()

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({
            "detail": f"Password for {user.email} reset successfully.",
            "temp_password": new_password,
            "email": user.email,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post", "patch"], url_path="toggle-status")
    def toggle_status(self, request, pk=None):
        sub_perm = self.get_object()
        user = sub_perm.user
        desired_active = request.data.get("is_active")
        if desired_active is None:
            user.is_active = not user.is_active
        else:
            user.is_active = bool(desired_active)
        user.save(update_fields=["is_active"])
        state_label = "activated" if user.is_active else "locked / suspended"
        return Response({
            "detail": f"Sub-admin access for {user.email} has been {state_label}.",
            "is_active": user.is_active,
            "sub_admin": SubAdminPermissionSerializer(sub_perm).data,
        }, status=status.HTTP_200_OK)

