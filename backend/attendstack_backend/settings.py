"""
AttendStack Backend – Django Settings
Professional HR & Attendance Management System
"""

from pathlib import Path
from datetime import timedelta
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

# ──────────────────────────────────────────────────────────────────────────────
# SECURITY
# ──────────────────────────────────────────────────────────────────────────────
SECRET_KEY = config("SECRET_KEY", default="unsafe-secret-key")
SIMPLYJOB_ONBOARDING_SECRET = config("SIMPLYJOB_ONBOARDING_SECRET", default="")
ATTENDSTACK_APP_URL = config("ATTENDSTACK_APP_URL", default="http://localhost:3000")
DEBUG = str(config("DEBUG", default="true")).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
if not DEBUG and SECRET_KEY == "unsafe-secret-key":
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured("Set SECRET_KEY before running in production.")

ALLOWED_HOSTS = [h.strip() for h in config("ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",") if h.strip()]

# Honor the 'X-Forwarded-Proto' header for request.is_secure() behind reverse proxies (Nginx/Cloudflare)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# ──────────────────────────────────────────────────────────────────────────────
# APPLICATION DEFINITION
# ──────────────────────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    "channels",
]

LOCAL_APPS = [
    "accounts",
    "organizations",
    "employees",
    "attendance",
    "holidays",
    "payroll",
    "settings",
    "tasks",
    "chat",
]

INSTALLED_APPS = ["daphne"] + DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ──────────────────────────────────────────────────────────────────────────────
# MIDDLEWARE
# ──────────────────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "attendstack_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "attendstack_backend.wsgi.application"

# ──────────────────────────────────────────────────────────────────────────────
# DATABASE
# ──────────────────────────────────────────────────────────────────────────────
import dj_database_url

# If DEBUG is True and USE_POSTGRES_LOCALLY is not explicitly True, use SQLite.
# This prevents database errors for developers who don't have Postgres running locally.
use_postgres = config("USE_POSTGRES_LOCALLY", default=False, cast=bool)
if DEBUG and not use_postgres:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": dj_database_url.config(
            default=config("DATABASE_URL")
        )
    }

# ──────────────────────────────────────────────────────────────────────────────
# CUSTOM USER MODEL
# ──────────────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

# ──────────────────────────────────────────────────────────────────────────────
# PASSWORD VALIDATION
# ──────────────────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ──────────────────────────────────────────────────────────────────────────────
# INTERNATIONALIZATION
# ──────────────────────────────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# ──────────────────────────────────────────────────────────────────────────────
# STATIC & MEDIA FILES
# ──────────────────────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Read STATIC_ROOT from environment (e.g. /var/www/attendstack/static/ in prod)
# Defaults to a local directory for easy development on Windows/Mac
STATIC_ROOT = config("STATIC_ROOT", default=str(BASE_DIR / "staticfiles"))

# Max upload size. Keep this above the public onboarding form's 18 MB
# client-side limit so DRF can return field-level validation errors.
DATA_UPLOAD_MAX_MEMORY_SIZE = config("DATA_UPLOAD_MAX_MEMORY_SIZE", default=26214400, cast=int)  # 25 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = config("FILE_UPLOAD_MAX_MEMORY_SIZE", default=26214400, cast=int)  # 25 MB
MAX_UPLOAD_SIZE = config("MAX_UPLOAD_SIZE", default=26214400, cast=int)  # 25 MB


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# EMAIL & PASSWORD RECOVERY
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=15, cast=int)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="AttendStack <no-reply@attendstack.com>")
PASSWORD_RESET_SUPPORT_EMAIL = config(
    "PASSWORD_RESET_SUPPORT_EMAIL",
    default=EMAIL_HOST_USER or "support@attendstack.com",
)

PASSWORD_RESET_OTP_TTL_MINUTES = config(
    "PASSWORD_RESET_OTP_TTL_MINUTES", default=10, cast=int
)
PASSWORD_RESET_OTP_RESEND_SECONDS = config(
    "PASSWORD_RESET_OTP_RESEND_SECONDS", default=60, cast=int
)
PASSWORD_RESET_OTP_MAX_REQUESTS_PER_HOUR = config(
    "PASSWORD_RESET_OTP_MAX_REQUESTS_PER_HOUR", default=5, cast=int
)
PASSWORD_RESET_OTP_MAX_ATTEMPTS = config(
    "PASSWORD_RESET_OTP_MAX_ATTEMPTS", default=5, cast=int
)

# ──────────────────────────────────────────────────────────────────────────────
# DJANGO REST FRAMEWORK
# ──────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.ActivityTrackingJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
}

# ──────────────────────────────────────────────────────────────────────────────
# SIMPLE JWT
# ──────────────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "TOKEN_OBTAIN_SERIALIZER": "accounts.serializers.CustomTokenObtainPairSerializer",
}

# ──────────────────────────────────────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=DEBUG, cast=bool)
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in config(
        "CORS_ALLOWED_ORIGINS",
        default="http://localhost:3000, http://127.0.0.1:3000, http://localhost:8002",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# ──────────────────────────────────────────────────────────────────────────────
# DRF SPECTACULAR (API Docs)
# ──────────────────────────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "AttendStack API",
    "DESCRIPTION": (
        "Professional HR & Attendance Management System REST API. "
        "Supports Admin, HR, and Employee roles with JWT authentication."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayOperationId": True,
    },
    "TAGS": [
        {"name": "Auth", "description": "Authentication – login, logout, token refresh"},
        {"name": "Admin", "description": "Super-Admin operations"},
        {"name": "HR", "description": "HR management operations"},
        {"name": "Employees", "description": "Employee CRUD & registration"},
        {"name": "Attendance", "description": "Attendance tracking"},
        {"name": "Holidays", "description": "Holiday management"},
        {"name": "Payroll", "description": "Salary & payroll operations"},
        {"name": "Tasks", "description": "Employee task assignment and tracking"},
    ],
}

# ──────────────────────────────────────────────────────────────────────────────
# CELERY
# ──────────────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Asia/Kolkata"

# ──────────────────────────────────────────────────────────────────────────────
# CHANNELS & REAL-TIME WEBSOCKETS (REDIS WITH RESP2 & NO HEALTHCHECK TIMEOUTS)
# ──────────────────────────────────────────────────────────────────────────────
ASGI_APPLICATION = "attendstack_backend.asgi.application"

REDIS_HOST = config("REDIS_HOST", default="127.0.0.1")
REDIS_PORT = config("REDIS_PORT", default=6379, cast=int)
USE_REDIS = config("USE_REDIS", default=True, cast=bool)

if USE_REDIS:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [f"redis://{REDIS_HOST}:{REDIS_PORT}/0?protocol=2&socket_timeout=10&health_check_interval=0"],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# ──────────────────────────────────────────────────────────────────────────────
# MEDIA FILES (LOCAL DEV & S3 READY)
# ──────────────────────────────────────────────────────────────────────────────
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ──────────────────────────────────────────────────────────────────────────────
# SIMPLYJOB INTEGRATION
# ──────────────────────────────────────────────────────────────────────────────
SIMPLYJOB_ONBOARDING_SECRET = config("SIMPLYJOB_ONBOARDING_SECRET", default="")
SIMPLYJOB_WEBHOOK_URL = config("SIMPLYJOB_WEBHOOK_URL", default="https://simplyjob.in/api/companies/webhooks/attendstack/sync-invite-code/")
SIMPLYJOB_DATABASE_URL = config("SIMPLYJOB_DATABASE_URL", default="")



