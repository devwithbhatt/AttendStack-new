from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


ATTENDANCE_ELIGIBLE_STATUSES = {"ACTIVE", "PROVISION", "ON_LEAVE"}


def seed_employee_status_history(apps, schema_editor):
    Employee = apps.get_model("employees", "Employee")
    EmployeeStatusHistory = apps.get_model("employees", "EmployeeStatusHistory")

    history_rows = []
    today = timezone.localdate()
    for employee in Employee.objects.all().iterator():
        if employee.status in ATTENDANCE_ELIGIBLE_STATUSES:
            effective_date = employee.joining_date
        else:
            last_updated = timezone.localdate(employee.updated_at) if employee.updated_at else today
            effective_date = max(employee.joining_date, min(last_updated, today))
            if effective_date > employee.joining_date:
                history_rows.append(
                    EmployeeStatusHistory(
                        employee_id=employee.pk,
                        status="ACTIVE",
                        effective_date=employee.joining_date,
                    )
                )

        history_rows.append(
            EmployeeStatusHistory(
                employee_id=employee.pk,
                status=employee.status,
                effective_date=effective_date,
            )
        )

    EmployeeStatusHistory.objects.bulk_create(history_rows, batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0010_add_provision_employee_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeStatusHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("ACTIVE", "Active"),
                            ("PROVISION", "Provision"),
                            ("INACTIVE", "Inactive"),
                            ("ON_LEAVE", "On Leave"),
                            ("TERMINATED", "Terminated"),
                        ],
                        max_length=20,
                    ),
                ),
                ("effective_date", models.DateField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="status_history",
                        to="employees.employee",
                    ),
                ),
            ],
            options={
                "ordering": ["effective_date", "created_at", "pk"],
            },
        ),
        migrations.AddIndex(
            model_name="employeestatushistory",
            index=models.Index(
                fields=["employee", "effective_date"],
                name="employees_e_employe_88f56f_idx",
            ),
        ),
        migrations.RunPython(seed_employee_status_history, migrations.RunPython.noop),
    ]
