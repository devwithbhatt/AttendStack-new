from django.db import models
from django.utils import timezone

class HolidayType(models.TextChoices):
    PUBLIC = "Public Holiday", "Public Holiday"
    NATIONAL = "National Holiday", "National Holiday"
    FESTIVAL = "Festival", "Festival"
    OPTIONAL = "Optional Holiday", "Optional Holiday"

class Holiday(models.Model):
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="holidays",
        null=True,
        blank=True,
        help_text="Company this holiday belongs to. Null only transiently during migration backfill.",
    )
    name = models.CharField(max_length=150)
    date = models.DateField()
    type = models.CharField(
        max_length=50,
        choices=HolidayType.choices,
        default=HolidayType.PUBLIC
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "date"], name="unique_holiday_per_org_per_date"),
        ]

    def __str__(self):
        return f"{self.name} - {self.date}"