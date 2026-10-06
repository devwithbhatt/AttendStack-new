from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserRole
from employees.models import Employee, EmployeeStatus
from organizations.models import Organization

from .models import Conversation, ConversationMember

User = get_user_model()


class GroupManagementPermissionTests(TestCase):
    """
    Group chat management (rename / add members / remove members / delete)
    must be restricted to the group's own admin (the creator, or anyone
    promoted) or a company-level administrator (HR/Super Admin/staff) — not
    any regular employee member, and not members of another organization.
    """

    def setUp(self):
        self.client = APIClient()

        self.hr_user = User.objects.create_user(
            email="hr.owner@example.com",
            password="Password123!",
            first_name="HR",
            last_name="Owner",
            role=UserRole.HR,
        )
        self.org = Organization.objects.create(name="Alpha Corp", owner=self.hr_user)

        self.admin_user = User.objects.create_user(
            email="group.admin@alphacorp.com",
            password="Password123!",
            first_name="Group",
            last_name="Admin",
            role=UserRole.EMPLOYEE,
        )
        Employee.objects.create(
            organization=self.org, full_name="Group Admin", email="group.admin@alphacorp.com",
            employee_id="EMP-100", joining_date=date(2025, 1, 1), status=EmployeeStatus.ACTIVE,
        )

        self.member_user = User.objects.create_user(
            email="member@alphacorp.com",
            password="Password123!",
            first_name="Regular",
            last_name="Member",
            role=UserRole.EMPLOYEE,
        )
        Employee.objects.create(
            organization=self.org, full_name="Regular Member", email="member@alphacorp.com",
            employee_id="EMP-101", joining_date=date(2025, 1, 1), status=EmployeeStatus.ACTIVE,
        )

        self.outsider_user = User.objects.create_user(
            email="outsider@alphacorp.com",
            password="Password123!",
            first_name="Not",
            last_name="InGroup",
            role=UserRole.EMPLOYEE,
        )
        Employee.objects.create(
            organization=self.org, full_name="Not InGroup", email="outsider@alphacorp.com",
            employee_id="EMP-102", joining_date=date(2025, 1, 1), status=EmployeeStatus.ACTIVE,
        )

        other_hr = User.objects.create_user(
            email="other.hr@example.com", password="Password123!", role=UserRole.HR,
        )
        self.other_org = Organization.objects.create(name="Beta Inc", owner=other_hr)
        self.cross_org_user = User.objects.create_user(
            email="cross.org@betainc.com", password="Password123!", role=UserRole.EMPLOYEE,
        )
        Employee.objects.create(
            organization=self.other_org, full_name="Cross Org", email="cross.org@betainc.com",
            employee_id="EMP-200", joining_date=date(2025, 1, 1), status=EmployeeStatus.ACTIVE,
        )

        self.conversation = Conversation.objects.create(
            type=Conversation.ConversationType.GROUP, name="Marketing"
        )
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.admin_user, role=ConversationMember.Role.ADMIN
        )
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.member_user, role=ConversationMember.Role.MEMBER
        )
        # hr_user is a company-level admin but only a plain MEMBER of this
        # specific group — tests below confirm the company-admin override
        # still applies without needing the group-level ADMIN role. They
        # must still be a member to be visible via get_queryset() at all.
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.hr_user, role=ConversationMember.Role.MEMBER
        )

        self.detail_url = f"/api/v1/chat/conversations/{self.conversation.id}/"

    # -- rename --------------------------------------------------------

    def test_group_admin_can_rename(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.post(f"{self.detail_url}rename-group/", {"name": "Marketing Squad"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.name, "Marketing Squad")

    def test_company_admin_can_rename_even_without_group_role(self):
        self.client.force_authenticate(self.hr_user)
        res = self.client.post(f"{self.detail_url}rename-group/", {"name": "Renamed by HR"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_regular_member_cannot_rename(self):
        self.client.force_authenticate(self.member_user)
        res = self.client.post(f"{self.detail_url}rename-group/", {"name": "Hijacked"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.name, "Marketing")

    def test_generic_patch_is_rejected(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.patch(self.detail_url, {"name": "Via PATCH"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    # -- add members -----------------------------------------------------

    def test_group_admin_can_add_member_from_same_org(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.post(
            f"{self.detail_url}add-members/", {"member_ids": [str(self.outsider_user.id)]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(
            ConversationMember.objects.filter(conversation=self.conversation, user=self.outsider_user).exists()
        )

    def test_regular_member_cannot_add_members(self):
        self.client.force_authenticate(self.member_user)
        res = self.client.post(
            f"{self.detail_url}add-members/", {"member_ids": [str(self.outsider_user.id)]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            ConversationMember.objects.filter(conversation=self.conversation, user=self.outsider_user).exists()
        )

    def test_cannot_add_member_from_another_organization(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.post(
            f"{self.detail_url}add-members/", {"member_ids": [str(self.cross_org_user.id)]}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ConversationMember.objects.filter(conversation=self.conversation, user=self.cross_org_user).exists()
        )

    # -- remove members ----------------------------------------------------

    def test_group_admin_can_remove_other_member(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.post(f"{self.detail_url}remove-member/", {"user_id": str(self.member_user.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(
            ConversationMember.objects.filter(conversation=self.conversation, user=self.member_user).exists()
        )

    def test_regular_member_cannot_remove_another_member(self):
        ConversationMember.objects.create(
            conversation=self.conversation, user=self.outsider_user, role=ConversationMember.Role.MEMBER
        )
        self.client.force_authenticate(self.member_user)
        res = self.client.post(f"{self.detail_url}remove-member/", {"user_id": str(self.outsider_user.id)})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_can_remove_self(self):
        self.client.force_authenticate(self.member_user)
        res = self.client.post(f"{self.detail_url}remove-member/", {"user_id": str(self.member_user.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(
            ConversationMember.objects.filter(conversation=self.conversation, user=self.member_user).exists()
        )

    def test_cannot_remove_the_only_admin(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.post(f"{self.detail_url}remove-member/", {"user_id": str(self.admin_user.id)})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(
            ConversationMember.objects.filter(conversation=self.conversation, user=self.admin_user).exists()
        )

    # -- delete group --------------------------------------------------

    def test_regular_member_cannot_delete_group(self):
        self.client.force_authenticate(self.member_user)
        res = self.client.delete(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Conversation.objects.filter(id=self.conversation.id).exists())

    def test_group_admin_can_delete_group(self):
        self.client.force_authenticate(self.admin_user)
        res = self.client.delete(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Conversation.objects.filter(id=self.conversation.id).exists())

    def test_company_admin_can_delete_group_even_without_group_role(self):
        self.client.force_authenticate(self.hr_user)
        res = self.client.delete(self.detail_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
