"""
AttendStack – Emergency 2FA Reset Command
Usage:
    python manage.py reset_2fa --email <admin_email>
    python manage.py reset_2fa --list
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from accounts.models import UserTwoFactor

User = get_user_model()


class Command(BaseCommand):
    help = "Emergency CLI recovery tool to reset or inspect Two-Factor Authentication (2FA) for any user."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            type=str,
            help="Email of the user (Super Admin, HR, Sub-Admin) whose 2FA needs to be reset.",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="List all users who currently have 2FA enabled.",
        )

    def handle(self, *args, **options):
        if options.get("list"):
            active_2fa_configs = UserTwoFactor.objects.filter(is_enabled=True).select_related("user")
            if not active_2fa_configs.exists():
                self.stdout.write(self.style.WARNING("No users currently have 2FA enabled."))
                return

            self.stdout.write(self.style.SUCCESS("Users with active 2FA:"))
            for cfg in active_2fa_configs:
                u = cfg.user
                self.stdout.write(
                    f" - {u.email} [{u.role}] (ID: {u.id}) | Remaining backup codes: {cfg.remaining_backup_codes_count} | Last used: {cfg.last_used_at or 'Never'}"
                )
            return

        email = options.get("email")
        if not email:
            raise CommandError("Please specify an email with --email <email> or use --list.")

        user = User.objects.filter(email__iexact=email.strip()).first()
        if not user:
            raise CommandError(f"No user found with email '{email}'.")

        two_factor = getattr(user, "two_factor", None)
        if not two_factor or not two_factor.is_enabled:
            self.stdout.write(
                self.style.WARNING(f"2FA is already NOT active for user '{user.email}'.")
            )
            return

        two_factor.is_enabled = False
        two_factor.secret_key = ""
        two_factor.backup_codes = []
        two_factor.save(update_fields=["is_enabled", "secret_key", "backup_codes", "updated_at"])

        self.stdout.write(
            self.style.SUCCESS(
                f"SUCCESS: 2FA has been reset and disabled for '{user.email}' ({user.role}).\n"
                f"The user can now log in using their primary password and re-enroll their authenticator app."
            )
        )
