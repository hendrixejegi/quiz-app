# Live Quiz Competition

A live quiz MVP with a React host/participant interface and a FastAPI backend. Product scope is in [PLAN.md](PLAN.md), visual guidance is in [DESIGN.md](DESIGN.md), and contributor conventions are in [AGENTS.md](AGENTS.md).

## First iteration

The app supports quiz creation (1–20 questions, 2–4 answers, 5–300 second timer setting), separate participant and private host links, and joining with a unique display name. During a live quiz, correct answers award 100 points and the host sees the full live leaderboard. During each five-second results interval, participants see the top three, their rank movement, whether their answer was correct, and points earned. After the final interval, they see final standings and a review of their own answers against the correct answers. Correct answers are not sent to participant endpoints before completion. Host and reconnect secrets are stored as hashes and issued only when needed.

This iteration uses SQLite by default for quick local setup and accepts a PostgreSQL `DATABASE_URL`. Host state and live standings arrive over an authenticated WebSocket; participants resync state once per second. The API calculates standings from stored answers, so there is no score migration. Durable reconnect, migrations, BetterAuth admin, rate limiting, and deployment remain future milestones from `PLAN.md`; this is not yet production ready.

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
python -m uvicorn app.main:app --reload --env-file .env
```

The API is at `http://localhost:8000`; interactive API documentation is at `/docs`. With `DATABASE_URL` unset, the API creates `backend/quiz.db` for local development. To use PostgreSQL, uncomment and set `DATABASE_URL` in `backend/.env`, for example `postgresql+psycopg://quiz:quiz@localhost:5432/quiz`. `FRONTEND_ORIGINS` is a comma-separated list of allowed browser origins.

Start the frontend in another terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Set `VITE_API_URL` in `frontend/.env` if the API uses another address. Create a quiz, open its host link in one browser tab, and visit the participant link in another. `npm run build` creates a static production build in `frontend/dist/`.

Run the frontend demo quiz logic checks from `frontend/` with `npm test` (Node's built-in test runner).

## API outline

- `GET /api/health` — liveness check.
- `POST /api/quizzes` — validate and create a quiz; returns the public join URL and one-time private host URL.
- `GET /api/events/{join_code}` — return public lobby metadata.
- `POST /api/events/{join_code}/participants` — join a lobby; returns a one-time reconnect token.
- `GET /api/events/{join_code}/state` — return participant state; completed quizzes include full standings and an answer review.
- `POST /api/events/{join_code}/answers` — submit one answer for the current question before its deadline.
- `GET /api/host/{event_id}` — return host-only lobby details; requires `Authorization: Bearer <token>`.
- `WS /api/host/{event_id}/ws` — send the host token as the first text frame; receive current state and live standings updates.

Correct answers earn 100 points; incorrect and unanswered questions earn zero. Tied scores share rank, with tied rows ordered by join time. Each question is followed by a five-second results interval. Participants who join during a question can begin answering with the next question.

## Security and development notes

Treat host links and participant reconnect tokens as bearer secrets. Keep `.env` files out of version control. The host URL keeps its credential in the URL fragment so browsers do not send it as part of the HTTP request; the frontend uses it only in the authorization header. Database tables are currently created automatically at API startup; add versioned migrations before evolving a deployed database.

The lobby broadcaster is in memory, so run one API worker per instance. Multi-worker deployments need shared pub/sub before they can reliably deliver lobby updates.

The frontend demo quiz has automated checks for the 30-question bank, category shuffling, and correct-answer association. Add backend coverage for quiz validation, display-name conflicts, host authorization, and the complete timed game flow as those milestones are implemented.

Run the backend leaderboard and timer tests from `backend/` with `python -m unittest discover -s tests -v`. They cover fixed scoring, tied ranks, final answer review, and automatic movement through the results intervals.
