from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from monitoring.models import Snapshot, SnapshotSettings


class Command(BaseCommand):
    help = "Delete snapshots older than each organisation's retention_days setting."

    def handle(self, *args, **options):
        total_deleted = 0
        for settings in SnapshotSettings.objects.select_related("organization").all():
            cutoff = timezone.now() - timedelta(days=settings.retention_days)
            old = Snapshot.objects.filter(
                organization=settings.organization,
                captured_at__lt=cutoff,
            )
            count = old.count()
            if count:
                for snap in old.iterator(chunk_size=200):
                    snap.image.delete(save=False)
                    snap.delete()
                total_deleted += count
                self.stdout.write(
                    f"  {settings.organization.name}: deleted {count} snapshots older than {settings.retention_days} days"
                )

        if total_deleted == 0:
            self.stdout.write("No expired snapshots found.")
        else:
            self.stdout.write(self.style.SUCCESS(f"Done — {total_deleted} snapshot(s) removed."))
