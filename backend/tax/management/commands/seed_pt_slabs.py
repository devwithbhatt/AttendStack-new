"""Seed Professional Tax slabs for major Indian states (FY 2026-27)."""
from django.core.management.base import BaseCommand
from tax.models import ProfessionalTaxSlab


SLABS = [
    # Maharashtra
    {"state": "Maharashtra", "salary_from": 0, "salary_to": 7500, "monthly_tax": 0},
    {"state": "Maharashtra", "salary_from": 7501, "salary_to": 10000, "monthly_tax": 175},
    {"state": "Maharashtra", "salary_from": 10001, "salary_to": 9999999, "monthly_tax": 200},
    {"state": "Maharashtra", "salary_from": 10001, "salary_to": 9999999, "monthly_tax": 300, "gender": "M"},

    # Karnataka
    {"state": "Karnataka", "salary_from": 0, "salary_to": 15000, "monthly_tax": 0},
    {"state": "Karnataka", "salary_from": 15001, "salary_to": 25000, "monthly_tax": 200},
    {"state": "Karnataka", "salary_from": 25001, "salary_to": 9999999, "monthly_tax": 200},

    # Gujarat
    {"state": "Gujarat", "salary_from": 0, "salary_to": 5999, "monthly_tax": 0},
    {"state": "Gujarat", "salary_from": 6000, "salary_to": 8999, "monthly_tax": 80},
    {"state": "Gujarat", "salary_from": 9000, "salary_to": 11999, "monthly_tax": 150},
    {"state": "Gujarat", "salary_from": 12000, "salary_to": 9999999, "monthly_tax": 200},

    # Tamil Nadu
    {"state": "Tamil Nadu", "salary_from": 0, "salary_to": 21000, "monthly_tax": 0},
    {"state": "Tamil Nadu", "salary_from": 21001, "salary_to": 30000, "monthly_tax": 135},
    {"state": "Tamil Nadu", "salary_from": 30001, "salary_to": 45000, "monthly_tax": 315},
    {"state": "Tamil Nadu", "salary_from": 45001, "salary_to": 60000, "monthly_tax": 690},
    {"state": "Tamil Nadu", "salary_from": 60001, "salary_to": 75000, "monthly_tax": 1025},
    {"state": "Tamil Nadu", "salary_from": 75001, "salary_to": 9999999, "monthly_tax": 1250},

    # West Bengal
    {"state": "West Bengal", "salary_from": 0, "salary_to": 10000, "monthly_tax": 0},
    {"state": "West Bengal", "salary_from": 10001, "salary_to": 15000, "monthly_tax": 110},
    {"state": "West Bengal", "salary_from": 15001, "salary_to": 25000, "monthly_tax": 130},
    {"state": "West Bengal", "salary_from": 25001, "salary_to": 40000, "monthly_tax": 150},
    {"state": "West Bengal", "salary_from": 40001, "salary_to": 9999999, "monthly_tax": 200},

    # Telangana
    {"state": "Telangana", "salary_from": 0, "salary_to": 15000, "monthly_tax": 0},
    {"state": "Telangana", "salary_from": 15001, "salary_to": 20000, "monthly_tax": 150},
    {"state": "Telangana", "salary_from": 20001, "salary_to": 9999999, "monthly_tax": 200},

    # Andhra Pradesh
    {"state": "Andhra Pradesh", "salary_from": 0, "salary_to": 15000, "monthly_tax": 0},
    {"state": "Andhra Pradesh", "salary_from": 15001, "salary_to": 20000, "monthly_tax": 150},
    {"state": "Andhra Pradesh", "salary_from": 20001, "salary_to": 9999999, "monthly_tax": 200},

    # Madhya Pradesh
    {"state": "Madhya Pradesh", "salary_from": 0, "salary_to": 18750, "monthly_tax": 0},
    {"state": "Madhya Pradesh", "salary_from": 18751, "salary_to": 25000, "monthly_tax": 125},
    {"state": "Madhya Pradesh", "salary_from": 25001, "salary_to": 33333, "monthly_tax": 167},
    {"state": "Madhya Pradesh", "salary_from": 33334, "salary_to": 9999999, "monthly_tax": 208},

    # Kerala
    {"state": "Kerala", "salary_from": 0, "salary_to": 11999, "monthly_tax": 0},
    {"state": "Kerala", "salary_from": 12000, "salary_to": 17999, "monthly_tax": 120},
    {"state": "Kerala", "salary_from": 18000, "salary_to": 24999, "monthly_tax": 180},
    {"state": "Kerala", "salary_from": 25000, "salary_to": 29999, "monthly_tax": 250},
    {"state": "Kerala", "salary_from": 30000, "salary_to": 9999999, "monthly_tax": 208},
]


class Command(BaseCommand):
    help = "Seed Professional Tax slabs for major Indian states."

    def handle(self, *args, **options):
        created = 0
        for slab_data in SLABS:
            gender = slab_data.pop("gender", "")
            _, was_created = ProfessionalTaxSlab.objects.get_or_create(
                state=slab_data["state"],
                salary_from=slab_data["salary_from"],
                salary_to=slab_data["salary_to"],
                gender=gender,
                defaults={"monthly_tax": slab_data["monthly_tax"]},
            )
            if was_created:
                created += 1
        self.stdout.write(self.style.SUCCESS(f"Seeded {created} Professional Tax slabs."))
