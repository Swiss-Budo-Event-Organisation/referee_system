# Contributing

Thanks for helping with the Referee System. This guide covers how to set up the project, what we expect in a change, and how to get it merged.

> [!WARNING]
> The project is a **work in progress**. Breaking changes, including to the API, the data model and the settings, can be made at any time without prior notice. Before starting on something larger, open an issue to check that the area isn't about to change.

## Before you start

- **Bugs and ideas:** open an issue in [Swiss-Budo-Event-Organisation/referee_system](https://github.com/Swiss-Budo-Event-Organisation/referee_system/issues). For a bug, include the steps to reproduce it, what you expected and what happened.
- **Larger changes** (new features, changes to models, permissions or the deployment): discuss them in an issue first.
- **Security problems:** don't open a public issue. Contact the maintainers directly.

## Setting up

Follow [Getting started](README.md#getting-started) in the README. In short:

```sh
docker compose up --build
```

For backend work outside Docker, install [uv](https://docs.astral.sh/uv/), then run in `backend/`:

```sh
uv sync
uv run pre-commit install
```

`uv sync` installs the dependencies, including the dev tools: ruff, ty, the debug toolbar and pre-commit. `pre-commit install` sets up the git hook that checks every commit.

## Workflow

1. Fork the repository, or create a branch if you have write access. Branch off an up-to-date `main` and give the branch a descriptive name, such as `fix-application-status` or `add-event-export`.
2. Keep each pull request to one topic. Separate refactoring and formatting from behaviour changes, in separate commits or PRs.
3. Open the pull request against `main`. Describe what changed and why, and how you tested it. List anything that still needs to be done or checked.
4. If `main` moves on while your PR is open, merge `main` into your branch. Don't rebase a branch others have already pulled.
5. CI has to pass, and a maintainer has to approve the PR before it is merged.

### Commit messages

- Write the subject in the imperative and capitalise it, with no full stop, at around 70 characters at most. For example: `Add CSV export for applications`, `Fix slug clash between events of the same year`.
- After a blank line, explain *why* the change is needed, when that isn't obvious.
- Make each commit work on its own: the tests should pass after every commit.

## Code style

### Backend (Python)

- Python 3.13 or newer; CI also tests 3.14.
- [Ruff](https://docs.astral.sh/ruff/) for linting and formatting, configured in `backend/pyproject.toml`, with one import per line. Run `uv run ruff check --fix .` and `uv run ruff format .`, or let the pre-commit hook do it.
- Put business rules in the models or the `permissions.py` modules, not in views. API endpoints go in `api/`.
- Changes to models need a migration (`uv run manage.py makemigrations`). Commit it in the same change, and give it a meaningful name with `--name` if the generated one isn't. Default data, such as licenses, groups and categories, is created in data migrations.
- New settings belong in `ref_sys/settings/base.py` if they apply everywhere, otherwise in the matching environment's module. Anything that differs per deployment is read from the environment. Add it to `.env.prod.example`, and to `backend/.env.example` when it matters for local work.

### Frontend (TypeScript and React)

- TypeScript in strict mode. `npm run build` type-checks the code and must succeed.
- Put feature code under `src/features/<Feature>/` (components, hooks, utils), and top-level routes under `src/pages/`.
- Fetch data with TanStack Query hooks, and make API calls through `src/lib/api.ts`.
- ESLint (`npm run lint`) still reports existing errors and isn't enforced in CI yet. Don't add new ones, and fixing existing ones is welcome.

### Both

- The pre-commit hooks also check trailing whitespace, final newlines, JSON, TOML and YAML syntax, merge conflict markers and private keys. To run them on everything:
  ```sh
  cd backend && uv run pre-commit run --all-files
  ```

## Tests

Every change in behaviour comes with tests. Every bug fix comes with a test that fails without the fix.

**Backend.** Use Django's test framework. Tests live in `tests/` packages, or `tests.py`, inside each app. Shared helpers (`make_user`, `make_event`, `make_competition` and so on) are in `api/tests/helpers.py`.

```sh
cd backend
uv run manage.py test                       # all tests
uv run manage.py test competition           # one app
uv run manage.py test api.tests.test_auth   # one module
```

The tests run with `ref_sys.settings.test`: in-memory SQLite, fast password hashing, emails in `django.core.mail.outbox`, Celery tasks run immediately. If a change depends on PostgreSQL-specific behaviour, also run the tests with `--settings=ref_sys.settings.local` in the container.

**Frontend.** Use Vitest and Testing Library. Tests sit next to the code as `*.test.ts(x)`. `src/test/setup.ts` contains the global setup, and `src/test/utils.ts` has helpers such as `makeToken`. API calls are mocked in `App.test.tsx`.

```sh
docker compose exec app-frontend npm test
```

## Continuous integration

Every pull request runs:

| Job | What it checks |
|---|---|
| Pre-commit hooks | all hooks on all files |
| Backend tests | Python 3.13 and 3.14. A 3.15 job also runs, but its failures don't block. |
| Frontend tests and build | `npm ci`, `npm test`, `npm run build` (type check) |
| Production images | the production Docker images build |

Run the same checks locally before you push, so you don't have to wait for CI.

## Dependencies

- **Backend:** `uv add <package>`, or `uv add --dev <package>` for tools. This updates `pyproject.toml` and `uv.lock`; commit both. Don't edit `uv.lock` by hand. If it conflicts in a merge, resolve `pyproject.toml` first, then run `uv lock`.
- **Frontend:** `npm install <package>` in `frontend/`. Commit `package.json` and `package-lock.json`.
- Keep upgrades separate from feature work, and mention in the PR any constraint that holds a package back.

## License

By contributing, you agree that your contributions are licensed under the [GNU General Public License v3.0](LICENSE), the same license as the project.
