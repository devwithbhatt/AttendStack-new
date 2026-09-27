"""
Single source of truth for the one email allowed into Django /admin/.

is_staff / is_superuser / role=SUPER_ADMIN are necessary but not sufficient:
an account with all three set but a different email must still be denied.
Wired up via AdminSite.has_permission in accounts/apps.py so the restriction
is enforced server-side, not just hidden in the UI.
"""

SUPER_ADMIN_EMAIL = "bhattsquare1@gmail.com"
