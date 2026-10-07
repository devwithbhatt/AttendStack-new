from rest_framework import viewsets, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from django.db import transaction

from attendance.permissions import IsAdminOrReadOnly
from attendance.services import resync_company_holiday_date
from .models import Holiday
from .serializers import HolidaySerializer


class HolidayPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    permission_classes = [IsAdminOrReadOnly]
    permission_module = "holidays"
    pagination_class = HolidayPagination

    def get_queryset(self):
        from organizations.services import resolve_organization_for_request

        organization = resolve_organization_for_request(self.request)
        if organization is None:
            return Holiday.objects.none()

        queryset = Holiday.objects.filter(organization=organization).order_by('date')
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search.strip())
        holiday_type = self.request.query_params.get('type')
        if holiday_type:
            queryset = queryset.filter(type=holiday_type)
        year = self.request.query_params.get('year')
        if year:
            try:
                queryset = queryset.filter(date__year=int(year))
            except (ValueError, TypeError):
                pass
        return queryset

    def _check_date_available(self, organization, date_value, exclude_pk=None):
        # The organization+date uniqueness is enforced at the DB level via
        # a composite constraint (see Holiday.Meta.constraints), but DRF's
        # ModelSerializer only auto-generates a validator for a plain
        # single-field unique=True — it doesn't introspect Meta.constraints
        # for composite UniqueConstraints. Check explicitly here so a
        # collision surfaces as a clean validation error instead of a raw
        # IntegrityError.
        clash = Holiday.objects.filter(organization=organization, date=date_value)
        if exclude_pk is not None:
            clash = clash.exclude(pk=exclude_pk)
        if clash.exists():
            raise ValidationError({"date": "A holiday already exists on this date for your company."})

    def perform_create(self, serializer):
        from organizations.services import resolve_organization_for_request

        organization = resolve_organization_for_request(self.request)
        if organization is None:
            raise ValidationError(
                "Could not determine which company to create this holiday for."
            )
        self._check_date_available(organization, serializer.validated_data["date"])
        with transaction.atomic():
            holiday = serializer.save(organization=organization)
            resync_company_holiday_date(organization, holiday.date)

    def perform_update(self, serializer):
        instance = serializer.instance
        old_date = instance.date
        new_date = serializer.validated_data.get("date", instance.date)
        if new_date != instance.date:
            self._check_date_available(instance.organization, new_date, exclude_pk=instance.pk)
        with transaction.atomic():
            holiday = serializer.save()
            # Moving a holiday must undo the old date and mark the new one.
            if old_date != holiday.date:
                resync_company_holiday_date(holiday.organization, old_date)
            resync_company_holiday_date(holiday.organization, holiday.date)

    def perform_destroy(self, instance):
        organization, holiday_date = instance.organization, instance.date
        with transaction.atomic():
            instance.delete()
            resync_company_holiday_date(organization, holiday_date)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)