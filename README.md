# QuizPop

A live quiz MVP with a React host/participant interface and a FastAPI backend. Product scope is in [PLAN.md](PLAN.md), visual guidance is in [DESIGN.md](DESIGN.md), and contributor conventions are in [AGENTS.md](AGENTS.md).

QuizPop uses a comic-inspired lavender, gold, and mint identity, with Space Grotesk and Space Mono typography, light and dark themes, and an original SVG logo in `frontend/public/quizpop-mark.svg`. Existing saved theme preferences and participant reconnect sessions remain compatible; the rebrand requires no database migration.

## First iteration

The app supports quiz creation (1–20 questions, 2–4 answers, 5–300 second timer setting), separate participant and private host links, and joining with a unique display name. During a live quiz, correct answers award 100 points and the host sees the full live leaderboard. During each five-second results interval, participants see the top three, their rank movement, whether their answer was correct, and points earned. After the final interval, they see final standings and a review of their own answers against the correct answers. Correct answers are not sent to participant endpoints before completion. Host and reconnect secrets are stored as hashes and issued only when needed.

This iteration uses SQLite by default for quick local setup and accepts a PostgreSQL `DATABASE_URL`. Host state and live standings arrive over an authenticated WebSocket; participants resync state once per second. The API calculates standings from stored answers, so there is no score migration. Organisation roles, admin provisioning, rate limiting, and deployment remain future milestones from `PLAN.md`; this is not yet production ready.

## Repository layout

```text
frontend/                 Vite + React client
  src/App.jsx             Quiz creation, join, lobby, and demo host onboarding
  src/demoQuiz.js         Local demo question banks, shuffling, and API payloads
  src/styles.css          Design tokens, responsive layout, and motion
backend/                  FastAPI service
  app/main.py             API routes and application setup
  app/models.py           SQLAlchemy event and participant models
  app/schemas.py          Request validation
  app/database.py         Database configuration
```

## Run locally

Requirements: Python 3.10+ and Node.js 20.19+ or 22.12+.

Start the API in one terminal:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --env-file .env --loop app.runtime:create_event_loop --port 8107
```

The command above starts the API at `http://localhost:8107`; interactive API documentation is at `/docs`. Set `API_PROXY_TARGET=http://127.0.0.1:8107` in `frontend/.env` to match that port. With `DATABASE_URL` unset, the migration creates `backend/quiz.db` for local development. To use PostgreSQL, uncomment and set `DATABASE_URL` in `backend/.env`, for example `postgresql+psycopg://quiz:quiz@localhost:5432/quiz`. `FRONTEND_ORIGINS` is a comma-separated list of allowed browser origins.

Start the frontend in another terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Leave `VITE_API_URL` empty for same-origin requests. Vite proxies `/api` (including host WebSockets) to `API_PROXY_TARGET`, which defaults to `http://127.0.0.1:8000`; set `API_PROXY_TARGET` in `frontend/.env` if your local backend uses another port, then restart Vite. Set `VITE_API_URL` only for an explicitly separate same-site API deployment. Register and verify an account, sign in, create a quiz, open its host link in one browser tab, and visit the participant link in another. `npm run build` creates a static production build in `frontend/dist/`.

