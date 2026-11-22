# Contributing

Thanks for helping with the Referee System.

> [!WARNING]
> The project is a **work in progress**. Features, structure and setup can change at any time without prior notice. Before starting on something larger, open an issue to check that the area isn't about to change.

## Before you start

- **Bugs and ideas:** open an issue in [Swiss-Budo-Event-Organisation/referee_system](https://github.com/Swiss-Budo-Event-Organisation/referee_system/issues). For a bug, include the steps to reproduce it, what you expected and what happened.
- **Larger changes:** discuss them in an issue first.
- **Security problems:** don't open a public issue. Contact the maintainers directly.

## Setting up

Start the development stack as described in the [README](README.md#getting-started).

For backend work outside Docker, install [uv](https://docs.astral.sh/uv/), then run in `backend/`:

```sh
uv sync                     # dependencies and dev tools
uv run pre-commit install   # checks every commit
uv run manage.py test       # tests, no other services needed
```

## Workflow

1. Fork the repository, or create a branch if you have write access. Branch off an up-to-date `main` and give the branch a descriptive name.
2. Keep each pull request to one topic. Separate refactoring and formatting from changes in behaviour.
3. Open the pull request against `main`. Describe what changed and why, and how you tested it.
4. If `main` moves on while your PR is open, merge `main` into your branch.
5. CI has to pass, and a maintainer has to approve the PR before it is merged.

**Commit messages:** a short subject in the imperative, such as `Add export of applications`. Explain the reason in the body when it isn't obvious. The tests should pass after every commit.

## Guidelines

- **Tests:** every change in behaviour comes with tests, and every bug fix with a test that fails without it.
- **Formatting and linting:** the pre-commit hooks take care of it. To run them on everything:
  ```sh
  cd backend && uv run pre-commit run --all-files
  ```
- **Database changes:** commit the migrations together with the model changes.
- **Settings:** values that differ between deployments are read from the environment. Add new ones to the matching example file (`.env.prod.example`, `backend/.env.example`).
- **Dependencies:** add them with the package manager (`uv add` or `npm install`) and commit the updated lock files. Don't edit lock files by hand. Keep upgrades separate from feature work.

## Checks

CI runs the hooks, the backend and frontend tests, the frontend build and the production image build on every pull request. Run the tests locally before you push:

```sh
docker compose exec app-backend uv run --no-sync manage.py test
docker compose exec app-frontend npm test
```

## License

By contributing, you agree that your contributions are licensed under the [GNU General Public License v3.0](LICENSE), the same license as the project.
