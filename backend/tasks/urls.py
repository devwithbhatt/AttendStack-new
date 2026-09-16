from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProjectViewSet, TaskViewSet

app_name = "tasks"

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("", TaskViewSet, basename="task")

urlpatterns = [
    path("", include(router.urls)),
]
