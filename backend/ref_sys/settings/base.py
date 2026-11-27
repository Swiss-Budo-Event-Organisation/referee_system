import os
from pathlib import Path

import environ
from celery.schedules import crontab
from corsheaders.defaults import default_headers

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# settings/base.py -> settings/ -> ref_sys/ -> backend/
BASE_DIR = Path(__file__).resolve(strict=True).parent.parent.parent

env = environ.Env()
env.read_env(str(BASE_DIR / env.str("ENV_PATH", ".env")))


# Shared settings. SECRET_KEY and DATABASES are set per environment in
# local.py, test.py and production.py.

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env.bool("DEBUG", default=False)

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default="127.0.0.1")

REST_FRAMEWORK = {
    # The access tokens django-allauth hands out after login (see below).
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "allauth.headless.contrib.rest_framework.authentication.JWTTokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    # Permissions on events and competitions from the groups of their
    # categories.
    "competition.backends.CategoryPermissionBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# Authentication with django-allauth
# ------------------------------------------------------------------------------
# Headless only: the React app talks to the "app" client under
# /_allauth/app/v1/. It logs in with X-Session-Token and gets a pair of JWTs
# once the user is fully authenticated, i.e. after the second factor.
# https://docs.allauth.org/en/latest/headless/

# Users sign in with their username. Registration and e-mail confirmation
# stay in the accounts app (approval by staff), so allauth's signup is off
# (accounts.adapter.AccountAdapter) and it does not verify addresses.
ACCOUNT_LOGIN_METHODS = {"username"}
ACCOUNT_SIGNUP_FIELDS = ["username*", "email", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "none"
ACCOUNT_ADAPTER = "accounts.adapter.AccountAdapter"
ACCOUNT_LOGOUT_ON_PASSWORD_CHANGE = False
# allauth's built-in rate limits (login, failed logins, MFA codes) stay on.

HEADLESS_ONLY = True
HEADLESS_CLIENTS = ("app",)
# The OpenAPI specification of every endpoint at /_allauth/openapi.html.
HEADLESS_SERVE_SPECIFICATION = DEBUG

HEADLESS_TOKEN_STRATEGY = "allauth.headless.tokens.strategies.jwt.JWTTokenStrategy"
# RS256 with a PEM private key from the environment. Without one, HS256
# signs with SECRET_KEY, which is fine for development and tests only;
# production requires the key. In .env files the line breaks of the PEM
# may be written as \n.
JWT_PRIVATE_KEY = env.str("JWT_PRIVATE_KEY", default="").replace("\\n", "\n")
HEADLESS_JWT_ALGORITHM = "RS256" if JWT_PRIVATE_KEY else "HS256"
HEADLESS_JWT_PRIVATE_KEY = JWT_PRIVATE_KEY
HEADLESS_JWT_ACCESS_TOKEN_EXPIRES_IN = 5 * 60
HEADLESS_JWT_REFRESH_TOKEN_EXPIRES_IN = 24 * 60 * 60
# Tokens are checked against the server-side session, so logging out
# revokes them at once.
HEADLESS_JWT_STATEFUL_VALIDATION_ENABLED = True

# Second factors: authenticator apps, passkeys and security keys, recovery
# codes. All are optional for now.
MFA_SUPPORTED_TYPES = ["totp", "webauthn", "recovery_codes"]
MFA_PASSKEY_LOGIN_ENABLED = True
MFA_TOTP_ISSUER = "Referee System"
# allauth only lets users with a verified address add a factor. Addresses
# are confirmed by the accounts app instead, which allauth does not know of.
MFA_ALLOW_UNVERIFIED_EMAIL = True

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_celery_results",
    "django_celery_beat",
    "api",
    "accounts",
    "referee",
    "competition",
    "helper",
    "rest_framework",
    "corsheaders",
    "allauth",
    "allauth.account",
    "allauth.mfa",
    "allauth.headless",
    # Without allauth.socialaccount: no login with other providers.
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "ref_sys.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
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

WSGI_APPLICATION = "ref_sys.wsgi.application"


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases


def database_config():
    """DATABASE_URL if set, otherwise the POSTGRES_* variables."""
    if os.getenv("DATABASE_URL"):
        database = env.db("DATABASE_URL")
    else:
        database = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env.str("POSTGRES_DB"),
            "USER": env.str("POSTGRES_USER"),
            "PASSWORD": env.str("POSTGRES_PASSWORD"),
            "HOST": env.str("POSTGRES_HOST", default="postgres"),
            "PORT": env.str("POSTGRES_PORT", default="5432"),
        }
    database["ATOMIC_REQUESTS"] = True
    return {"default": database}


# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CELERY_BROKER_URL = env.str("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = "django-db"
CELERY_RESULT_EXTENDED = True
CELERY_TIMEZONE = "Europe/Zurich"
# The database scheduler of django_celery_beat picks these up.
CELERY_BEAT_SCHEDULE = {
    "pending-accounts-daily-digest": {
        "task": "accounts.tasks.send_pending_digest",
        "schedule": crontab(hour=7, minute=0),
        "args": ["daily"],
    },
    "pending-accounts-weekly-digest": {
        "task": "accounts.tasks.send_pending_digest",
        "schedule": crontab(hour=7, minute=0, day_of_week="mon"),
        "args": ["weekly"],
    },
    "delete-expired-registrations": {
        "task": "accounts.tasks.delete_expired_registrations",
        "schedule": crontab(hour=3, minute=0),
    },
}


# Password validation
PASSWORD_HASHERS = [
    # https://docs.djangoproject.com/en/dev/topics/auth/passwords/#using-argon2-with-django
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation."
        "UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = "en-gb"

# A canonical IANA name: legacy aliases such as "CET" are missing from
# newer Linux tzdata (e.g. Ubuntu 26.04), and Django rejects them there.
TIME_ZONE = "Europe/Zurich"

USE_I18N = False

USE_L10N = False

USE_TZ = True

DATE_FORMAT = "%d/%b/%Y"

DATE_INPUT_FORMATS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d/%m/%y",
    "%d-%m-%Y",
    "%d-%m-%y",
    "%d %b &Y",
    "%d %B %Y",
    "%B %d %Y",
]

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_ROOT = str(BASE_DIR / "staticfiles")
# https://docs.djangoproject.com/en/dev/ref/settings/#static-url
STATIC_URL = "/static/"
# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#std:setting-STATICFILES_DIRS
STATICFILES_DIRS = [d for d in [BASE_DIR / "static"] if d.is_dir()]
# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#staticfiles-finders
STATICFILES_FINDERS = [
    "django.contrib.staticfiles.finders.FileSystemFinder",
    "django.contrib.staticfiles.finders.AppDirectoriesFinder",
]

# MEDIA
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#media-root
MEDIA_ROOT = str(BASE_DIR / "media")
# https://docs.djangoproject.com/en/dev/ref/settings/#media-url
MEDIA_URL = "/media/"

# E-mail configuration

# EMAIL is a URL such as consolemail:// or smtp+tls://user:pass@host:587.
# env.email() returns EMAIL_BACKEND, EMAIL_HOST, ... which are set here.
EMAIL_CONFIG = env.email("EMAIL", default="consolemail://")
vars().update(EMAIL_CONFIG)

# Where the React app runs, for links in e-mails.
FRONTEND_URL = env.str("FRONTEND_URL", default="http://localhost:8080").rstrip("/")

# How often one address may register (see accounts.views.RegisterView).
REGISTRATION_THROTTLE_RATE = "20/hour"

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWS_CREDENTIALS = True
# allauth's app client sends the session token during login.
CORS_ALLOW_HEADERS = (*default_headers, "x-session-token")
