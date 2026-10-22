# Live Quiz Competition MVP Plan

## Goal

Build and deploy a demo-ready web application where a host creates and runs a timed quiz, participants join anonymously, and standings update live after each question. The MVP targets rooms of up to 50 participants.

## Product scope

### Included

- Hosts create a one-event quiz with a title and single-choice questions, then launch it immediately.
- Each question has a host-configured timer, up to four choices, and one correct answer. A quiz has up to 20 questions.
- Launching creates two separate URLs: a participant join link containing a public join code, and a private, unguessable host control link.
- Participants enter a name and a unique display name for the session, then wait in a lobby until the host starts.
- Participants may join between questions. They score only on questions they have an opportunity to answer.
- Questions advance automatically when their timers expire. Correct answers score a fixed number of points; unanswered questions score zero.
- Correct answers award 100 fixed points; incorrect and unanswered questions award zero. Equal scores share a rank, with tied entries displayed in join order.
- After each question, everyone sees the updated leaderboard during a five-second results interval before the next question starts. Correct answers are revealed after the final question. Final results remain available until the host closes the event.
- During play, hosts see the full live ranking. Participants see the top three and their own rank during each five-second results interval, and see the full ranking plus a per-question review after the quiz.
- Participants can reconnect to their existing entry using a session-scoped reconnect token; submitted answers are preserved.
- A protected super-admin portal allows pre-provisioned admins to find and delete quizzes/events. Event deletion also removes associated participant records, answers, and results.
- Include rate limits and input/room caps, basic structured logging, setup documentation, a deployed demo, core UI/API, a minimal schema, a test strategy, and a short architecture/demo script.

### Excluded from v1

- Participant or host accounts, quiz editing after launch, reusable quiz templates, public quiz directory, paid plans, and host recovery through an account.
- Speed-based scoring, multiple-answer question formats, and manual question-by-question advancement.

## Core user journeys

1. **Create and launch:** Host enters quiz details and questions, validates the quiz, launches it, and receives both the participant URL and private host control URL.
2. **Join and wait:** Participant opens the join URL, enters the required name and unique display name, and enters the waiting room. Duplicate display names are rejected with a prompt to choose another.
3. **Play:** Host starts the event. The current question and server-authoritative timer are broadcast. Participants submit one answer before time expires. The server records answers, closes the question at timeout, updates scores, and broadcasts standings.
4. **Late join and reconnect:** A new participant may join between questions and starts scoring from the next question. A disconnected participant reconnects with their token and resumes the same entry and current room state.
5. **Finish:** After the final question's results interval, the app reveals the full standings and each participant's per-question outcome and correct answer. The host may close the event.
6. **Moderate:** An authenticated super-admin searches or lists events, reviews enough identifying metadata to locate one, and deletes the selected event.

## Architecture and boundaries

- **Frontend:** Vite + React for host, participant, and admin interfaces. Use WebSockets for live room events and reconnect/resync behavior.
- **Quiz API:** Python FastAPI owns quiz/session state, validation, scoring, timers, participant records, reconnect tokens, and WebSocket broadcasts.
- **Data:** Postgres is the source of truth; SQLAlchemy is the Python ORM. Persist enough session state to recover live rooms after an API process restart where feasible.
- **Admin authentication:** Run BetterAuth in a separate TypeScript service for pre-provisioned admin accounts. Define and document the credential/session contract between that service, the admin frontend, and FastAPI; FastAPI must independently enforce authorization on every admin endpoint.
- **Deployment:** Vercel for the frontend; Render for FastAPI, the BetterAuth service, and Postgres, subject to confirming WebSocket support, persistent process behavior, and current plan limits.
- **External integrations:** No third-party quiz or messaging APIs in v1. Hosting and database are the only external runtime services.

## Initial data model

- **Quiz/Event:** ID, title, public join code, private host-control credential hash, lifecycle state, timestamps.
- **Question:** Event ID, order, prompt, time limit, correct choice reference.
- **Choice:** Question ID, order, text.
- **Participant:** Event ID, private name, unique-per-event display name, reconnect-token hash, join time, connection/participation state.
- **Answer:** Participant ID, question ID, selected choice, submission time, correctness, points.
- **Admin identity:** Managed by BetterAuth; admin authorization must be verified by FastAPI.

The server is authoritative for deadlines, accepted answers, session transitions, and scores. Scores are calculated from recorded answers, so no derived score migration is needed. Correct answers are excluded from participant responses until the event is complete. Store host and reconnect secrets as hashes where practical; only show raw secrets when issuing their links. Never place the host credential in participant-facing responses, logs, or analytics.

## Implementation sequence

1. Confirm deployment limits and the BetterAuth-to-FastAPI authentication contract; pin supported framework/library versions from current official documentation.
2. Define schema, migrations, validation rules, quiz lifecycle states, and server-authoritative timer/scoring behavior.
3. Implement quiz creation, host-link issuance, join-code entry, participant identity validation, and the waiting room.
4. Implement WebSocket room updates, timed question progression, answer submission, score calculation, intermediate leaderboards, final reveal, reconnect, and host close.
5. Implement pre-provisioned BetterAuth admin access and admin list/delete operations with server-side authorization.
6. Add rate limits, room/input caps, useful error states, and structured logs.
7. Build the responsive React screens and connect them to the API and WebSocket events.
8. Deploy the public demo, document setup/environment variables, and prepare a short demo script.

## Quality and acceptance criteria

- A host can create a valid quiz, share the join URL, start it, and complete it without manual question advancement.
- Participants can join the lobby, submit one valid answer per question before timeout, see updated standings, and see final answers/results.
- Duplicate display names, invalid quiz content, late/duplicate answer submissions, full rooms, expired/invalid links, and disconnected clients produce defined, understandable outcomes.
- A participant link cannot perform host actions; the private host link can control only its event. Admin APIs reject unauthenticated/non-admin requests.
- Reconnecting with a valid participant token restores the same participant record and preserves prior answers.
- Automated coverage includes the complete happy path and at least one major failure path (such as timeout/disconnect or unauthorized host/admin action).
- A demo deployment supports the stated 50-participant target subject to a basic load check; setup instructions and environment variables are documented.

## Assumptions and open risks

- The 20-question and four-choice caps are defaults; each correct answer has equal fixed points.
- Names and display names are both required. The private name is visible to the host; the leaderboard shows only the display name.
- Timer min/max and rate-limit thresholds still need concrete values during implementation.
- Data remains until host/admin deletion. A public deployment needs a clear privacy notice and a policy for participant names.
- A private host link is a bearer secret: anyone who obtains it can control that event. There is no account-based recovery if the host loses it.
- Anonymous public quiz creation can attract abuse. Rate limiting, validation, and the 50-person cap reduce risk but do not replace monitoring or stronger protections for a larger launch.
- Free-tier hosting may sleep, limit concurrent WebSockets, or constrain persistent workers. Verify provider behavior and budget before relying on it for a live demo.
- The current workspace contains Python learning exercises rather than an existing quiz application, so this plan assumes a new application structure will be introduced separately or the workspace will be reorganized before implementation.
