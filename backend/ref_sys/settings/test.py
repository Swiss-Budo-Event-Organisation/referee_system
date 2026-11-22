"""
Settings for the test suite: fast, self-contained and with no outside services.

`manage.py test` selects this module automatically.
"""

from .base import *  # noqa: F403

SECRET_KEY = "test-only-insecure-secret-key"

DEBUG = False

ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]

# SQLite test databases are created in memory, so no Postgres is needed.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
        "ATOMIC_REQUESTS": True,
    }
}

# Argon2 is deliberately slow; MD5 keeps user-heavy tests fast.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Mails go to django.core.mail.outbox instead of the console or SMTP.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Run Celery tasks in-process and without a broker.
CELERY_BROKER_URL = "memory://"
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
