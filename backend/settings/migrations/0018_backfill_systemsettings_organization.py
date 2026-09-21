from django.db import migrations


def backfill_organization(apps, schema_editor):
    """
    Attribute the pre-existing global settings row to the platform's oldest
    (first-created) organization — the one it was actually configuring in
    practice, since every tenant shared this single row before this migration.
    Every other existing organization gets a fresh row with model defaults,
    so their settings stop being tied to that org's real business data.
    """
    SystemSettings = apps.get_model("settings", "SystemSettings")
    Organization = apps.get_model("organizations", "Organization")

    oldest_org = Organization.objects.order_by("id").first()

    legacy_settings = SystemSettings.objects.filter(organization__isnull=True).order_by("id").first()
    if legacy_settings is not None and oldest_org is not None:
        legacy_settings.organization = oldest_org
        legacy_settings.save(update_fields=["organization"])

    for org in Organization.objects.all():
        SystemSettings.objects.get_or_create(organization=org)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0017_systemsettings_organization"),
    ]

    operations = [
        migrations.RunPython(backfill_organization, noop_reverse),
    ]
