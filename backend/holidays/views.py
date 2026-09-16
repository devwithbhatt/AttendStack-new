from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from attendance.permissions import IsAdminOrReadOnly
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
        queryset = Holiday.objects.all().order_by('date')
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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)