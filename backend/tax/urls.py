from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CompanyTaxConfigViewSet,
    SalaryStructureViewSet,
    TaxDeclarationViewSet,
    MonthlyTDSViewSet,
    TDSChallanViewSet,
    TDSReturnViewSet,
    ProfessionalTaxSlabViewSet,
    TaxCalculatorView,
)

router = DefaultRouter()
router.register(r"config", CompanyTaxConfigViewSet, basename="tax-config")
router.register(r"salary-structures", SalaryStructureViewSet, basename="salary-structure")
router.register(r"declarations", TaxDeclarationViewSet, basename="tax-declaration")
router.register(r"monthly-tds", MonthlyTDSViewSet, basename="monthly-tds")
router.register(r"challans", TDSChallanViewSet, basename="tds-challan")
router.register(r"returns", TDSReturnViewSet, basename="tds-return")
router.register(r"pt-slabs", ProfessionalTaxSlabViewSet, basename="pt-slab")
router.register(r"calculator", TaxCalculatorView, basename="tax-calculator")

app_name = "tax"

urlpatterns = [
    path("", include(router.urls)),
]
