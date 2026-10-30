# QuizPop Product Plan

## Goal

Evolve QuizPop into a product for learning, teaching, and playing quizzes with friends. Retain live games for up to 50 participants while adding collaborative question setting, reusable quiz libraries, independent study, AI-assisted creation, and organisation learning records. The first education release targets adults, university learners, independent study, and workplace training.

The live quiz foundation and QuizPop visual identity already exist. Account authentication and account-owned hosting are implemented in this checkout. Organisations, reusable libraries, AI, assignments, and cross-game analytics below remain planned work.

## Product scope

### Included

- Hosts create single-choice quizzes with a title and questions, then launch a live event. Extend this foundation with editable drafts and immutable published versions that can be reused across events and learning attempts.
- Each question has a host-configured timer, up to four choices, and one correct answer. A quiz has up to 20 questions.
- Launching creates two separate URLs: a participant join link containing a public join code, and a private, unguessable host control link.
- Participants enter a name and a unique display name for the session, then wait in a lobby until the host starts.
- Participants may join between questions. They score only on questions they have an opportunity to answer.
- Questions advance automatically when their timers expire. Correct answers score a fixed number of points; unanswered questions score zero.
- Correct answers award 100 fixed points; incorrect and unanswered questions award zero. Equal scores share a rank, with tied entries displayed in join order.
- After each question, everyone sees the updated leaderboard during a five-second results interval before the next question starts. Correct answers are revealed after the final question. Final results remain available until the host closes the event.
- During play, hosts see the full live ranking. During each five-second results interval, participants see the top three, their rank movement, and whether their answer was correct and how many points they earned. They see the full ranking plus a per-question review after the quiz.
- Participants can reconnect to their existing entry using a session-scoped reconnect token; submitted answers are preserved.
- A protected super-admin portal allows pre-provisioned admins to find and delete quizzes/events. Event deletion also removes associated participant records, answers, and results.
- Include rate limits and input/room caps, basic structured logging, setup documentation, a deployed demo, core UI/API, a minimal schema, a test strategy, and a short architecture/demo script.
- Google and verified email/password authentication, password recovery, persistent profiles, and account-owned hosting, implemented inside the existing FastAPI backend using FastAPI Users.
- Personal and organisation quiz libraries, subjects/topics, solo practice, formative assignments, and private reusable notes.
- Collaborative social lobbies where the host also plays and every participant contributes the same required number of private questions.
- AI quiz generation from topics, pasted notes, and text-based PDF/DOCX uploads; private per-question explanations and follow-up discussions.
- Multiple organisation memberships, classes/training groups, scoped roles, personal and organisation analytics, separate social statistics, operational monitoring, and auditing.

### Deferred from the first product release

- Children's school accounts, formal grading, proctoring, high-stakes examinations, enterprise SSO, LMS integrations, public quiz directory, and paid plans/credits.
- OCR, scanned/handwritten notes, external URL ingestion, and user-supplied AI keys.
- Editing the frozen question pool of an active game; content changes instead create a new published version for future use.
- Speed-based scoring, multiple-answer question formats, and manual question-by-question advancement.

## Product expansion behavior

### Identity and organisation boundaries

- Require an account to host, save quizzes, use AI, or retain performance history. Allow guest participation in social games; organisation learning requires authenticated membership.
- A user can belong to multiple organisations and have a personal workspace. Make the selected context explicit; personal content and social history remain private from organisations.
- Owners/admins manage membership, groups, shared content, and organisation reporting. Only owners transfer ownership or delete an organisation. Instructors/trainers manage content, assignments, and results for assigned groups. Learners see assigned content and their own results.
- Users can view their own learning history across contexts. Organisation reporting includes only its own learning activity; instructors cannot inspect unassigned groups.
- Organisation membership, invitations, group membership, roles, and instructor assignments belong to QuizPop's application models. The authentication library establishes identity; FastAPI enforces resource permissions.
- Guest results remain session-scoped. Do not infer account identity or claim historical guest results by matching display names.

### Collaborative social games

