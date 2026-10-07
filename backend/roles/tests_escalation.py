from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from attendance.models import Shift
from employees.models import Employee
from organizations.models import Organization
from roles.models import Role, RolePermission
from roles.services import ensure_admin_role

User = get_user_model()


def make_employee(org, code, email, aadhaar):
    return Employee.objects.create(
        organization=org, employee_id=code, full_name=f"{code} Person", email=email,
        phone="9876543210", aadhaar_number=aadhaar, department="Ops", designation="Associate",
        annual_salary=120000, joining_date=date(2026, 1, 1),
    )


class ManagerEscalationTests(APITestCase):
    """A manager with partial rights (Employees + Roles edit, no Settings)
    must not be able to promote themselves, take over an admin's login,
    see the company API key, or touch shifts / another company's plan."""

    def setUp(self):
        self.owner = User.objects.create_user(email="owner@esc.test", password="StrongPass123!", role=UserRole.HR)
        self.org = Organization.objects.create(name="Escalation Org", owner=self.owner)
        self.other_org = Organization.objects.create(name="Victim Org")
        self.admin_role = ensure_admin_role(self.org)

        self.hr_role = Role.objects.create(organization=self.org, name="HR", is_admin=False)
        for module in ("employees", "subadmins"):
            RolePermission.objects.create(role=self.hr_role, module=module, can_view=True, can_edit=True)

        self.manager_emp = make_employee(self.org, "EMP-E-001", "manager@esc.test", "333344445551")
        self.admin_emp = make_employee(self.org, "EMP-E-002", "admin@esc.test", "333344445552")
        self.worker_emp = make_employee(self.org, "EMP-E-003", "worker@esc.test", "333344445553")

        self.manager = User.objects.create_user(
            email="manager@esc.test", password="StrongPass123!", role=UserRole.SUB_ADMIN,
            employee_id="EMP-E-001", custom_role=self.hr_role, is_staff=True,
        )
        self.admin = User.objects.create_user(
            email="admin@esc.test", password="StrongPass123!", role=UserRole.SUB_ADMIN,
            employee_id="EMP-E-002", custom_role=self.admin_role, is_staff=True,
        )
        self.worker = User.objects.create_user(email="worker@esc.test", password="StrongPass123!", employee_id="EMP-E-003")
        self.client.force_authenticate(self.manager)

    def test_cannot_assign_admin_role_to_self(self):
        res = self.client.post(f"/api/v1/employees/{self.manager_emp.id}/assign-role/", {"role_id": str(self.admin_role.id)}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.manager.refresh_from_db()
        self.assertEqual(self.manager.custom_role_id, self.hr_role.id)

    def test_cannot_grant_full_access_to_someone_else(self):
        res = self.client.post(f"/api/v1/employees/{self.worker_emp.id}/assign-role/", {"role_id": str(self.admin_role.id)}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_can_still_assign_a_role_within_own_rights(self):
        res = self.client.post(f"/api/v1/employees/{self.worker_emp.id}/assign-role/", {"role_id": str(self.hr_role.id)}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_cannot_create_role_with_rights_they_lack(self):
        res = self.client.post("/api/v1/roles/", {"name": "Payroll Boss", "permissions": {"payroll": {"view": True, "edit": True, "delete": True}}}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.post("/api/v1/roles/", {"name": "Super", "is_admin": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_widen_own_role(self):
        res = self.client.patch(f"/api/v1/roles/{self.hr_role.id}/", {"permissions": {"employees": {"view": True, "edit": True, "delete": True}}}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_demote_an_admin(self):
        res = self.client.post(f"/api/v1/employees/{self.admin_emp.id}/assign-role/", {"role_id": None}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.custom_role_id, self.admin_role.id)

    def test_cannot_reset_an_admins_password(self):
        res = self.client.post(f"/api/v1/employees/{self.admin_emp.id}/reset-password/", {"password": "Hijack12345!"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.check_password("Hijack12345!"))

    def test_api_key_hidden_from_non_managers(self):
        res = self.client.get("/api/v1/organizations/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("api_key", res.data)
        self.client.force_authenticate(self.owner)
        self.assertIn("api_key", self.client.get("/api/v1/organizations/me/").data)

    def test_cannot_renew_another_companys_plan(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post("/api/v1/organizations/renew-plan/", {"organization_id": self.other_org.id, "plan_name": "Enterprise", "duration_days": 365, "max_employees": 999}, format="json")
        self.other_org.refresh_from_db()
        self.assertNotEqual(self.other_org.plan_name, "Enterprise")
        self.assertIsNone(self.other_org.owner_id)

    def test_plain_employee_cannot_change_shifts(self):
        self.client.force_authenticate(self.worker)
        res = self.client.post("/api/v1/attendance/shifts/", {"name": "Hacked", "start_time": "09:00", "end_time": "17:00"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/v1/attendance/shifts/").status_code, status.HTTP_200_OK)

    def test_admin_created_shift_belongs_to_their_company(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post("/api/v1/attendance/shifts/", {"name": "Night", "start_time": "22:00", "end_time": "06:00"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(Shift.objects.get(name="Night").organization_id, self.org.id)
