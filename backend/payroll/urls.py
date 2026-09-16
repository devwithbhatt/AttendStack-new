from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PayrollViewSet, EmployeeIncrementViewSet

router = DefaultRouter()
router.register(r'increments', EmployeeIncrementViewSet, basename='increments')
router.register(r'', PayrollViewSet, basename='payroll')

app_name = 'payroll'

urlpatterns = [
    path('', include(router.urls)),
]
