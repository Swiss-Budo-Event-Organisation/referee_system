# Referee System

> [!WARNING]
> **Work in progress.** This project is under active development and not yet stable. Features, structure and setup can change at any time, including breaking changes, without prior notice.

A web application for organising referees at budo (judo) events. Referees apply for events, and organisers manage applications, invitations and referee qualifications.

The project consists of a Django backend with a REST API and a React frontend. Everything runs in Docker containers.

## Getting started

You only need [Docker](https://docs.docker.com/get-docker/) with Compose.

```sh
git clone https://github.com/Swiss-Budo-Event-Organisation/referee_system.git
cd referee_system
docker compose up --build
```

This starts the development stack with all the services it needs. Once it is running:

| What | Where |
|---|---|
| Web app | http://localhost:8080 |
| API | http://localhost:8000/api/ |
| Admin interface | http://localhost:8000/admin/ |

The database is set up automatically on startup. To log in, create an admin user:

```sh
docker compose exec app-backend uv run --no-sync manage.py createsuperuser
```

Code changes in `backend/` and `frontend/` take effect without restarting. After changing dependencies, rebuild with:

```sh
docker compose up --build -V
```

To stop the stack, run `docker compose down`. Add `-v` to also delete the development data.

## Running the tests

With the development stack running:

```sh
docker compose exec app-backend uv run --no-sync manage.py test   # backend
docker compose exec app-frontend npm test                          # frontend
```

The backend tests use their own temporary database, so they don't touch your development data. They can also run without Docker; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

A separate production setup is included and serves the app over HTTPS.

1. Copy the settings template and fill in every value:
   ```sh
   cp .env.prod.example .env.prod
   ```
   `.env.prod` contains secrets and is never committed.
2. Build and start:
   ```sh
   docker compose -f docker-compose.production.yml up -d --build
   ```

The comments in `.env.prod.example` and `docker-compose.production.yml` give the details.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