- The host and invitees all write questions and play. The host sets the common timer and exact question quota for everyone, including themselves. Default to two questions each; allow one to five.
- Contributions remain private to their authors before play. Show readiness and counts; the host cannot inspect, approve, or edit another player's questions.
- Require at least two players and the complete equal quota from everyone before starting. Authors can edit before start. Removing a player before start removes their questions and recalculates readiness.
- Start atomically freezes settings, roster, and contributions, then shuffles question order on the server. Do not admit new players after a collaborative game starts; ordinary host-authored games retain their existing late-join rules.
- Award the same 100 points per correct answer. Incorrect/unanswered answers earn zero. Authors sit out their own questions and cannot earn points on them, including the host. Equal quotas provide equal scoring opportunities; rank by total points with shared ranks for ties.
- Preserve disconnected players and their questions after start. Reconnect restores identity and answers without changing anyone's scoring opportunities.
- Support up to 50 players and a 250-question collaborative pool while retaining the ordinary quiz's 20-question cap.

### Reusable learning and assignments

- Separate editable quiz drafts, immutable published versions, and live sessions/learning attempts. Later edits cannot rewrite historical content, scores, or selected source excerpts.
- Learning questions have a primary subject/topic confirmed by the author. Snapshot classification in published versions; keep legacy unclassified activity out of topic-specific analytics.
- Add untimed solo practice with unlimited attempts and feedback/AI explanations after answering.
- Instructors assign a published version to groups with a deadline and one submitted attempt per learner. Save answers incrementally and support resume before submission/deadline. Submission or deadline freezes the attempt; unanswered questions earn zero.
- Withhold assignment correct answers and AI explanations/discussions until the deadline or explicit instructor closure, even for learners who submit early. Live games unlock these only after the whole game ends.
- Keep solo practice, assignments, live-learning results, and social statistics distinguishable. This release provides formative progress rather than an official gradebook.

### AI generation, notes, and deeper learning

- Generate editable drafts from a topic, pasted notes, or text-based PDF/DOCX files. Include questions, choices, one correct answer, explanations, suggested classification, and supporting excerpts where available. Require creator review before publication.
- Keep original notes/extracted text in a private reusable library until deleted. Organisation sources require authorized content-manager/instructor access. Learners see only excerpts explicitly included in published questions.
- Distinguish topic generation from notes-grounded generation. Validate source references against real excerpts and report insufficient material rather than inventing citations.
- Provide private question-specific explanations and follow-up chat. Authorize each turn against identity, quiz version, reveal state, and source access. Organisation administrators/instructors cannot inspect users' private discussions.
- Use a server-side OpenAI adapter with Responses API Structured Outputs and independent application validation. Keep credentials on the server, set response storage to `store: false`, and manage discussion history in QuizPop. This setting alone is not a zero-retention guarantee.
- Use durable extraction/generation jobs with progress, cancellation, bounded retries, and clear errors. Keep manual authoring available during AI outages. Treat notes as untrusted content, not executable instructions.
- Fund AI through the app with configurable quotas, atomic reservations, token accounting, and an explicitly configured global spending ceiling. Initial daily limits: 10 generations/30 discussion turns per user; organisation requests also consume a pool of 100 generations/300 turns per organisation. Limit generation to 20 questions and a discussion to 20 turns.
- Disable AI cleanly until provider credentials, model ID, and the global ceiling are configured. Provide notes/discussion deletion and explain that deleting originals does not remove excerpts already published in quiz versions.

### Analytics and observability

- Personal learning dashboards show completed attempts, accuracy, unanswered questions, subject/topic breakdowns, and trends, with context/activity filters. Organisation dashboards show assignment completion, group/learner outcomes, topic performance, and question accuracy within authorized scope.
- Define accuracy as correct answers divided by eligible questions, including eligible unanswered questions. Show sample sizes and attempt counts. Base assignment reports on final submissions; label unlimited practice separately. Do not present small-sample accuracy as proven mastery.
- Social statistics show games played, wins/shared wins, scores, and eligible-question accuracy. Exclude authors' own questions from collaborative denominators and all social games from educational performance analytics.
- Compute learning records from persisted versions, attempts, eligibility, and answers. Do not infer persistent identity from anonymous sessions.
- Separately monitor API errors/latency, connections, reconnect failures, timer delays, job failures, AI latency, and token usage. Alert on sustained failures, stalled processing, and spending limits. Exclude credentials, raw notes, and private discussions from telemetry.

## Authentication design

