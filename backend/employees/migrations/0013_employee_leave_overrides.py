from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("employees", "0012_backfill_legacy_primary_organization")]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="casual_leave_days_override",
            field=models.DecimalField(
                blank=True,
                decimal_places=1,
                help_text="Optional annual Casual/PL entitlement. Blank uses company policy.",
                max_digits=5,
                null=True,
                validators=[MinValueValidator(0), MaxValueValidator(365)],
            ),
        ),
        migrations.AddField(
            model_name="employee",
            name="sick_leave_days_override",
            field=models.DecimalField(
                blank=True,
                decimal_places=1,
                help_text="Optional annual Sick Leave entitlement. Blank uses company policy.",
                max_digits=5,
                null=True,
                validators=[MinValueValidator(0), MaxValueValidator(365)],
            ),
        ),
    ]
