from datetime import date

from django.test import TestCase

from .models import Holiday, HolidayType
from .serializers import HolidaySerializer


class HolidaySerializerTests(TestCase):
    def setUp(self):
        self.holiday = Holiday.objects.create(
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

    def test_update_rejects_a_date_used_by_another_holiday(self):
        Holiday.objects.create(
            name="Second Holiday",
            date=date(2026, 7, 12),
            type=HolidayType.NATIONAL,
        )
        serializer = HolidaySerializer(
            self.holiday,
            data={
                "name": self.holiday.name,
                "date": "2026-07-12",
                "type": self.holiday.type,
            },
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("date", serializer.errors)
