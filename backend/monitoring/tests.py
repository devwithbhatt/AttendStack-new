from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from organizations.models import Organization
from roles.models import Role, RolePermission
from roles.registry import MODULE_KEYS
from roles.services import ensure_admin_role

from .access import visible_devices
from .models import MonitoredDevice, MonitoringSession

User = get_user_model()


class MonitoringRolePermissionTests(APITestCase):
    """Live Monitoring is a Role module: a Company Admin can give the duty to
    anyone via Settings -> Assign Role. Monitors never see full admins'
    screens; full admins see every device; nobody crosses companies."""

    def setUp(self):
        self.owner = User.objects.create_user(email="owner@mon.test", password="StrongPass123!", role=UserRole.HR)
        self.org = Organization.objects.create(name="Monitor Co", owner=self.owner)
        other_owner = User.objects.create_user(email="owner@other.test", password="StrongPass123!", role=UserRole.HR)
        self.other_org = Organization.objects.create(name="Other Co", owner=other_owner)

        admin_role = ensure_admin_role(self.org)
        self.monitor_role = Role.objects.create(organization=self.org, name="Monitor")
        RolePermission.objects.create(role=self.monitor_role, module="monitoring", can_view=True)
        plain_role = Role.objects.create(organization=self.org, name="Ops")
        RolePermission.objects.create(role=plain_role, module="attendance", can_view=True)

        self.full_admin = User.objects.create_user(email="full@mon.test", password="StrongPass123!", role=UserRole.SUB_ADMIN, custom_role=admin_role)
        self.monitor = User.objects.create_user(email="monitor@mon.test", password="StrongPass123!", role=UserRole.SUB_ADMIN, custom_role=self.monitor_role)
        self.no_perm = User.objects.create_user(email="ops@mon.test", password="StrongPass123!", role=UserRole.SUB_ADMIN, custom_role=plain_role)
        # Staff belong to their company through an employee record.
        from datetime import date
        from employees.models import Employee

        for i, u in enumerate((self.full_admin, self.monitor, self.no_perm), start=1):
            Employee.objects.create(
                organization=self.org, employee_id=f"MON-{i}", full_name=u.email, email=u.email,
                phone="9876543210", aadhaar_number=f"55556666777{i}", department="Ops",
                designation="Staff", annual_salary=120000, joining_date=date(2026, 1, 1),
            )
        worker = User.objects.create_user(email="worker@mon.test", password="StrongPass123!")
        outsider = User.objects.create_user(email="worker@other.test", password="StrongPass123!")

        def device(org, user, name):
            d = MonitoredDevice(organization=org, user=user, device_fingerprint=f"fp-{name}", device_name=name, platform="windows")
            d.set_token()
            d.save()
            return d

        self.worker_pc = device(self.org, worker, "worker-pc")
        self.admin_pc = device(self.org, self.full_admin, "admin-pc")
        self.outsider_pc = device(self.other_org, outsider, "outsider-pc")
        self.url = "/api/v1/monitoring/devices/"

    def _names(self, user):
        self.client.force_authenticate(user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = res.data.get("results", res.data) if isinstance(res.data, dict) else res.data
        return {r["device_name"] for r in rows}

    def test_module_is_offered_in_role_editor(self):
        self.assertIn("monitoring", MODULE_KEYS)

    def test_full_admin_sees_all_own_company_devices(self):
        self.assertEqual(self._names(self.full_admin), {"worker-pc", "admin-pc"})
        self.assertEqual(self._names(self.owner), {"worker-pc", "admin-pc"})

    def test_monitor_role_sees_employees_but_not_admins(self):
        self.assertEqual(self._names(self.monitor), {"worker-pc"})

    def test_role_without_monitoring_is_refused(self):
        self.client.force_authenticate(self.no_perm)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)

    def test_live_view_access_rule(self):
        qs = MonitoredDevice.objects.filter(organization=self.org)
        self.assertTrue(visible_devices(self.monitor, qs).filter(pk=self.worker_pc.pk).exists())
        self.assertFalse(visible_devices(self.monitor, qs).filter(pk=self.admin_pc.pk).exists())
        self.assertFalse(visible_devices(self.no_perm, qs).exists())

    def test_view_only_monitor_cannot_remove_devices(self):
        self.client.force_authenticate(self.monitor)
        res = self.client.post(f"/api/v1/monitoring/devices/{self.worker_pc.id}/revoke/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_monitor_activity_log_hides_admin_device_sessions(self):
        for d in (self.worker_pc, self.admin_pc):
            MonitoringSession.objects.create(organization=self.org, device=d, viewer=self.owner, device_label=d.device_name)
        self.client.force_authenticate(self.monitor)
        res = self.client.get("/api/v1/monitoring/sessions/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data.get("results", res.data) if isinstance(res.data, dict) else res.data
        self.assertEqual({r["device_label"] for r in rows}, {"worker-pc"})
