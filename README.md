# Referee System

> [!WARNING]
> **Work in progress.** This project is under active development and not yet stable. Breaking changes can happen at any time, without prior notice: to the API, the data model and migrations, the settings and environment variables, and the deployment setup. Pin a specific commit if you depend on it, and expect to adapt when you update.

A web application for organising referees at budo (judo) events. Organisers publish events and competitions, referees apply for them, and admins review applications, send invitations and keep track of referee licenses and examinations.

## Features

- **Events and competitions:** organisers publish events with one or more competitions, each with its categories, required referee level and application period.
- **Applications:** referees apply for competitions, including accommodation, and admins decide on them.
- **Invitations:** selected applicants are invited by email.
- **Licenses and examinations:** referee licenses and the examinations leading to them are recorded.
- **Permissions:** admins, observers and examiners only see and manage what belongs to their area.

Features may still be incomplete or change; see the note above.

## Architecture

| Part | Technology |
|---|---|
| Backend | Django 6, Django REST Framework, JWT authentication (Simple JWT) |
| Background tasks | Celery with Redis (planned for sending emails and scheduled jobs; not fully in use yet) |
| Database | PostgreSQL 18 (SQLite in tests) |
| Frontend | React 19, TypeScript, Vite, React Bootstrap, TanStack Query |
| Production | Gunicorn, WhiteNoise, Caddy (automatic HTTPS) |

```
backend/            Django project
  ref_sys/          project package: settings, URLs, Celery app
    settings/       base.py, local.py, test.py, production.py
  api/              REST API (views, serializers, URLs under /api/)
  competition/      events, competitions, applications, invitations
  referee/          referees, licenses, examinations, roles
  helper/           addresses, locations, shared category model
frontend/           React app
  src/pages/        top-level pages (events, event detail, profile, login, register)
  src/features/     feature code: Events, User
compose/production/ production Dockerfiles and Caddyfile
```

In production, Caddy serves the built frontend and forwards `/api/`, `/admin/` and `/static/` to Django, so the frontend and API share one domain.

## Getting started

You need [Docker](https://docs.docker.com/get-docker/) with Compose. For working on the backend outside the containers, also install [uv](https://docs.astral.sh/uv/).

```sh
git clone https://github.com/Swiss-Budo-Event-Organisation/referee_system.git
cd referee_system
docker compose up --build
```

This starts the development stack:

| Service | URL |
|---|---|
| Frontend (Vite dev server, hot reload) | http://localhost:8080 |
| API | http://localhost:8000/api/ |
| Django admin | http://localhost:8000/admin/ |
| Flower (Celery monitoring, login `admin` / `admin`) | http://localhost:5555 |
| PostgreSQL | `localhost:5432`, user, password and database `postgres` |
| Redis | `localhost:6379` |

Migrations run automatically when the backend container starts. To create an admin user:

```sh
docker compose exec app-backend uv run --no-sync manage.py createsuperuser
```

The `backend/` and `frontend/` folders are mounted into the containers, so code changes take effect immediately. Rebuild after changing dependencies (`pyproject.toml`, `uv.lock` or `package.json`):

```sh
docker compose up --build -V
```

`-V` recreates the frontend's `node_modules` volume so new packages are picked up.

## Running the tests

**Backend.** The tests use `ref_sys.settings.test`: an in-memory SQLite database, emails kept in memory and Celery tasks run immediately. They need neither Docker nor an `.env` file.

```sh
cd backend
uv sync
uv run manage.py test
```

Inside the container: `docker compose exec app-backend uv run --no-sync manage.py test`. To run the tests against PostgreSQL instead, add `--settings=ref_sys.settings.local`.

**Frontend.** The frontend uses Vitest and Testing Library:

```sh
docker compose exec app-frontend npm test
```

With Node.js 24 installed locally, `npm ci && npm test` in `frontend/` works as well.

## Settings and environments

| Module | Used for | Notes |
|---|---|---|
| `ref_sys.settings.local` | development (default) | `DEBUG` on, debug toolbar, emails printed to the console |
| `ref_sys.settings.test` | `manage.py test` (selected automatically) | SQLite, fast password hashing, no external services |
| `ref_sys.settings.production` | the production stack | every value read from `.env.prod`; refuses to start if one is missing |

Settings are read from environment variables. Outside Docker, `backend/.env` is loaded too; `backend/.env.example` shows the optional variables for local work. Outgoing email is configured with a single URL in `EMAIL`, for example `consolemail://` or `smtp+tls://user:password@smtp.example.ch:587`.

## Deployment

The production stack in `docker-compose.production.yml` runs:

- Django on Gunicorn, as a non-root user;
- a one-off `migrate` service that the other services wait for;
- the Celery worker and beat;
- PostgreSQL and Redis, which have no published ports;
- Caddy on ports 80 and 443, which gets and renews the HTTPS certificate automatically.

1. On the server, point the domain's DNS at the server and open ports 80 and 443.
2. Create the settings file and fill in every value:
   ```sh
   cp .env.prod.example .env.prod
   ```
   `.env.prod` is gitignored. Never commit it.
3. Build and start:
   ```sh
   docker compose -f docker-compose.production.yml up -d --build
   ```
4. Create an admin user:
   ```sh
   docker compose -f docker-compose.production.yml exec django python manage.py createsuperuser
   ```

To update, pull the new code and run step 3 again; migrations run automatically.

Flower is not reachable through Caddy. Start it with `--profile flower`; it then listens on `127.0.0.1:5555` on the server only, for example through an SSH tunnel. `SECURE_HSTS_SECONDS` defaults to 60 seconds; raise it once HTTPS works on the real domain.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