Implementation status: FastAPI Users accounts, Google sign-in and explicit linking, email verification/recovery, opaque database sessions, cookie/CSRF/origin protections, profile screens, logout/all-session revocation, account-owned host controls, and live session rechecks are implemented. Alembic provides the initial schema/legacy upgrade. Deployment still requires a persistent secret, SMTP and Google credentials, same-site HTTPS routing, and PostgreSQL staging validation. Organisation/group permissions remain pending their application models; auth does not imply those roles exist.

### Integration within the existing backend

- Use FastAPI Users as a Python dependency inside the existing FastAPI application. Do not introduce a separate TypeScript authentication service, authentication server, or Redis requirement.
- Use its SQLAlchemy integration for users, linked OAuth identities, and database-backed sessions in the existing PostgreSQL database, managed through application migrations. Accommodate the library's async database integration explicitly without forcing an unrelated rewrite of the existing synchronous quiz routes.
- Support Google sign-in, email/password registration, verified email, password recovery, logout, and session revocation. Keep the React account screens connected directly to authentication routes in the same API.
- Configure verification/recovery email delivery through the backend's email transport. Provider credentials and email configuration remain environment variables; they do not require a separate QuizPop authentication process.
- Use established library password hashing and recovery/verification flows; do not implement custom cryptography. Require proof of account ownership for OAuth account linking; a matching email alone must not silently merge accounts.

### Sessions and authorization

- Use secure, HttpOnly cookies carrying opaque database-backed session tokens. Enforce expiry and server-side revocation on authenticated requests; avoid self-contained long-lived JWT sessions and cross-service JWT/JWKS plumbing.
- Add CSRF protection to state-changing cookie-authenticated requests, including login/linking flows where applicable. Validate OAuth state and redirect destinations. Use appropriate SameSite settings and explicit allowed origins with credentialed requests.
- Prefer a same-origin API deployment or controlled same-site frontend/API domains so browser cookies behave predictably. Use development-only cookie settings for local HTTP; retain secure production defaults.
- Provide FastAPI dependencies for current user and resource permissions. Resolve organisation membership/group access from current database state, not stale client claims or an active-context identifier alone.
- Apply session and permission checks to live subscriptions and host controls as well as HTTP endpoints. Logout/revocation and membership removal must stop protected access; an open connection is not continuing authorization.
- Preserve guest reconnect tokens for their participant/game only. New hosting is account-owned; legacy bearer host links remain limited to existing events.

### Maintenance trade-off

FastAPI Users is in maintenance mode: security and dependency maintenance continue, but new features are not planned. Accept its existing account-management capabilities for this release; pin compatible versions and monitor security updates. Keep organisation, learning, and authorization logic independent so the library can be replaced without redesigning QuizPop's domain.

## Core user journeys

1. **Create and launch:** An authenticated host creates or selects a published quiz, validates it, and launches a live event with a participant URL and account-authorized host controls. Preserve private host-control links for legacy events.
2. **Join and wait:** Participant opens the join URL, enters the required name and unique display name, and enters the waiting room. Duplicate display names are rejected with a prompt to choose another.
3. **Play:** Host starts the event. The current question and server-authoritative timer are broadcast. Participants submit one answer before time expires. The server records answers, closes the question at timeout, updates scores, and broadcasts standings.
4. **Late join and reconnect:** A new participant may join between questions and starts scoring from the next question. A disconnected participant reconnects with their token and resumes the same entry and current room state.
5. **Finish:** After the final question's results interval, the app reveals the full standings and each participant's per-question outcome and correct answer. The host may close the event.
6. **Moderate:** An authenticated super-admin searches or lists events, reviews enough identifying metadata to locate one, and performs authorized, audited deletion.
7. **Contribute and play:** A signed-in host invites friends, sets the common timer and contribution quota, submits their own questions, waits for equal contributions, and starts a game in which everyone plays except on their own questions.
8. **Learn and assign:** An author publishes a classified quiz version, a learner practices or completes a group assignment, and authorized users review scoped performance records.
9. **Generate and explore:** A signed-in user supplies a topic or notes, reviews an AI-generated draft, publishes it, and later explores eligible questions through private AI discussion.

## Architecture and boundaries

