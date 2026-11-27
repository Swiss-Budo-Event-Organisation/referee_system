"""
Production settings. Every value comes from the environment, which
docker-compose.production.yml fills from .env.prod.

Django runs behind Caddy, which terminates HTTPS and serves the frontend.
"""

import environ
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import MIDDLEWARE
from .base import database_config
from .base import env


def required(name):
    value = env.str(name, default="")
    if not value:
        raise ImproperlyConfigured(f"{name} must be set in .env.prod")
    return value


DEBUG = False

SECRET_KEY = required("SECRET_KEY")

# Access and refresh tokens are signed with RS256 and this PEM key.
HEADLESS_JWT_PRIVATE_KEY = required("JWT_PRIVATE_KEY").replace("\\n", "\n")
HEADLESS_JWT_ALGORITHM = "RS256"
HEADLESS_SERVE_SPECIFICATION = False

DOMAIN = required("DOMAIN")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[DOMAIN])
CSRF_TRUSTED_ORIGINS = [f"https://{host}" for host in ALLOWED_HOSTS]
FRONTEND_URL = env.str("FRONTEND_URL", default=f"https://{DOMAIN}").rstrip("/")

# Second factors. Passkeys are bound to the public domain and only accepted
# from https origins; secrets are encrypted with keys of their own.
MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN = False
MFA_WEBAUTHN_RP_ID = env.str("WEBAUTHN_RP_ID", default=DOMAIN)
MFA_ENCRYPTION_KEYS = [
    key.strip() for key in required("MFA_ENCRYPTION_KEYS").split(",") if key.strip()
]

# A cache shared by all workers: allauth keeps its rate limits (login,
# failed logins, codes) and the used TOTP codes there, so a code cannot be
# replayed on another worker.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env.str("CACHE_URL", default="redis://redis:6379/1"),
    }
}

# Database
DATABASES = database_config()
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# Static files: collected into the image and served by WhiteNoise with
# compressed, hashed file names. Caddy forwards /static/ to Django.
MIDDLEWARE = [
    MIDDLEWARE[0],  # SecurityMiddleware must stay first.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[1:],
]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}

# Security. Caddy terminates TLS and sets X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# Start low and raise to a year (31536000) once HTTPS is known to work.
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=60)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS", default=True
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)

# The frontend is served from the same domain, so no cross-origin access.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])

# E-mail over SMTP, e.g. smtp+tls://user:password@smtp.example.ch:587
EMAIL_CONFIG = environ.Env.email_url_config(required("EMAIL"))
vars().update(EMAIL_CONFIG)
DEFAULT_FROM_EMAIL = required("DEFAULT_FROM_EMAIL")
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Logging to stdout, where docker compose logs picks it up.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "%(levelname)s %(asctime)s %(name)s %(message)s"}
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "verbose"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"level": "WARNING"},
        "django.security.DisallowedHost": {"level": "ERROR"},
    },
}
