import logging
from django.http import JsonResponse

logger = logging.getLogger(__name__)

PATH_FEATURE_MAP = {
    "/api/v1/chat/": "allows_chat",
    "/api/v1/tasks/": "allows_projects_tasks",
    "/api/v1/payroll/": "allows_payroll_reports",
    "/api/v1/monitoring/": "allows_geofencing",
}

EXEMPT_METHODS = {"OPTIONS", "HEAD"}

EXEMPT_PATHS = {
    "/api/v1/chat/presence/heartbeat/",
}


def _resolve_plan_features(organization):
    from organizations.models import Plan

    plan_name = organization.plan_name or ""
    plan = Plan.objects.filter(name__iexact=plan_name, is_active=True).first()
    if not plan:
        plan = Plan.objects.filter(
            slug__iexact=plan_name.lower().replace(" ", "-"), is_active=True
        ).first()

    if plan:
        return {
            "allows_chat": plan.allows_chat,
            "allows_projects_tasks": plan.allows_projects_tasks,
            "allows_payroll_reports": plan.allows_payroll_reports,
            "allows_geofencing": plan.allows_geofencing,
        }

    if organization.plan_source == "SIMPLYJOB":
        return {
            "allows_chat": False,
            "allows_projects_tasks": False,
            "allows_payroll_reports": False,
            "allows_geofencing": False,
        }

    return {
        "allows_chat": True,
        "allows_projects_tasks": True,
        "allows_payroll_reports": True,
        "allows_geofencing": True,
    }


class PlanEnforcementMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in EXEMPT_METHODS:
            return self.get_response(request)

        path = request.path

        if path in EXEMPT_PATHS:
            return self.get_response(request)

        required_feature = None
        for prefix, feature_key in PATH_FEATURE_MAP.items():
            if path.startswith(prefix):
                required_feature = feature_key
                break

        if required_feature is None:
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return self.get_response(request)

        from accounts.models import UserRole
        if getattr(user, "role", "") == UserRole.SUPER_ADMIN or user.is_superuser:
            return self.get_response(request)

        from organizations.services import get_organization_for_user
        organization = get_organization_for_user(user)
        if not organization:
            return self.get_response(request)

        features = _resolve_plan_features(organization)
        if not features.get(required_feature, True):
            feature_label = required_feature.replace("allows_", "").replace("_", " ").title()
            return JsonResponse(
                {
                    "detail": f"{feature_label} is not available on your current plan. Please upgrade to access this feature.",
                    "code": "plan_feature_locked",
                    "required_feature": required_feature,
                },
                status=403,
            )

        return self.get_response(request)