- **Frontend:** Retain Vite + React, expanding into account, workspace, library/editor, live-room, practice/assignment, analytics, and AI source/discussion modules. Preserve QuizPop's responsive light/dark visual identity.
- **Quiz API:** Python FastAPI owns quiz/session state, validation, scoring, timers, participant records, reconnect tokens, and WebSocket broadcasts.
- **Data:** PostgreSQL is the product deployment source of truth; retain SQLAlchemy and introduce Alembic migrations instead of ad hoc startup schema alterations. Persist versions, attempts, ownership, and session state explicitly.
- **Authentication:** FastAPI Users runs within the existing Python API, using SQLAlchemy-backed users/OAuth identities/database sessions and secure cookies. QuizPop owns organisation/group permissions. No separate auth service or cross-service JWT contract.
- **Sources and jobs:** Use private object storage and a worker consuming durable PostgreSQL-backed jobs for document extraction and AI generation. These product processing responsibilities are separate from authentication, which stays entirely in the API.
- **Deployment:** Retain the Vercel frontend/Render FastAPI and PostgreSQL direction, with the planned processing worker and private object storage as needed. Verify cookie/origin routing, WebSockets, email delivery, worker behavior, and service capacity before rollout. No additional authentication deployment.
- **External integrations:** Google OAuth, verification/recovery email delivery, OpenAI, and private file storage supplement hosting/database services. Keep runtime credentials on the backend.

## Initial data model

- **Quiz/Event:** Preserve existing fields for legacy events. Add account ownership, personal/organisation scope, published-version references, event mode, and collaborative settings for new events.
- **Question:** Event ID, order, prompt, time limit, correct choice reference.
- **Choice:** Question ID, order, text.
- **Participant:** Event ID, private name, unique-per-event display name, reconnect-token hash, join time, connection/participation state.
- **Answer:** Participant ID, question ID, selected choice, submission time, correctness, points.
- **User and OAuth identity:** FastAPI Users-compatible persistent account and linked-provider records, including verification/active status. Grant platform-admin privileges through controlled server-side provisioning, never public registration input.
- **Auth session:** Database-backed session token, account reference, and expiration; support explicit logout/revocation. Keep browser session cookies HttpOnly and secure in production.
- **Organisation domain:** Organisations, invitations, memberships/roles, groups, group membership, and instructor assignments owned by QuizPop, independent of the auth library.
- **Learning content:** Quiz drafts, published quiz/question versions, subject/topic classification, and private sources/selected excerpts.
- **Participation and learning:** Optional account linkage for participants, contribution authorship/readiness/eligibility, group assignments, resumable attempts, and submitted answers.
- **AI and operations:** Extraction/generation jobs, private discussions, usage reservations/records, and application audit events.

The server is authoritative for deadlines, accepted answers, session transitions, and scores. Scores are calculated from recorded answers, so no derived score migration is needed. Correct answers are excluded from participant responses until the event is complete. Store host and reconnect secrets as hashes where practical; only show raw secrets when issuing their links. Never place the host credential in participant-facing responses, logs, or analytics.

## Implementation sequence

1. Repair known backend test failures/dependencies, establish reproducible checks and Alembic migrations, and separate domain modules without changing existing game behavior.
2. Integrate FastAPI Users into the current backend; add Google/email authentication, verification/recovery, database-backed cookie sessions, CSRF protection, safe account linking, session revocation, and account screens.
3. Add personal/organisation contexts, invitations, groups, scoped roles, resource authorization, and auditing using QuizPop-owned models.
4. Add reusable published quiz versions, subjects/topics, solo practice, resumable assignments, and basic personal/group learning analytics.
5. Implement collaborative equal-quota lobbies, host-as-player permissions, frozen question pools, author exclusions, reconnect, and separate social statistics.
6. Add private notes, durable extraction/generation jobs, reviewed AI drafts, private question discussions, quotas, and usage accounting.
7. Complete operational monitoring, rate limits, administration, permission/migration tests, accessibility, and 50-player load checks.
8. Deploy verified components, document frontend/API/worker and email/storage/AI configuration, and update setup and design documentation. There is no separate authentication process to run.

Each stage needs a usable end-to-end flow and passing relevant checks before dependent stages proceed.

## Quality and acceptance criteria

