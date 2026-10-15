from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_merge_20260922_1416'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='chat_last_seen_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
