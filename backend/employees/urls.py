from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmployeeViewSet

app_name = "employees"

router = DefaultRouter()
router.register("", EmployeeViewSet, basename="employee")

urlpatterns = [
    path("", include(router.urls)),
]
