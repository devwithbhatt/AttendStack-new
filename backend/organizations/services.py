import hashlib
import hmac
import json
import logging
import secrets
import urllib.error
import urllib.request
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def mask_code(code) -> str:
    """For logs only. An invite code lets anyone self-register as an active
    employee of the company, so it is a credential and never logged in full —
    just enough of it to tell codes apart while debugging."""
    code = str(code or "")
    return f"{code[:4]}…{code[-2:]}" if len(code) > 6 else "***"


def sync_invite_code_to_simplyjob(organization) -> dict:
    """
    Synchronizes an organization's new invite code to SimplyJob.
    Performs:
    1. Direct atomic database update to SimplyJob PostgreSQL/Supabase DB.
    2. Signed HTTP Webhook notification to SimplyJob API.
    """
    if not organization:
        return {"ok": False, "error": "No organization provided."}

    source_company_id = str(organization.external_company_id or "").strip()
    if not source_company_id and organization.external_source != "SIMPLYJOB":
        return {"ok": False, "skipped": True, "reason": "Not linked to SimplyJob"}

    results = {"db_updated": False, "webhook_sent": False}
    zuperhr_invite_code = str(organization.invite_code).strip()
    zuperhr_org_id = str(organization.id).strip()

    # 1. Direct SimplyJob Database Sync (Instant & Fail-safe)
    db_url = getattr(settings, "SIMPLYJOB_DATABASE_URL", "").strip()
    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url, connect_timeout=5)
            with conn.cursor() as cur:
                if source_company_id and source_company_id.isdigit():
                    cur.execute(
                        """
                        UPDATE companies_company
                        SET zuperhr_invite_code = %s,
                            zuperhr_organization_id = %s,
                            updated_at = NOW()
                        WHERE id = %s OR zuperhr_organization_id = %s;
                        """,
                        (zuperhr_invite_code, zuperhr_org_id, int(source_company_id), zuperhr_org_id)
                    )
                else:
                    cur.execute(
                        """
                        UPDATE companies_company
                        SET zuperhr_invite_code = %s,
                            zuperhr_organization_id = %s,
                            updated_at = NOW()
                        WHERE zuperhr_organization_id = %s;
                        """,
                        (zuperhr_invite_code, zuperhr_org_id, zuperhr_org_id)
                    )
                conn.commit()
                results["db_updated"] = (cur.rowcount > 0)
                logger.info(
                    "Direct SimplyJob DB updated (%d rows) for organization %s, invite code %s",
                    cur.rowcount, zuperhr_org_id, mask_code(zuperhr_invite_code),
                )
            conn.close()
        except Exception as exc:
            logger.warning("Direct SimplyJob DB sync error: %s", exc)
            results["db_error"] = str(exc)

    # 2. HTTP Webhook Sync (for active socket listeners or remote instances)
    webhook_url = getattr(settings, "SIMPLYJOB_WEBHOOK_URL", "").strip()
    secret = getattr(settings, "SIMPLYJOB_ONBOARDING_SECRET", "").strip()

    if webhook_url and secret:
        payload_data = {
            "source_company_id": source_company_id,
            "zuperhr_organization_id": zuperhr_org_id,
            "zuperhr_invite_code": zuperhr_invite_code,
            "timestamp": int(timezone.now().timestamp()),
            "nonce": secrets.token_hex(8),
        }
        try:
            payload_bytes = json.dumps(payload_data).encode("utf-8")
            signature = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()

            req = urllib.request.Request(
                webhook_url,
                data=payload_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-ZuperHR-Signature": signature,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=4) as response:
                res_body = json.loads(response.read().decode("utf-8") or "{}")
                results["webhook_sent"] = True
                results["webhook_response"] = res_body
        except Exception as exc:
            results["webhook_error"] = str(exc)

    results["ok"] = bool(results["db_updated"] or results["webhook_sent"])
    results["zuperhr_invite_code"] = zuperhr_invite_code
    return results


def get_organization_for_user(user):
    """
    Standardized multi-tenant organization resolver supporting:
    1. Sub-Admins via subadmin_profile / SubAdminPermission mapping
    2. Primary HR / Owners via Organization.owner
    3. Linked Employees via Employee.organization or employee_profile
    4. Reverse relation on Organization
    5. Super Admin default organization fallback
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None

    from organizations.models import Organization
    from employees.models import Employee

    # 1. Sub-Admin Profile or SubAdminPermission mapping
    if getattr(user, "role", "") == "SUB_ADMIN" or hasattr(user, "subadmin_profile"):
        sub = getattr(user, "subadmin_profile", None)
        if sub and getattr(sub, "organization", None):
            return sub.organization
        from accounts.models import SubAdminPermission
        sub_perm = SubAdminPermission.objects.filter(user=user).select_related("organization").first()
        if sub_perm and sub_perm.organization:
            return sub_perm.organization

    # 2. Direct Ownership (Primary HR / Workspace Owner)
    org = Organization.objects.filter(owner=user).first()
    if org:
        return org

    # 3. Employee Profile on user model
    if hasattr(user, "employee_profile") and user.employee_profile and user.employee_profile.organization:
        return user.employee_profile.organization

    # 4. Employee record lookup by email
    emp = Employee.objects.filter(email__iexact=user.email, organization__isnull=False).select_related("organization").first()
    if emp and emp.organization:
        return emp.organization

    # 5. Reverse employee relation on Organization
    org = Organization.objects.filter(employees__email__iexact=user.email).first()
    if org:
        return org

    # 6. Fallback SubAdmin check in case role wasn't explicitly SUB_ADMIN
    try:
        from accounts.models import SubAdminPermission
        sub_perm = SubAdminPermission.objects.filter(user=user).select_related("organization").first()
        if sub_perm and sub_perm.organization:
            return sub_perm.organization
    except Exception:
        pass

    # 7. Super Admin fallback
    if getattr(user, "is_superuser", False) or getattr(user, "role", "") == "SUPER_ADMIN":
        return Organization.objects.order_by("created_at").first()

    return None


def resolve_organization_for_request(request):
    """
    Resolve the organization a per-tenant operational endpoint (Employees,
    Attendance, Payroll, Leave Requests, Shifts, ...) should be scoped to.

    Non-super-admin users are always scoped to their own organization via
    get_organization_for_user, unchanged.

    Super Admin accounts manage the whole platform, but in practice the
    same account is very often *also* the real owner of one specific
    company (the account that stood the platform up in the first place —
    see Organization.owner). These per-tenant ViewSets are views of ONE
    company's data, not a cross-tenant aggregate (that's what the dedicated
    Super Admin dashboard/summary endpoints are for), so:

    1. An explicit `organization_id` query parameter always wins — this is
       how a Super Admin inspects a company they do NOT own (e.g. support/
       oversight on a tenant they aren't the owner of).
    2. Without one, fall back to the company this Super Admin actually
       owns, if any — so their own day-to-day Employees/Payroll/Attendance
       pages keep working exactly as before, with no frontend changes.
    3. Only if neither applies does this return None, and every caller
       must treat None as "show nothing" — never silently fall back to
       "show every organization's data blended together", which is what
       happened here before this helper existed.
    """
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return None

    # Note: `is_staff` deliberately excluded — create_hr()/create_sub_admin()
    # both default it to True for ordinary, org-scoped company accounts in
    # this codebase, so it is not a reliable "platform-wide admin" signal
    # here the way Django's own convention might suggest.
    is_platform_admin = (
        getattr(user, "is_superuser", False)
        or getattr(user, "role", "") == "SUPER_ADMIN"
    )
    if is_platform_admin:
        from organizations.models import Organization

        org_id = request.query_params.get("organization_id")
        if org_id:
            return Organization.objects.filter(id=org_id).first()
        return Organization.objects.filter(owner=user).first()

    return get_organization_for_user(user)