Run the frontend demo quiz logic checks from `frontend/` with `npm test` (Node's built-in test runner).

## API outline

- `GET /api/health` — liveness check.
- `POST /api/quizzes` — validate and create a quiz; requires a verified account and returns the public join URL and account-authorized host URL.
- `GET /api/events/{join_code}` — return public lobby metadata.
- `POST /api/events/{join_code}/participants` — join a lobby; returns a one-time reconnect token.
- `GET /api/events/{join_code}/state` — return participant state; completed quizzes include full standings and an answer review.
- `POST /api/events/{join_code}/answers` — submit one answer for the current question before its deadline.
- `GET /api/host/{event_id}` — return host-only lobby details; requires the owner’s verified account session; existing unowned events retain bearer host links.
- `WS /api/host/{event_id}/ws` — send an empty first text frame for account hosting (or the legacy host token); authorization is checked before each update.

Correct answers earn 100 points; incorrect and unanswered questions earn zero. Tied scores share rank, with tied rows ordered by join time. Each question is followed by a five-second results interval. Participants who join during a question can begin answering with the next question.

## Security and development notes

Treat legacy host links and participant reconnect tokens as bearer secrets. New host URLs require the owning account. Session cookies are opaque, HttpOnly, SameSite=Lax, secure by default, and expire after 24 hours. Server-side logout/revocation takes effect on HTTP requests and before the next WebSocket update. Keep `.env` files out of version control. Schema changes run through Alembic; startup no longer alters tables. Back up existing databases before migration.

Host WebSockets re-read state and authorization once per second. The timer worker runs in-process; coordinate timer ownership before deploying multiple workers.

The frontend demo quiz has automated checks for its question banks, category shuffling, and correct-answer association. Add backend coverage for quiz validation, display-name conflicts, host authorization, and the complete timed game flow as those milestones are implemented.

Run the backend tests from `backend/` with `python -m pytest tests -q`, using the disposable database configuration below. Participant submission tests cover persisted scores, duplicate and invalid answers, expired questions, answer-key reveal timing, and reconnects. Leaderboard and timer tests additionally cover tied ranks and automatic movement through the results intervals. Two existing leaderboard/timer assertions currently fail: results-interval eligibility and SQLite timezone comparison; these remain separate behavior fixes.

## Account setup and validation

Install the updated backend requirements and copy the authentication settings from `backend/.env.example`. Set `AUTH_SECRET` to a persistent random secret. Alembic and the API both read `backend/.env`. Run commands from `backend/`; use `AUTH_COOKIE_SECURE=false` only for local HTTP. Keep the frontend and API on `localhost` consistently (do not mix it with `127.0.0.1`).

Configure SMTP to deliver verification and recovery links. Registration is followed by a verification request; if email delivery is unavailable, the account remains unverified and the user can retry from the resend screen after configuration is fixed. Tokens are never returned or logged. Google controls appear only when both client credentials are configured. Register both callback URLs shown in `.env.example` with Google. OAuth callbacks are handled by the API, bind state to the initiating browser, and redirect to the fixed `FRONTEND_URL/account/profile`. Existing email accounts are never automatically merged; sign in and choose **Link Google account** instead.

Account screens: `/account/login`, `/account/register`, `/account/verify`, `/account/forgot`, `/account/reset`, `/account/profile`. Reset/verification email links supply the token. Profile editing changes only the display name; email/password changes use the separate recovery flow. Password reset revokes all account sessions. Public registration cannot grant admin privileges.

Every state-changing API request, including guest joins and answers, must first fetch `/api/auth/csrf` with credentials, then send its token in `X-CSRF-Token`, the cookie, and an allowed `Origin`. The React client does this automatically. `FRONTEND_ORIGINS` must list exact trusted origins. Deploy using a same-origin API proxy or controlled same-site HTTPS domains; unrelated default Vercel/Render domains will not work reliably with SameSite=Lax cookies.

Run authentication tests against a disposable SQLite database (PowerShell):

```powershell
$env:AUTH_SECRET='test-only-secret'
$env:AUTH_COOKIE_SECURE='false'
$env:DATABASE_URL='sqlite:///./auth-test.db'
pip install -r requirements-dev.txt
python -m pytest tests/test_auth.py tests/test_auth_migration.py -q
```

Do not point these tests at a real database: account rows are cleared by the fixture. `tests/test_participant_answers.py` uses its own in-memory database. Frontend checks: `npm test` and `npm run build` from `frontend/`. The React Router files and their tests are retained for future routing work; the current frontend entry point still mounts `App` directly.

Before production: configure and exercise real Google/SMTP flows, run migration against a PostgreSQL staging copy, verify HTTPS cookie/proxy and WebSocket routing, and add shared rate limiting/abuse controls and monitoring. Organisation memberships, group permissions, and a platform-admin portal are separate planned features; authentication does not yet create those domain models.

## Database migrations

Alembic tracks schema versions in the database's `alembic_version` table. Run the following commands from `backend/`, using the Python environment where `requirements.txt` is installed. Both Alembic and the API read `backend/.env`; an exported `DATABASE_URL` overrides that file. Confirm the intended database before running any upgrade. Keep connection strings and credentials out of commits and command output.

For a fresh database or an existing deployment receiving new migrations:

```bash
python -m alembic current
python -m alembic heads
python -m alembic upgrade head
python -m alembic current
```

The final `current` should match `heads`. The initial `0001_auth` migration also upgrades legacy quiz databases, preserving existing events and their host links. API startup does not create new tables or apply migrations automatically. Do not use `alembic stamp head` to skip missing tables: stamping changes only the version record.

When adding tables, columns, indexes, or constraints:

1. Bring a local development database to the current revision with `python -m alembic upgrade head`.
2. Edit the SQLAlchemy models. Import any new model module in `migrations/env.py` so its tables are registered in `Base.metadata`.
3. Generate a new revision against that development database:

    ```bash
    python -m alembic revision --autogenerate -m "add example table"
    ```

4. Review the generated file in `migrations/versions/`. Autogeneration is a draft: renames can appear as destructive drop/add operations, and data backfills need explicit code. Review foreign keys, indexes, nullability, defaults, custom types, and both `upgrade()` and `downgrade()`. Add columns as nullable or provide a deliberate backfill when existing rows need values.
5. Apply it locally with `python -m alembic upgrade head`. Test both a fresh database through the full migration history and an existing database upgraded from the previous revision. Use disposable databases, and add a migration test when preserving or transforming data matters. If a downgrade is supported, test it only on a disposable database; the authentication baseline deliberately refuses downgrade to avoid discarding accounts.
6. Commit the model changes and the new revision together. Add a new revision for later changes; do not rewrite revisions already deployed. If branches introduce multiple heads, review their dependencies and create an Alembic merge revision before deployment.

Before applying migrations to a shared or production database, take a recoverable backup or snapshot and test against a staging copy. Apply migrations once as a deployment/release step, before starting application code that requires the new schema. Avoid running migrations independently from every API worker. For destructive or incompatible changes, schedule downtime or use staged, backward-compatible changes. Recovery depends on the migration: use a reviewed downgrade where supported, a corrective forward migration, or restore the backup.

Migration regression check (after setting a disposable test database as described above):

```bash
python -m pytest tests/test_auth_migration.py -q
```

On Windows, use `--loop app.runtime:create_event_loop` when starting Uvicorn, including without reload. Psycopg async PostgreSQL connections require a Selector event loop; the default Proactor loop fails when an account route first accesses the database.

The canonical presentation deck is `presentation-output/live-quiz-demo.pptx`. The PDF and architecture guide remain reference documents. Generated presentation intermediates are excluded from version control.
