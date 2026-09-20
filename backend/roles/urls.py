from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RoleViewSet

app_name = "roles"

router = DefaultRouter()
router.register("", RoleViewSet, basename="role")

urlpatterns = [
    path("", include(router.urls)),
]
