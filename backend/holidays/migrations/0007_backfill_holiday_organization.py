from django.db import migrations


def backfill_organization(apps, schema_editor):
    """
    Holiday had no organization field at all until the previous migration —
    every existing row is an orphan shared across every tenant. Attribute
    them all to the platform's oldest organization, the one that was
    actually using this feature in practice (every tenant shared a single
    global holiday calendar before this fix, so there's no per-row signal
    to split them by).
    """
    Holiday = apps.get_model("holidays", "Holiday")
    Organization = apps.get_model("organizations", "Organization")

    oldest_org = Organization.objects.order_by("id").first()
    if oldest_org is None:
        return

    Holiday.objects.filter(organization__isnull=True).update(organization=oldest_org)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("holidays", "0006_holiday_organization_alter_holiday_date_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_organization, noop_reverse),
    ]
