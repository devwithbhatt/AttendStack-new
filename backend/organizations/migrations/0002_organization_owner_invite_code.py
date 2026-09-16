from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import organizations.models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_passwordresetotp"),
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="owned_organizations",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="invite_code",
            field=models.CharField(
                db_index=True,
                default=organizations.models.generate_invite_code,
                editable=False,
                max_length=12,
                unique=True,
            ),
        ),
    ]
