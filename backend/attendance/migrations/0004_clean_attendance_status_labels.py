from django.db import migrations, models


def migrate_legacy_statuses(apps, schema_editor):
    AttendanceRecord = apps.get_model("attendance", "AttendanceRecord")
    AttendanceRecord.objects.filter(status="ON_LEAVE").update(status="LEAVE")
    AttendanceRecord.objects.filter(status="UNPAID_DAY").update(status="SUNDAY_UNPAID")


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0003_alter_attendancerecord_status"),
    ]

    operations = [
        migrations.RunPython(migrate_legacy_statuses, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="attendancerecord",
            name="status",
            field=models.CharField(
                choices=[
                    ("PRESENT", "Present"),
                    ("LATE", "Late Entry"),
                    ("HALF_DAY", "Half Day"),
                    ("ABSENT", "Absent"),
                    ("LEAVE", "Leave"),
                    ("PAID_LEAVE", "Paid Leave"),
                    ("HOLIDAY", "Holiday"),
                    ("SUNDAY_UNPAID", "Sunday Unpaid"),
                ],
                db_index=True,
                default="PRESENT",
                max_length=20,
            ),
        ),
    ]
