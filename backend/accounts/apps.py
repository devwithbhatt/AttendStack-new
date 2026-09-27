from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        from django.contrib import admin
        from accounts.admin_restrictions import SUPER_ADMIN_EMAIL

        def has_permission(request):
            user = getattr(request, "user", None)
            return bool(
                user
                and user.is_authenticated
                and user.is_active
                and user.is_staff
                and user.email.lower() == SUPER_ADMIN_EMAIL
            )

        # Enforced at the AdminSite layer (server-side), independent of
        # is_staff/is_superuser/role — see accounts/admin_restrictions.py.
        admin.site.has_permission = has_permission
