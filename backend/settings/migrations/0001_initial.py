from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('employees', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('shift_start_time', models.TimeField(default='10:00:00')),
                ('late_cutoff_time', models.TimeField(default='10:15:00')),
                ('shift_end_time', models.TimeField(default='18:00:00')),
                ('half_day_threshold', models.IntegerField(default=4, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(8)])),
                ('auto_checkout_enabled', models.BooleanField(default=True)),
                ('auto_checkout_time', models.TimeField(default='20:00:00')),
                ('ip_restriction_enabled', models.BooleanField(default=False)),
                ('allowed_ip_ranges', models.TextField(blank=True, null=True)),
                ('geofencing_enabled', models.BooleanField(default=False)),
                ('office_latitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('office_longitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('geofence_radius', models.IntegerField(default=100, validators=[django.core.validators.MinValueValidator(50), django.core.validators.MaxValueValidator(5000)])),
                ('company_name', models.CharField(default='Bhatt Square Pvt. Ltd.', max_length=255)),
                ('company_address', models.TextField(default='123 Business Park, Mumbai, Maharashtra 400001')),
                ('company_email', models.EmailField(default='admin@bhattsquare.com', max_length=254)),
                ('company_phone', models.CharField(default='+91 98765 43210', max_length=20)),
                ('timezone', models.CharField(default='Asia/Kolkata', max_length=50)),
                ('currency', models.CharField(default='INR', max_length=10)),
                ('date_format', models.CharField(default='DD/MM/YYYY', max_length=20)),
                ('working_days', models.JSONField(default=list)),
                ('email_notifications', models.BooleanField(default=True)),
                ('late_entry_alert', models.BooleanField(default=True)),
                ('leave_request_alert', models.BooleanField(default=True)),
                ('salary_processed_alert', models.BooleanField(default=True)),
                ('new_employee_alert', models.BooleanField(default=False)),
                ('browser_notifications', models.BooleanField(default=True)),
                ('weekly_report_enabled', models.BooleanField(default=True)),
                ('weekly_report_day', models.CharField(default='monday', max_length=20)),
                ('min_password_length', models.IntegerField(default=8)),
                ('password_expiry_enabled', models.BooleanField(default=False)),
                ('two_factor_required', models.BooleanField(default=False)),
                ('session_timeout_enabled', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='settings_updated', to='employees.employee')),
            ],
            options={
                'verbose_name': 'System Settings',
                'verbose_name_plural': 'System Settings',
            },
        ),
        migrations.CreateModel(
            name='SettingsChangeLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(max_length=100)),
                ('old_value', models.TextField(blank=True, null=True)),
                ('new_value', models.TextField(blank=True, null=True)),
                ('changed_at', models.DateTimeField(auto_now_add=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('changed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to='employees.employee')),
                ('settings', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='settings.systemsettings')),
            ],
            options={
                'verbose_name': 'Settings Change Log',
                'verbose_name_plural': 'Settings Change Logs',
                'ordering': ['-changed_at'],
            },
        ),
    ]