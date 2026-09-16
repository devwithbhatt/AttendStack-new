from datetime import timedelta

from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import UserRole


class ActivityTrackingJWTAuthentication(JWTAuthentication):
    """
    Refresh admin/HR activity during authenticated API use.
    This keeps employee-facing live status current without adding noisy writes.
    """

    heartbeat_interval = timedelta(minutes=1)

    def authenticate(self, request):
        authenticated = super().authenticate(request)
        if authenticated is None:
            return None

        user, validated_token = authenticated
        if user.role in (UserRole.SUPER_ADMIN, UserRole.HR):
            now = timezone.now()
            if not user.last_login or now - user.last_login >= self.heartbeat_interval:
                type(user).objects.filter(pk=user.pk).update(last_login=now)
                user.last_login = now

        return user, validated_token
