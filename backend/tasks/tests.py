from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from employees.models import Employee, EmployeeStatus
from organizations.models import Organization
from .models import Project, Task


class CompanyOwnerWorkspaceTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_hr(
            email="owner@northstar.example",
            password="StrongPass123!",
            first_name="Maya",
            last_name="Singh",
        )
        self.organization = Organization.objects.create(name="Northstar Labs", owner=self.owner)
        self.employee = Employee.objects.create(
            organization=self.organization,
            full_name="Arjun Patel",
            email="arjun@northstar.example",
            phone="9876543210",
        )
        self.client.force_authenticate(self.owner)

    def test_company_owner_without_employee_profile_can_create_project_and_assign_task(self):
        project_response = self.client.post(
            reverse("tasks:project-list"),
            {"name": "Launch plan", "key": "LAUNCH", "status": "ACTIVE", "color": "#4f46e5"},
            format="json",
        )

        self.assertEqual(project_response.status_code, status.HTTP_201_CREATED, project_response.data)
        project = Project.objects.get(pk=project_response.data["id"])
        self.assertEqual(project.organization, self.organization)
        self.assertIsNone(project.owner)
        self.assertEqual(project.created_by, self.owner)

        employees_response = self.client.get("/api/v1/employees/")
        self.assertEqual(employees_response.status_code, status.HTTP_200_OK)
        self.assertEqual(employees_response.data["results"][0]["id"], str(self.employee.id))

        task_response = self.client.post(
            reverse("tasks:task-list"),
            {
                "title": "Prepare launch copy",
                "project": str(project.id),
                "assignee": str(self.employee.id),
                "assignees": [str(self.employee.id)],
                "priority": "HIGH",
                "status": "TODO",
            },
            format="json",
        )

        self.assertEqual(task_response.status_code, status.HTTP_201_CREATED, task_response.data)
        task = Task.objects.get(pk=task_response.data["id"])
        self.assertEqual(task.assignee, self.employee)
        self.assertEqual(task.assigned_by, self.owner)

    def test_cannot_assign_task_to_inactive_or_terminated_employee(self):
        project = Project.objects.create(
            organization=self.organization,
            name="Restricted assignment",
            key="RESTRICT",
            created_by=self.owner,
        )

        for blocked_status in (EmployeeStatus.INACTIVE, EmployeeStatus.TERMINATED):
            self.employee.status = blocked_status
            self.employee.save(update_fields=["status", "updated_at"])
            response = self.client.post(
                reverse("tasks:task-list"),
                {
                    "title": "Must not be assigned",
                    "project": str(project.id),
                    "assignee": str(self.employee.id),
                    "assignees": [str(self.employee.id)],
                    "status": "TODO",
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
            self.assertIn(blocked_status.title(), str(response.data))

    def test_company_sees_employee_task_from_legacy_unscoped_project(self):
        legacy_project = Project.objects.create(
            name="Legacy project",
            key="LEGACY",
            created_by=self.owner,
        )
        task = Task.objects.create(
            title="Legacy assigned work",
            project=legacy_project,
            assignee=self.employee,
            assigned_by=self.owner,
            status="TODO",
        )
        task.assignees.add(self.employee)

        response = self.client.get(reverse("tasks:task-list"), {"page_size": 100})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(task.id), {row["id"] for row in response.data["results"]})

    def test_workspace_can_load_more_than_one_hundred_tasks(self):
        project = Project.objects.create(
            organization=self.organization,
            name="Large delivery",
            key="LARGE",
            created_by=self.owner,
        )
        Task.objects.bulk_create([
            Task(
                title=f"Work item {index}",
                project=project,
                assignee=self.employee,
                assigned_by=self.owner,
                status="TODO",
            )
            for index in range(125)
        ])

        response = self.client.get(reverse("tasks:task-list"), {"page_size": 500})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 125)
        self.assertEqual(len(response.data["results"]), 125)


class CrossDepartmentTaskAssignmentTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.assigner_user = User.objects.create_user(
            email="engineer@northstar.example",
            password="StrongPass123!",
            employee_id="ENG-001",
        )
        self.organization = Organization.objects.create(name="Northstar Labs")
        self.assigner = Employee.objects.create(
            organization=self.organization,
            employee_id="ENG-001",
            full_name="Engineering Employee",
            email=self.assigner_user.email,
            phone="9876543210",
            department="Engineering",
        )
        self.assignee = Employee.objects.create(
            organization=self.organization,
            employee_id="DES-001",
            full_name="Design Employee",
            email="designer@northstar.example",
            phone="9876543211",
            department="Design",
        )
        self.outside_employee = Employee.objects.create(
            organization=Organization.objects.create(name="Outside Company"),
            employee_id="OUT-001",
            full_name="Outside Employee",
            email="outside@example.com",
            phone="9876543212",
            department="Design",
        )
        self.client.force_authenticate(self.assigner_user)

    def test_employee_can_assign_task_to_another_department_in_same_organization(self):
        employees_response = self.client.get("/api/v1/employees/")
        visible_employee_ids = {
            employee["id"] for employee in employees_response.data["results"]
        }
        self.assertIn(str(self.assignee.id), visible_employee_ids)
        self.assertNotIn(str(self.outside_employee.id), visible_employee_ids)

        project_response = self.client.post(
            reverse("tasks:project-list"),
            {
                "name": "Cross-functional launch",
                "key": "XLAUNCH",
                "status": "ACTIVE",
                "color": "#4f46e5",
            },
            format="json",
        )
        self.assertEqual(
            project_response.status_code,
            status.HTTP_201_CREATED,
            project_response.data,
        )

        task_response = self.client.post(
            reverse("tasks:task-list"),
            {
                "title": "Prepare launch visuals",
                "project": project_response.data["id"],
                "assignee": str(self.assignee.id),
                "assignees": [str(self.assignee.id)],
                "priority": "HIGH",
                "status": "TODO",
            },
            format="json",
        )

        self.assertEqual(
            task_response.status_code,
            status.HTTP_201_CREATED,
            task_response.data,
        )
        task = Task.objects.get(pk=task_response.data["id"])
        self.assertEqual(task.assignee, self.assignee)
        self.assertEqual(task.assigned_by, self.assigner_user)

    def test_inactive_employee_workspace_is_read_only(self):
        project = Project.objects.create(
            organization=self.organization,
            name="Existing project",
            key="EXISTING",
            owner=self.assigner,
            created_by=self.assigner_user,
        )
        self.assigner.status = EmployeeStatus.INACTIVE
        self.assigner.save(update_fields=["status", "updated_at"])

        project_response = self.client.post(
            reverse("tasks:project-list"),
            {"name": "Blocked project", "key": "BLOCKED", "status": "ACTIVE"},
            format="json",
        )
        task_response = self.client.post(
            reverse("tasks:task-list"),
            {
                "title": "Blocked task",
                "project": str(project.id),
                "assignee": str(self.assignee.id),
                "assignees": [str(self.assignee.id)],
                "status": "TODO",
            },
            format="json",
        )

        self.assertEqual(project_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(task_response.status_code, status.HTTP_403_FORBIDDEN)
