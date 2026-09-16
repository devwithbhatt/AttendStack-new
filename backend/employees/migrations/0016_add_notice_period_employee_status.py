from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0015_employee_custom_increment_months_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="employee",
            name="status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("PROVISION", "Provision"),
                    ("ON_LEAVE", "On Leave"),
                    ("NOTICE_PERIOD", "Notice Period"),
                    ("INACTIVE", "Inactive"),
                    ("TERMINATED", "Terminated"),
                ],
                db_index=True,
                default="ACTIVE",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="employeestatushistory",
            name="status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("PROVISION", "Provision"),
                    ("ON_LEAVE", "On Leave"),
                    ("NOTICE_PERIOD", "Notice Period"),
                    ("INACTIVE", "Inactive"),
                    ("TERMINATED", "Terminated"),
                ],
                max_length=20,
            ),
        ),
    ]
