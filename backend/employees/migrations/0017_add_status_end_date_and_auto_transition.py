from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0016_add_notice_period_employee_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="auto_transition_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("ACTIVE", "Active"),
                    ("PROVISION", "Provision"),
                    ("ON_LEAVE", "On Leave"),
                    ("NOTICE_PERIOD", "Notice Period"),
                    ("INACTIVE", "Inactive"),
                    ("TERMINATED", "Terminated"),
                ],
                help_text="Status to automatically transition to after status_end_date expires.",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="employee",
            name="status_end_date",
            field=models.DateField(
                blank=True,
                help_text="Optional end date for status period (e.g. end of notice period or provision).",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="employeestatushistory",
            name="auto_transition_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("ACTIVE", "Active"),
                    ("PROVISION", "Provision"),
                    ("ON_LEAVE", "On Leave"),
                    ("NOTICE_PERIOD", "Notice Period"),
                    ("INACTIVE", "Inactive"),
                    ("TERMINATED", "Terminated"),
                ],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="employeestatushistory",
            name="end_date",
            field=models.DateField(
                blank=True,
                help_text="End date for this status period.",
                null=True,
            ),
        ),
    ]
