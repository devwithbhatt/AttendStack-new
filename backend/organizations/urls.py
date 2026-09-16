from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrganizationViewSet,
    AdministratorViewSet,
    PlanViewSet,
    OrganizationVerifyCodeView,
    OrganizationVerifyApiKeyView,
    OrganizationEmployeesSyncStatusView,
)

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet)
router.register(r"administrators", AdministratorViewSet)
router.register(r"plans", PlanViewSet)

urlpatterns = [
    path("organizations/me/", OrganizationViewSet.as_view({"get": "me"}), name="organization-me"),
    path("organizations/me/regenerate-api-key/", OrganizationViewSet.as_view({"post": "regenerate_api_key"}), name="organization-me-regenerate-api-key"),
    path("organizations/me/regenerate-invite-code/", OrganizationViewSet.as_view({"post": "regenerate_invite_code"}), name="organization-me-regenerate-invite-code"),
    path("organizations/verify-code/", OrganizationVerifyCodeView.as_view(), name="organization-verify-code"),
    path("organizations/verify-api-key/", OrganizationVerifyApiKeyView.as_view(), name="organization-verify-api-key"),
    path("organizations/employee-sync-status/", OrganizationEmployeesSyncStatusView.as_view(), name="organization-employees-sync-status"),
    path("", include(router.urls)),
]