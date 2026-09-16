from django.db import models
from django.utils import timezone

class HolidayType(models.TextChoices):
    PUBLIC = "Public Holiday", "Public Holiday"
    NATIONAL = "National Holiday", "National Holiday"
    FESTIVAL = "Festival", "Festival"
    OPTIONAL = "Optional Holiday", "Optional Holiday"

class Holiday(models.Model):
    name = models.CharField(max_length=150)
    date = models.DateField(unique=True)
    type = models.CharField(
        max_length=50,
        choices=HolidayType.choices,
        default=HolidayType.PUBLIC
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.name} - {self.date}"