# QuizPop

A live quiz MVP with a React host/participant interface and a FastAPI backend. Product scope is in [PLAN.md](PLAN.md), visual guidance is in [DESIGN.md](DESIGN.md), and contributor conventions are in [AGENTS.md](AGENTS.md).

QuizPop uses a comic-inspired lavender, gold, and mint identity, with Space Grotesk and Space Mono typography, light and dark themes, and an original SVG logo in `frontend/public/quizpop-mark.svg`. Existing saved theme preferences and participant reconnect sessions remain compatible; the rebrand requires no database migration.

## First iteration

The app supports quiz creation (1–20 questions, 2–4 answers, 5–300 second timer setting), separate participant and private host links, and joining with a unique display name. During a live quiz, correct answers award 100 points and the host sees the full live leaderboard. During each five-second results interval, participants see the top three, their rank movement, whether their answer was correct, and points earned. After the final interval, they see final standings and a review of their own answers against the correct answers. Correct answers are not sent to participant endpoints before completion. Host and reconnect secrets are stored as hashes and issued only when needed.

This iteration uses SQLite by default for quick local setup and accepts a PostgreSQL `DATABASE_URL`. Host state and live standings arrive over an authenticated WebSocket; participants resync state once per second. The API calculates standings from stored answers, so there is no score migration. Organisation roles, admin provisioning, rate limiting, and deployment remain future milestones from `PLAN.md`; this is not yet production ready.

## Repository layout

