from django.urls import path
from .views import HolidayViewSet

app_name = "holidays"

urlpatterns = [
    path('', HolidayViewSet.as_view({'get': 'list', 'post': 'create'}), name='holiday-list'),
    path('<int:pk>/', HolidayViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'}), name='holiday-detail'),
]