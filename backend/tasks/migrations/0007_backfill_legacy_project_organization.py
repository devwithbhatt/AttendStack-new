from django.db import migrations


def backfill_legacy_project_organization(apps, schema_editor):
    Project = apps.get_model("tasks", "Project")
    Organization = apps.get_model("organizations", "Organization")

    owner_organizations = {
        organization.owner_id: organization.id
        for organization in Organization.objects.exclude(owner__isnull=True)
    }

    for project in Project.objects.filter(organization__isnull=True).select_related("owner"):
        organization_id = None
        if project.owner_id and project.owner.organization_id:
            organization_id = project.owner.organization_id
        elif project.created_by_id:
            organization_id = owner_organizations.get(project.created_by_id)

        if organization_id:
            project.organization_id = organization_id
            project.save(update_fields=["organization"])


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0012_backfill_legacy_primary_organization"),
        ("tasks", "0006_task_assignees"),
    ]

    operations = [
        migrations.RunPython(
            backfill_legacy_project_organization,
            migrations.RunPython.noop,
        ),
    ]
