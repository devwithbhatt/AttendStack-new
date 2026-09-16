from django.db import models
from django.db.models.functions import Coalesce

from employees.models import ATTENDANCE_ELIGIBLE_STATUSES, EmployeeStatus, EmployeeStatusHistory
from attendance.models import AttendanceStatus


def attendance_eligible_records(queryset):
    """Keep records whose employee status allowed attendance on that record date or where actual attendance was recorded."""
    latest_status = EmployeeStatusHistory.objects.filter(
        employee_id=models.OuterRef("employee_id"),
        effective_date__lte=models.OuterRef("date"),
    ).order_by("-effective_date", "-created_at", "-pk")

    return queryset.annotate(
        employee_status_on_date=Coalesce(
            models.Subquery(latest_status.values("status")[:1]),
            models.Value(EmployeeStatus.ACTIVE),
            output_field=models.CharField(),
        )
    ).filter(
        models.Q(employee_status_on_date__in=ATTENDANCE_ELIGIBLE_STATUSES)
        | models.Q(check_in__isnull=False)
        | models.Q(status__in=[
            AttendanceStatus.PRESENT,
            AttendanceStatus.LATE,
            AttendanceStatus.HALF_DAY,
            AttendanceStatus.PAID_LEAVE,
            AttendanceStatus.LEAVE,
        ])
    )
