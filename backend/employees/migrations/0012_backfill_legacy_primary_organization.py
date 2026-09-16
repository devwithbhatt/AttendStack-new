from django.db import migrations


def backfill_legacy_primary_organization(apps, schema_editor):
    """
    Attach legacy unscoped employees to the one active organization owned by
    a system administrator. If the installation has multiple possible primary
    organizations, leave the data untouched rather than guessing.
    """
    Employee = apps.get_model("employees", "Employee")
    Organization = apps.get_model("organizations", "Organization")

    primary_organizations = Organization.objects.filter(
        is_active=True,
        owner__is_superuser=True,
    )
    if primary_organizations.count() != 1:
        return

    Employee.objects.filter(organization__isnull=True).update(
        organization=primary_organizations.first()
    )


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0011_employee_status_history"),
        ("organizations", "0002_organization_owner_invite_code"),
    ]

    operations = [
        migrations.RunPython(
            backfill_legacy_primary_organization,
            migrations.RunPython.noop,
        ),
    ]
