from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status as http_status
from rest_framework.test import APITestCase

from accounts.models import UserRole
from organizations.models import Organization

from .models import Holiday, HolidayType
from .serializers import HolidaySerializer

User = get_user_model()


class HolidaySerializerTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Serializer Test Co")
        self.holiday = Holiday.objects.create(
            organization=self.organization,
            name="Founders Day",
            date=date(2026, 7, 10),
            type=HolidayType.PUBLIC,
        )

    def test_update_accepts_the_existing_holiday_date(self):
        serializer = HolidaySerializer(
            self.holiday,
            data={
                "name": "Company Founders Day",
                "date": "2026-07-10",
                "type": HolidayType.PUBLIC,
            },
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_holiday = serializer.save()
        self.assertEqual(updated_holiday.name, "Company Founders Day")

    def test_update_accepts_an_unused_date(self):
        serializer = HolidaySerializer(
            self.holiday,
            data={
                "name": self.holiday.name,
                "date": "2026-07-11",
                "type": HolidayType.FESTIVAL,
            },
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_holiday = serializer.save()
        self.assertEqual(updated_holiday.date, date(2026, 7, 11))


@override_settings(ROOT_URLCONF="holidays.urls")
class HolidayMultiTenantIsolationTests(APITestCase):
    """
    Holiday had no organization field at all until this fix — every
    company shared one global calendar, so creating or deleting a holiday
    in one company's dashboard visibly affected every other company's.
    """

    def setUp(self):
        self.org_a = Organization.objects.create(name="Tenant Alpha")
        self.org_b = Organization.objects.create(name="Tenant Beta")

        self.hr_a = User.objects.create_user(
            email="hr.alpha@example.com", password="StrongPass123!", role=UserRole.HR,
        )
        self.org_a.owner = self.hr_a
        self.org_a.save(update_fields=["owner"])

        self.hr_b = User.objects.create_user(
            email="hr.beta@example.com", password="StrongPass123!", role=UserRole.HR,
        )
        self.org_b.owner = self.hr_b
        self.org_b.save(update_fields=["owner"])

        self.holiday_a = Holiday.objects.create(
            organization=self.org_a, name="Alpha Founding Day", date=date(2026, 7, 10),
        )

    def test_company_b_cannot_see_company_as_holiday(self):
        self.client.force_authenticate(self.hr_b)
        response = self.client.get("/")
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        results = response.data["results"] if isinstance(response.data, dict) else response.data
        names = [h["name"] for h in results]
        self.assertNotIn("Alpha Founding Day", names)

    def test_company_b_creating_a_holiday_does_not_appear_for_company_a(self):
        self.client.force_authenticate(self.hr_b)
        create_response = self.client.post(
            "/", {"name": "Beta Holiday", "date": "2026-08-20", "type": HolidayType.FESTIVAL}, format="json",
        )
        self.assertEqual(create_response.status_code, http_status.HTTP_201_CREATED)

        beta_holiday = Holiday.objects.get(name="Beta Holiday")
        self.assertEqual(beta_holiday.organization_id, self.org_b.id)

        self.client.force_authenticate(self.hr_a)
        list_response = self.client.get("/")
        results = list_response.data["results"] if isinstance(list_response.data, dict) else list_response.data
        names = [h["name"] for h in results]
        self.assertNotIn("Beta Holiday", names)

    def test_company_b_cannot_delete_company_as_holiday(self):
        # This is the exact regression reported: deleting a holiday inside
        # one company's dashboard deleted it for every company, because
        # the shared, unscoped queryset let any admin resolve any row by
        # id regardless of which company it actually belonged to.
        self.client.force_authenticate(self.hr_b)
        response = self.client.delete(f"/{self.holiday_a.id}/")
        self.assertEqual(response.status_code, http_status.HTTP_404_NOT_FOUND)
        self.assertTrue(Holiday.objects.filter(pk=self.holiday_a.id).exists())

    def test_company_a_can_delete_its_own_holiday(self):
        self.client.force_authenticate(self.hr_a)
        response = self.client.delete(f"/{self.holiday_a.id}/")
        self.assertEqual(response.status_code, http_status.HTTP_204_NO_CONTENT)
        self.assertFalse(Holiday.objects.filter(pk=self.holiday_a.id).exists())

    def test_two_companies_can_have_a_holiday_on_the_same_date(self):
        # The old single-field unique=True on `date` made this impossible
        # platform-wide; it's now scoped per (organization, date).
        self.client.force_authenticate(self.hr_b)
        response = self.client.post(
            "/", {"name": "Beta's Own Founding Day", "date": "2026-07-10", "type": HolidayType.FESTIVAL}, format="json",
        )
        self.assertEqual(response.status_code, http_status.HTTP_201_CREATED)
        self.assertEqual(
            Holiday.objects.filter(date=date(2026, 7, 10)).count(), 2
        )

    def test_company_a_cannot_double_book_its_own_date(self):
        self.client.force_authenticate(self.hr_a)
        response = self.client.post(
            "/", {"name": "Duplicate", "date": "2026-07-10", "type": HolidayType.FESTIVAL}, format="json",
        )
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)