```text
frontend/                 Vite + React client
  src/App.jsx             Shared providers and the mounted router
  src/router.jsx          Page components wired into the route table
  src/routes.js           Routes and backwards-compatible redirects
  src/pages/              Creation, host, participant, and account pages
  src/components/         Reusable quiz, live-game, account, and layout controls
  src/contexts/           Authentication, theme, and home-page in-memory drafts
  src/hooks/              Page actions, countdown, clipboard, and room subscriptions
  src/live/               Independently tested host/participant transport lifecycles
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

Run frontend route, API, room lifecycle, countdown, and demo quiz checks from `frontend/` with `npm test` (Node's built-in test runner).

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

Run the backend tests from `backend/` with `python -m pytest tests -q`, using the disposable database configuration below. Participant submission tests cover persisted scores, duplicate and invalid answers, expired questions, answer-key reveal timing, and reconnects. Leaderboard and timer tests additionally cover tied ranks and automatic movement through the results intervals. Eligibility uses the exact question start in active and results states; SQLite timestamps are compared as UTC instants.

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

Do not point these tests at a real database: account rows are cleared by the fixture. `tests/test_participant_answers.py` uses its own in-memory database. Frontend checks: `npm test` and `npm run build` from `frontend/`. React Router is mounted through `App`; route, API cancellation, and room-subscription tests run against the same modules used by the pages.

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


## Frontend navigation and state

The shared application layout owns navigation and the footer. The home page owns quiz creation and its confirmation; host and participant pages own their room state. Account pages share form controls and layout. Authentication and theme contexts span every page; the quiz draft context preserves unsaved questions across internal navigation until a browser refresh. There is no additional global state library.

Routes are `/`, `/join/:joinCode`, `/host/:eventId`, and `/account/login`, `/account/register`, `/account/forgot`, `/account/reset`, `/account/verify`, `/account/profile`. Existing `/?join=CODE` links replace-redirect to the participant route; `/login` redirects to `/account/login`. Legacy host credentials stay in URL fragments. Verification/recovery tokens stay in query parameters until successful use. Unknown routes show a not-found page.

Host hooks fetch an initial snapshot, use authenticated WebSocket updates (including empty handshakes for account-owned rooms), and fall back to one-second polling with reconnect attempts. Authorization failure clears protected data and stops retries. Participant hooks retain the existing sessionStorage reconnect keys and restore server-saved answers. Leaving a room aborts outstanding requests, closes its socket, and clears timers. The API helper exposes HTTP status through `ApiError.status` and passes action cancellation through CSRF preparation and the final request.

Use `npm ci` from `frontend/` for a reproducible dependency installation; the frontend lockfile includes React Router. For browser validation, use an isolated backend/database and check draft preservation across sign-in, account forms and theme changes, legacy URLs, host/guest play, reload reconnect, final review, and logout/revocation. Check light/dark layouts at 390, 768, and 1440 pixels. No backend migration is required for this frontend refactor.


### Event closure and deletion

The lifecycle is lobby → active/results → completed → closed → permanently deleted. Only completed events can be closed; there is no early cancellation or reopening. Hosts keep their records after closure, while participants lose standings and answer review. Closed/deleted rooms clear participant reconnect tokens and stop polling.

- `POST /api/host/{event_id}/close`: completed → closed, returns the host snapshot. Repeating closure is safe.
- `DELETE /api/host/{event_id}`: closed events only, returns 204. Permanently removes answers, participants, choices, questions and the event.

Both require existing host authorization and CSRF protection. Invalid lifecycle states return 409, missing events 404. PostgreSQL row locks serialize start, timer advancement, closure and deletion. No migration is needed for the string-valued closed state.

Run all checks with `python -m pytest tests -q` against the disposable SQLite configuration above, then `npm test` and `npm run build` from frontend. Optional PostgreSQL concurrency checks require a separate disposable database with `test` in its name (never the configured product database):

```powershell
$env:TEST_POSTGRES_URL='postgresql+psycopg://USER:PASSWORD@localhost/quizpop_test'
python -m pytest tests/test_event_concurrency.py -q
```

These checks create and drop a unique test schema. Without this variable, PostgreSQL checks are skipped; SQLite checks still run.


## Personal quiz library

Sign in with a verified account and open **My quizzes** (`/library`). The library is private: publishing means ready to reuse, not publicly listed. Home-page quick launch still creates events directly and does not automatically save library content or import historical games.

Use **New quiz** to start a draft. **Save draft** permits unfinished titles, prompts, and choices; refresh or sign in on another device to resume saved work. Leaving unsaved edits requires confirmation. **Save and publish** validates and saves the current contents atomically, creating an immutable numbered version. **Host this version** separately creates a lobby from that exact version. Editing/publishing later does not change old versions or existing games. Closing/deleting an event does not delete library content.

New routes: `/library`, `/library/new`, `/library/:quizId/edit`, `/library/:quizId`, and `/library/:quizId/versions/:versionNumber`. Version previews include correct answers and remain owner-only. Overview hosting selects the latest published version; history can launch older versions.

### Required migration

This feature requires `0002_quiz_library`. Stop the API, confirm the target database, back it up as appropriate, then run from `backend/`:

```powershell
python -m alembic current
python -m alembic upgrade head
python -m alembic check
```

Restart the API after upgrading. Existing events receive a nullable source-version reference; their content, credentials, answers and standings are retained. No existing games are imported into the library. The migration adds `library_quizzes` and `quiz_versions`; downgrade deliberately refuses to discard saved/published data. Do not use `stamp head` to skip the new schema. Implementation validation uses disposable databases; the configured product database is not automatically migrated.

### Library API

Interactive request/response schemas, examples and error responses are under **Personal quiz library** in FastAPI `/docs`; the machine-readable specification is `/openapi.json`. All endpoints below require a verified account session. Mutations also require the existing allowed `Origin`, CSRF cookie and `X-CSRF-Token` from `/api/auth/csrf`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/library/quizzes?offset=0&limit=20` | Owner-only summaries, total and pagination (limit 1–100) |
| POST | `/api/library/quizzes` | Create draft, optionally publish atomically; 201 `{quiz, version}` |
| GET | `/api/library/quizzes/{id}` | Saved draft, revision, latest version and unpublished-changes status |
| PUT | `/api/library/quizzes/{id}` | Save draft using the expected `revision` |
| POST | `/api/library/quizzes/{id}/publish` | Save submitted content and publish; `{quiz, version}` |
| GET | `/api/library/quizzes/{id}/versions` | Version history, newest first |
| GET | `/api/library/quizzes/{id}/versions/{number}` | Fixed version including choices, answer key and timers |
| POST | `/api/library/quizzes/{id}/versions/{number}/events` | Fresh lobby; 201 with existing event/share-link response |

Example creation body (set `publish` to true to validate and publish immediately):

```json
{
  "title": "Python basics",
  "publish": false,
  "questions": [{
    "prompt": "Which keyword defines a function?",
    "choices": ["", "def", "class", ""],
    "correct_choice_index": 1,
    "time_limit_seconds": 20
  }]
}
```

To save or publish an existing draft, send the same title/questions with `"revision": 1` (the most recently returned revision), without `publish`. Revisions advance only when content changes. Stale saves/publications return 409 and do not overwrite data. Reload the saved draft after explicitly deciding to discard local edits. Repeating publication of the same saved revision returns the existing version.

