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


@override_settings(ROOT_URLCONF="holidays.urls")
class HolidayAttendanceResyncTests(APITestCase):
    """Deleting, moving or adding a holiday must update the days the system
    already marked — for that company only."""

    def setUp(self):
        from attendance.models import AttendanceRecord, AttendanceStatus
        from employees.models import Employee

        self.AttendanceRecord, self.Status = AttendanceRecord, AttendanceStatus
        self.org_a = Organization.objects.create(name="Resync Alpha")
        self.org_b = Organization.objects.create(name="Resync Beta")
        self.hr_a = User.objects.create_user(email="hr.resync@example.com", password="StrongPass123!", role=UserRole.HR)
        self.org_a.owner = self.hr_a
        self.org_a.save(update_fields=["owner"])

        def emp(org, code, email, aadhaar):
            return Employee.objects.create(
                organization=org, employee_id=code, full_name=code, email=email, phone="9876543210",
                aadhaar_number=aadhaar, department="Ops", designation="Associate", annual_salary=120000,
                joining_date=date(2026, 1, 1),
            )

        self.emp_a = emp(self.org_a, "EMP-RS-A", "a@resync.test", "444455556661")
        self.emp_b = emp(self.org_b, "EMP-RS-B", "b@resync.test", "444455556662")
        self.day = date(2030, 3, 13)  # a future Wednesday
        self.holiday = Holiday.objects.create(organization=self.org_a, name="Alpha Day", date=self.day)
        for e in (self.emp_a, self.emp_b):
            rec = AttendanceRecord(employee=e, date=self.day, status=AttendanceStatus.HOLIDAY, notes="Auto-marked: Holiday")
            rec.save(auto_refresh_status=False)
        self.client.force_authenticate(self.hr_a)

    def test_deleting_holiday_clears_only_that_companys_auto_marked_days(self):
        res = self.client.delete(f"/{self.holiday.pk}/")
        self.assertIn(res.status_code, (200, 204))
        self.assertFalse(self.AttendanceRecord.objects.filter(employee=self.emp_a, date=self.day, status=self.Status.HOLIDAY).exists())
        # Another company's record is never touched.
        self.assertTrue(self.AttendanceRecord.objects.filter(employee=self.emp_b, date=self.day, status=self.Status.HOLIDAY).exists())

    def test_moving_holiday_clears_old_date(self):
        res = self.client.put(f"/{self.holiday.pk}/", {"name": "Alpha Day", "date": "2030-03-20", "type": HolidayType.FESTIVAL}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(self.AttendanceRecord.objects.filter(employee=self.emp_a, date=self.day, status=self.Status.HOLIDAY).exists())
        self.assertTrue(self.AttendanceRecord.objects.filter(employee=self.emp_a, date=date(2030, 3, 20), status=self.Status.HOLIDAY).exists())

    def test_adding_holiday_converts_auto_marked_absence(self):
        day = date(2030, 3, 27)
        rec = self.AttendanceRecord(employee=self.emp_a, date=day, status=self.Status.ABSENT, notes="Auto-marked: Absent")
        rec.save(auto_refresh_status=False)
        res = self.client.post("/", {"name": "New Day", "date": "2030-03-27", "type": HolidayType.FESTIVAL}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        rec.refresh_from_db()
        self.assertEqual(rec.status, self.Status.HOLIDAY)

    def test_punched_day_is_never_touched(self):
        from django.utils import timezone

        rec = self.AttendanceRecord.objects.get(employee=self.emp_a, date=self.day)
        self.AttendanceRecord.objects.filter(pk=rec.pk).update(check_in=timezone.now())
        self.client.delete(f"/{self.holiday.pk}/")
        self.assertTrue(self.AttendanceRecord.objects.filter(pk=rec.pk).exists())
