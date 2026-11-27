# Production image for Django, the Celery worker and beat.
# Build context: ./backend
FROM ghcr.io/astral-sh/uv:python3.13-alpine AS builder

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=0 \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --group production --no-install-project

COPY . .

# Collect static files into the image. These values are only needed to load
# the settings; the real ones come from .env.prod at runtime.
RUN DJANGO_SETTINGS_MODULE=ref_sys.settings.production \
    ENV_PATH=does-not-exist.env \
    SECRET_KEY=collectstatic-only \
    JWT_PRIVATE_KEY=collectstatic-only \
    MFA_ENCRYPTION_KEYS=collectstatic-only \
    DOMAIN=localhost \
    EMAIL=consolemail:// \
    DEFAULT_FROM_EMAIL=noreply@localhost \
    DATABASE_URL=sqlite:////tmp/collectstatic.sqlite3 \
    /opt/venv/bin/python manage.py collectstatic --noinput


FROM python:3.13-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENV_PATH=does-not-exist.env \
    DJANGO_SETTINGS_MODULE=ref_sys.settings.production \
    PATH="/opt/venv/bin:$PATH"

RUN addgroup -S django && adduser -S -G django django

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder --chown=django:django /app /app

USER django

EXPOSE 8000

# Gunicorn reads the number of workers from WEB_CONCURRENCY (default 1).
CMD ["gunicorn", "ref_sys.wsgi:application", "--bind", "0.0.0.0:8000", "--access-logfile", "-"]