Draft limits: title 100 characters, up to 20 questions, prompt 500 characters, up to four choices of 200 characters, timers 5–300 seconds. Blank content and zero questions are allowed while drafting. Publication requires a nonblank title and prompt, 1–20 questions, 2–4 filled choices and one nonblank correct choice. Blank choice slots are removed and the selected correct-answer index is remapped in the published snapshot. The editable draft retains its original slots.

Missing or another owner's resources return 404; missing authentication returns 401; unverified accounts/CSRF failures return 403; invalid content returns 422. Publications serialize on the quiz row and enforce unique version numbers/source revisions. Synchronous database work runs outside the async event loop. This release has no library deletion, subjects/topics, AI, assignments or public sharing.

### Library validation

After configuring the disposable SQLite `auth-test` database described above:

```powershell
python -m pytest tests -q
python -m pytest tests/test_quiz_library.py tests/test_auth_migration.py -q
```

Run `npm test` and `npm run build` from `frontend/`. Optional PostgreSQL publication checks require `TEST_POSTGRES_URL` pointing at a different disposable database with `test` in its name; run `python -m pytest tests/test_library_concurrency.py -q`. They create/drop a unique schema and skip when no test URL is supplied. Never point tests at the product database.

Browser validation: create an incomplete draft, save/reload, test unsaved-navigation cancellation, publish v1, launch it, edit/publish v2, and verify the old lobby still plays v1. Verify stale edits from a second tab produce a conflict without losing local text; explicitly reload, preview both versions, and host from history. Check signed-out redirects, account switches/logout, loading/errors, and 390/768/1440-pixel light/dark screens.


## Organisation workspaces and permissions

Personal quizzes and quick-launch games remain personal. Organisations have their own shared library and member-only games; publication is private to the organisation, not public sharing. Existing data is never automatically assigned to an organisation or linked to an account.

| Capability | Owner | Admin | Instructor | Learner |
| --- | --- | --- | --- | --- |
| Organisation overview and member-only participation | Yes | Yes | Yes | Yes |
| Draft read/edit/publish | All | All | Own authored drafts | No |
| Published answer preview and hosting | Yes | Yes | Yes | No |
| Host control | All | All | Games they launched, while still an instructor | No |
| Manage instructors/learners and invitations; read audit | Yes | Yes | No | No |
| Manage admins; rename; transfer ownership | Yes | No | No | No |

Verified accounts can create organisations. Each has exactly one active owner: a partial unique index prevents duplicate owners, and locked transactional services prevent removing the last owner. Transferring to an active member makes the previous owner an admin. Owners must transfer before leaving. Removing/leaving deactivates membership and retains drafts, versions, games, answers and audit history. Platform-admin flags grant no organisation permissions.

The workspace switcher follows the URL. `/organisations` lists/creates workspaces; `/organisations/{id}` is the overview, with `/members`, `/invitations`, `/settings`, `/audit` and `/library` screens. Shared library editor/history/version routes mirror `/library`. Learners see an overview and join form without answer keys or editor controls. Instructors see published versions by other authors, but never their unpublished drafts or edits. Personal quiz details offer **Copy to organisation**; this creates a new draft without moving the original or copying version history.

### Organisation API

All endpoints require verified cookie authentication. Mutations use the existing `Origin` and `X-CSRF-Token` protections. Interactive schemas and permission/conflict examples are in `/docs`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET / POST | `/api/organisations` | List active memberships / create with `{ "name": "Learning team" }` |
| GET / PATCH | `/api/organisations/{id}` | Metadata, own role and capabilities / owner-only rename |
| GET | `/api/organisations/{id}/members` | Manager-only active and inactive memberships |
| PATCH / DELETE | `/api/organisations/{id}/members/{membershipId}` | Assign `{ "role": "learner" }` / deactivate; owner required to manage admins |
| POST | `/api/organisations/{id}/ownership` | Owner transfers using `{ "user_id": "account-uuid" }` |
| POST | `/api/organisations/{id}/leave` | Deactivate own non-owner membership |
| GET / POST | `/api/organisations/{id}/invitations` | List / create email-bound role invitation |
| POST | `/api/organisations/{id}/invitations/{invitationId}/regenerate` | Rotate link; old secret becomes unusable |
| DELETE | `/api/organisations/{id}/invitations/{invitationId}` | Revoke unused invitation |
| POST | `/api/organisations/invitations/preview` | Confirm destination/role with `{ "token": "fragment-secret" }` |
| POST | `/api/organisations/invitations/accept` | Explicit acceptance with same token body |
| GET | `/api/organisations/{id}/audit?offset=0&limit=20` | Manager-only paginated safe audit records |
| POST | `/api/organisations/{id}/quizzes/copy-personal/{quizId}` | Copy own saved personal draft into a new shared draft |

