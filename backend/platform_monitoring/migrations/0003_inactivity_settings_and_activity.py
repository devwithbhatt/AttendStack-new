import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("platform_monitoring", "0002_snapshot_settings_and_snapshots"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformInactivitySettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("idle_threshold_minutes", models.PositiveIntegerField(default=3)),
                ("long_interval_threshold_minutes", models.PositiveIntegerField(default=10)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Platform Inactivity Settings",
                "verbose_name_plural": "Platform Inactivity Settings",
            },
        ),
        migrations.CreateModel(
            name="PlatformActivityEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(blank=True, max_length=500)),
                ("app_name", models.CharField(blank=True, max_length=200)),
                ("url", models.URLField(blank=True, max_length=2000)),
                ("started_at", models.DateTimeField(db_index=True)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("duration_seconds", models.PositiveIntegerField(default=0)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="activity_entries",
                        to="platform_monitoring.platformmonitoreddevice",
                    ),
                ),
            ],
            options={
                "ordering": ["-started_at"],
                "indexes": [
                    models.Index(fields=["device", "started_at"], name="platmon_activity_dev_start"),
                ],
            },
        ),
    ]
