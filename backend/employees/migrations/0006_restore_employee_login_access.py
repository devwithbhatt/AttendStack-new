from django.db import migrations
from django.db.models import Q


def restore_employee_login_access(apps, schema_editor):
    Employee = apps.get_model("employees", "Employee")
    User = apps.get_model("accounts", "User")

    for employee in Employee.objects.iterator():
        lookup = Q(email__iexact=employee.email)
        if employee.employee_id:
            lookup |= Q(employee_id=employee.employee_id)
        User.objects.filter(
            lookup,
            role="EMPLOYEE",
            is_active=False,
        ).update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_passwordresetotp"),
        ("employees", "0005_alter_employee_annual_salary"),
    ]

    operations = [
        migrations.RunPython(restore_employee_login_access, migrations.RunPython.noop),
    ]