`/api/organisations/{id}/quizzes` supports the same list/create/read/save/publish/version/version-launch suffixes and revision payloads as `/api/library/quizzes`. Returned capabilities determine available draft actions. Other instructors' detail responses have `questions`, `revision` and `has_unpublished_changes` set to null and use the latest published title/count/time. Learners cannot access this namespace. Launching `/.../versions/{number}/events` snapshots content into a fresh organisation lobby and returns the existing confirmation payload.

Example invitation creation:

```json
{ "email": "learner@example.com", "role": "learner" }
```

The response includes `{ "invitation": { ... }, "url": "https://your-frontend/organisations/invitations/accept#SECRET" }`. Share this link manually; automatic email is deferred. Links expire in seven days, are stored as hashes only, and are invalidated by regeneration, revocation or loss of the issuer's management privileges. The frontend captures the fragment in tab-scoped session storage, replaces the visible URL, and submits the secret only in POST bodies. Sign-in, registration, verification and Google sign-in preserve the pending invitation; acceptance always requires an explicit confirmation and a matching normalized verified email. An invitation cannot change an active member's role. Replays cannot restore revoked access; a new invitation is needed to reactivate membership.

Missing/inaccessible resources return 404. Disallowed actions inside an accessible organisation return 403. Ownership, membership, invitation and stale-revision conflicts return 409; expired invitations return 410; invalid bodies return 422. Organisation games return generic `ORG_AUTH_REQUIRED` (401) or `ORG_ACCESS_REVOKED` (403) errors without private quiz metadata. A token used by another account returns `ORG_PARTICIPANT_MISMATCH` (403).

Member games bind entries to verified accounts and require active membership for joining, reconnecting, state reads and answers. Eligible rejoining resumes the same entry and rotates its reconnect token. Personal guest tokens remain independent. Host HTTP/WebSocket access rechecks current membership and role; owner/admin takeover is allowed. Workspace screens recheck on navigation, focus and a five-second heartbeat; revocation clears private UI and cancels pending requests. Participant polling stops and clears private results/tokens on organisation authorization failure.

Successful organisation/content/control mutations and safe authorization denials are audited with actor, organisation, action, target, outcome, time and correlation ID. No invitation secrets, emails, question bodies or answer content enter audit rows. Protected writes acquire an organisation shared lock before content/event locks; membership changes take an exclusive organisation lock. Blocking database operations run outside the async event loop.

### Organisation migration and validation

Revision `0003_organisations` adds organisation/membership/invitation/audit tables and nullable organisation/account references. Existing quizzes/events remain personal and existing guest entries remain unlinked. No destructive downgrade is provided. Startup checks required tables/columns and reports an actionable migration error instead of serving unexplained request-time 500s; it never migrates automatically.

Back up the intended database and rehearse the migration on a disposable copy first. From `backend/`, with the correct virtual environment and `DATABASE_URL` selected:

```powershell
python -m alembic current
python -m alembic upgrade head
python -m alembic check
```

The same upgrade command applies after future additive revisions; generate/review future revisions using the migration workflow above. Restart the API after upgrading. Implementation validation uses disposable databases only; applying this revision to the configured product database requires explicit authorization.

Run the full suites with an isolated SQLite database (the authentication test guard requires `auth-test` in its name):

```powershell
$env:DATABASE_URL = 'sqlite:///./auth-test-organisations.db'
$env:AUTH_SECRET = 'disposable-test-secret'
$env:AUTH_COOKIE_SECURE = 'false'
python -m pytest tests -q
```

From `frontend/`, run `npm test` and `npm run build`. Optional PostgreSQL races use `TEST_POSTGRES_URL` with a separately provisioned disposable database containing `test` in its name and different from the configured database. Run `python -m pytest tests/test_organisation_concurrency.py -q`. Tests create/drop a unique schema and cover acceptance, owner transfer, revocation versus protected writes, and publication. They skip when no disposable PostgreSQL URL is supplied. Never use the product database.

Browser regression: exercise all four roles in two organisations, personal copying, hidden peer drafts, explicit invitation acceptance and wrong-email failures, shared hosting/member participation, ownership transfer, and removal while connected. Check light/dark layouts at 390/768/1440 pixels and confirm personal guest flows still work. Deferred: groups, assignments, analytics, automated invitation email and organisation deletion.
