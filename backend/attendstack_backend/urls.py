"""
URL configuration for attendstack_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from organizations.views import OrganizationVerifyCodeView, OrganizationVerifyApiKeyView


urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/v1/verify-org-code/", OrganizationVerifyCodeView.as_view(), name="verify_org_code"),
    path("api/v1/organizations/verify-code/", OrganizationVerifyCodeView.as_view(), name="org_verify_code_direct"),
    path("api/v1/organizations/verify-api-key/", OrganizationVerifyApiKeyView.as_view(), name="org_verify_api_key_direct"),
    path("api/v1/", include("organizations.urls")),

    path("api/v1/accounts/", include("accounts.urls", namespace="accounts")),
    path("api/v1/employees/", include("employees.urls", namespace="employees")),
    path("api/v1/attendance/", include("attendance.urls", namespace="attendance")),
    path("api/v1/holidays/", include("holidays.urls", namespace="holidays")),
    path("api/v1/payroll/", include("payroll.urls", namespace="payroll")),
    path("api/v1/tasks/", include("tasks.urls", namespace="tasks")),
    path("api/v1/chat/", include("chat.urls")),
    path("api/v1/", include("settings.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
