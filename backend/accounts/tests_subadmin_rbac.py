from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from organizations.models import Organization
from accounts.models import UserRole, SubAdminPermission
from employees.models import Employee, EmployeeStatus
from attendance.models import AttendanceRecord, AttendanceStatus
from tasks.models import Project, Task
from django.utils import timezone
from datetime import date

User = get_user_model()


class SubAdminRBACTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        # 1. Create Organization Owner (HR)
        self.hr_user = User.objects.create_user(
            email="hr.owner@example.com",
            password="Password123!",
            first_name="Primary",
            last_name="HR",
            role=UserRole.HR,
        )
        self.org = Organization.objects.create(
            name="Alpha Corp",
            owner=self.hr_user,
        )

        # 2. Create Sub-Admin User
        self.sub_user = User.objects.create_user(
            email="sub.admin@example.com",
            password="SubPassword123!",
            first_name="Sub",
            last_name="Admin",
            role=UserRole.SUB_ADMIN,
        )
        self.sub_perm = SubAdminPermission.objects.create(
            user=self.sub_user,
            organization=self.org,
            custom_role_title="Operations Lead",
            permissions={
                "dashboard": {"view": True, "edit": False, "delete": False},
                "employees": {"view": True, "edit": True, "delete": False},
                "attendance": {"view": True, "edit": True, "delete": False},
                "leaves": {"view": True, "edit": True, "delete": False},
                "holidays": {"view": True, "edit": True, "delete": False},
                "payroll": {"view": False, "edit": False, "delete": False},
                "tasks": {"view": True, "edit": True, "delete": False},
                "chat": {"view": True, "edit": True, "delete": False},
                "settings": {"view": False, "edit": False, "delete": False},
            }
        )

        # 3. Create Employees in Alpha Corp
        self.emp1 = Employee.objects.create(
            organization=self.org,
            full_name="Alice Smith",
            email="alice@alphacorp.com",
            employee_id="EMP-001",
            joining_date=date(2025, 1, 1),
            status=EmployeeStatus.ACTIVE,
        )
        self.emp2 = Employee.objects.create(
            organization=self.org,
            full_name="Bob Jones",
            email="bob@alphacorp.com",
            employee_id="EMP-002",
            joining_date=date(2025, 1, 1),
            status=EmployeeStatus.ACTIVE,
        )

        # 4. Another Organization (should be isolated from Sub-Admin)
        self.other_hr = User.objects.create_user(
            email="other.hr@example.com",
            password="Password123!",
            role=UserRole.HR,
        )
        self.other_org = Organization.objects.create(
            name="Beta Inc",
            owner=self.other_hr,
        )
        self.other_emp = Employee.objects.create(
            organization=self.other_org,
            full_name="Charlie Other",
            email="charlie@betainc.com",
            employee_id="EMP-999",
            joining_date=date(2025, 1, 1),
            status=EmployeeStatus.ACTIVE,
        )

    def test_sub_admin_login_returns_permissions_and_organization(self):
        login_res = self.client.post("/api/v1/accounts/login/", {
            "email": "sub.admin@example.com",
            "password": "SubPassword123!",
        })
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        data = login_res.data
        self.assertIn("user", data)
        self.assertIn("organization", data)
        self.assertIsNotNone(data["organization"])
        self.assertEqual(data["organization"]["id"], self.org.id)
        self.assertEqual(data["organization"]["name"], "Alpha Corp")

        # Verify user profile in payload contains permissions
        user_data = data["user"]
        self.assertEqual(user_data["role"], UserRole.SUB_ADMIN)
        self.assertEqual(user_data["custom_role_title"], "Operations Lead")
        self.assertIn("permissions", user_data)
        self.assertTrue(user_data["permissions"]["employees"]["view"])
        self.assertTrue(user_data["permissions"]["employees"]["edit"])
        self.assertFalse(user_data["permissions"]["employees"]["delete"])
        self.assertFalse(user_data["permissions"]["payroll"]["view"])

    def test_sub_admin_employee_directory_scoping(self):
        self.client.force_authenticate(user=self.sub_user)
        res = self.client.get("/api/v1/employees/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get("results", [])
        emp_names = [e["full_name"] for e in results]
        self.assertIn("Alice Smith", emp_names)
        self.assertIn("Bob Jones", emp_names)
        self.assertNotIn("Charlie Other", emp_names)

    def test_sub_admin_today_attendance_scoping(self):
        self.client.force_authenticate(user=self.sub_user)
        res = self.client.get("/api/v1/attendance/today/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        emp_ids = [r["employee_id"] for r in res.data]
        self.assertIn("EMP-001", emp_ids)
        self.assertIn("EMP-002", emp_ids)
        self.assertNotIn("EMP-999", emp_ids)

    def test_sub_admin_workspace_organization_me(self):
        self.client.force_authenticate(user=self.sub_user)
        res = self.client.get("/api/v1/organizations/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], self.org.id)
        self.assertEqual(res.data["name"], "Alpha Corp")

    def test_sub_admin_blocked_from_unauthorized_module_payroll(self):
        self.client.force_authenticate(user=self.sub_user)
        res = self.client.get("/api/v1/payroll/")
        # Sub-Admin has payroll.view = False, so should be 403 Forbidden
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_sub_admin_blocked_from_admin_only_subadmins_management(self):
        self.client.force_authenticate(user=self.sub_user)
        res = self.client.get("/api/v1/accounts/sub-admins/")
        # Sub-Admins cannot access sub-admins management viewset (only HR/SuperAdmin)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
