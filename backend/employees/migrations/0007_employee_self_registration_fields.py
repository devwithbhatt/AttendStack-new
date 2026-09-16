import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("employees", "0006_restore_employee_login_access"),
    ]

    operations = [
        migrations.AlterField(
            model_name="employee",
            name="aadhaar_number",
            field=models.CharField(
                blank=True,
                max_length=12,
                null=True,
                unique=True,
                validators=[django.core.validators.RegexValidator("^[0-9]{12}$", "Aadhaar number must be 12 digits.")],
            ),
        ),
        migrations.AlterField(
            model_name="employee",
            name="annual_salary",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AlterField(
            model_name="employee",
            name="bank_account_number",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AlterField(
            model_name="employee",
            name="bank_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AlterField(
            model_name="employee",
            name="department",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AlterField(
            model_name="employee",
            name="designation",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AlterField(
            model_name="employee",
            name="tax_id",
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