- A host can create a valid quiz, share the join URL, start it, and complete it without manual question advancement.
- Participants can join the lobby, submit one valid answer per question before timeout, see updated standings, and see final answers/results.
- Duplicate display names, invalid quiz content, late/duplicate answer submissions, full rooms, expired/invalid links, and disconnected clients produce defined, understandable outcomes.
- A participant link cannot perform host actions; the private host link can control only its event. Admin APIs reject unauthenticated/non-admin requests.
- Reconnecting with a valid participant token restores the same participant record and preserves prior answers.
- Automated coverage includes the complete happy path and at least one major failure path (such as timeout/disconnect or unauthorized host/admin action).
- A demo deployment supports the stated 50-participant target subject to a basic load check; setup instructions and environment variables are documented.
- Authentication tests cover registration, verification, password recovery, Google callbacks, safe account linking, expired sessions, logout/revocation, cookie attributes, CSRF rejection, and untrusted origins/redirects.
- Cross-organisation and role tests cover nested content, group results, downloads, analytics, AI sources/discussions, jobs, and live subscriptions. Membership revocation removes access.
- Collaborative tests cover hidden submissions even from the host, equal quotas, incomplete readiness, player removal, simultaneous start, author exclusions, ties, and reconnect.
- Learning tests cover immutable versions, resumable attempts, assignment deadlines, duplicate submission, reveal timing, sample sizes, and analytics eligibility denominators.
- AI tests cover invalid drafts, unsupported/empty documents, document instructions, false citations, cross-tenant retrieval, timeouts, refusal, cancellation, retries, and concurrent quota reservations.
- Exercise complete social and learning journeys in both themes on desktop, tablet, and mobile, including keyboard access and reduced motion.

## Migration, auditing, and validation

- Preserve existing events, join codes, hashed host credentials, reconnect tokens, answers, and standings. Do not invent account ownership, topic labels, or account linkage for anonymous history.
- Use additive migrations and verified backfills for published-version/session references; preserve legacy authorization only for existing events. New hosting requires account ownership.
- Back up deployed data and rehearse migrations on a copy. Preserve saved theme preferences and participant-session compatibility.
- Audit membership/permission changes, publishing, assignments, lobby settings, removals, exports, and deletion with actor, scope, target, timestamp, outcome, and correlation ID. Do not record credentials or raw private content.
- Validate inputs, choices, room/contribution limits, upload type/size, safe rendered content, extraction bounds, and rate limits on the server. Make start, answers, assignment submission, and quota usage atomic under retries/concurrency.

## Assumptions and open risks

- Ordinary quizzes retain the 20-question/four-choice limits; collaborative quotas permit at most 250 questions. Each correct eligible answer has equal fixed points.
- Names and display names are both required. The private name is visible to the host; the leaderboard shows only the display name.
- Retain server timer bounds of 5–300 seconds and five-second live results intervals. Solo practice is untimed; assignments have explicit deadlines and one submission.
- Data remains until host/admin deletion. A public deployment needs a clear privacy notice and a policy for participant names.
- Legacy private host links remain bearer secrets with no inferred account ownership. New events use account-based host access; social guests still receive only participant-scoped reconnect access.
- FastAPI Users is accepted in maintenance mode for existing capabilities. Track security/dependency updates and keep domain logic separate to avoid depending on future library features.
- Initial document limits are 10 MiB and 100,000 extracted characters. Reject excess content explicitly and bound processing/decompression rather than silently truncate it.
- Notes/discussions remain private until deleted; published excerpts and versioned learning records have separate lifecycles that the interface must explain.
- Authentication, AI, joining, and submissions need rate limits and monitoring. The 50-player cap alone is not abuse protection.
- Free-tier hosting may sleep, limit concurrent WebSockets, or constrain persistent workers. Verify provider behavior and budget before relying on it for a live demo.
- Current quiz code is the starting point. Expand it through verified migrations and domain modules rather than introducing another authentication service or replacing the frontend/backend stack.

## Authentication references

- [FastAPI Users features and maintenance status](https://github.com/fastapi-users/fastapi-users)
- [Authentication transports and strategies](https://fastapi-users.github.io/fastapi-users/latest/configuration/authentication/)
- [Cookie transport](https://fastapi-users.github.io/fastapi-users/latest/configuration/authentication/transports/cookie/)
