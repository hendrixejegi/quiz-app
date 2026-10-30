
# QuizPop Product Plan

## Goal and audience

Evolve QuizPop into a product for learning, teaching, and playing quizzes with friends. Combine live competition, collaborative question setting, independent study, AI-assisted quiz creation, and organisation learning records without making casual games difficult to join.

The first education release targets adults, university learners, independent study, and workplace training. Retain the QuizPop identity and comic-inspired visual system from `DESIGN.md`. This plan replaces the original anonymous live-quiz MVP scope; features below are planned unless explicitly identified as implemented.

## Current implementation

- React/Vite frontend and FastAPI/SQLAlchemy backend; SQLite for local development and support for a PostgreSQL connection.
- Single-event creation with 1–20 single-choice questions, 2–4 choices, and server-validated timers of 5–300 seconds.
- Anonymous participation, unique display names, public join links, separate private host links, and participant reconnect tokens.
- Server-authoritative deadlines, automatic progression, 100 points per correct answer, shared ranks for ties, five-second intermediate results, and final answer review.
- Authenticated host WebSocket updates and participant polling; one API worker is currently required for in-memory broadcasting.
- QuizPop branding, responsive light/dark interfaces, and demo quizzes.

Persistent accounts, reusable quiz content, organisations, AI, and cross-game learning analytics are not implemented. Repair the known backend test failures and test-tooling gaps before expanding the domain.

## Product scope

### Included

- Google and verified email/password authentication, password recovery, persistent profiles, and account-owned hosting.
- Guest participation in social games; authenticated membership for organisation learning.
- Personal and organisation quiz libraries, editable drafts, immutable published versions, and subjects/topics.
- Ordinary hosted live quizzes, collaborative social games, solo practice, and formative group assignments.
- AI generation from topics, pasted notes, and text-based PDF/DOCX files, with creator review before publication.
- Private reusable notes and private AI explanations/follow-up discussions for individual questions.
- Multiple organisation memberships, classes/training groups, role-based access, and personal/organisation context switching.
- Learning analytics for individuals and organisations, separate social statistics, operational monitoring, AI usage accounting, and auditing.
- Server-side authorization, stronger validation, rate limits, migrations, and release verification.

### Deferred

Children's school accounts, formal grading, proctoring, high-stakes examinations, payments, paid credits, enterprise SSO, user-supplied AI keys, OCR/scanned/handwritten notes, external URL ingestion, public quiz marketplaces, LMS integrations, adaptive learning, additional question formats, and speed-based scoring.

## Accounts, organisations, and access

- Require an account to host, save quizzes, use AI, or retain cross-game history. Guests can play social games without registering.
- A user can belong to multiple organisations and retain a personal workspace. Make the active context explicit.
- Personal quizzes, notes, and social history stay private. Organisation access does not grant access to personal activity.
- Users can review their own learning history across contexts; organisation reporting includes only that organisation's activity.
- Keep guest results session-scoped. Never infer account identity from display names or silently attach historical guest records to accounts.

| Role | Permissions |
| --- | --- |
| Owner | Organisation settings, ownership, membership, groups, shared content, and organisation reporting |
| Admin | Membership, groups, shared content, and organisation reporting; no ownership transfer or organisation deletion |
| Instructor / trainer | Author quizzes, assign work, and inspect learner results for assigned groups |
| Learner / member | Access assigned content, permitted practice, and their own results |
| Platform administrator | Explicitly authorized and audited operational administration; no automatic access to private AI discussion contents |

Enforce resource ownership, active membership, role, and group assignment on the server. Membership revocation removes access to organisation APIs, files, AI sources, and live subscriptions.

## Quiz experiences

### Ordinary host-authored live quizzes

- Preserve current server-controlled timers, automatic progression, fixed scoring, and final-answer reveal rules.
- Allow an authenticated owner to launch the same published quiz into separate live sessions.
- Retain the 50-player target and ordinary late joining: someone joining during a question is eligible from the next question.
- New host controls use account authorization. Preserve legacy bearer host links for their existing events only.
- Show standings during each five-second results interval; reveal correct answers and full review after the final interval.

### Collaborative social lobbies

The host and invitees are all players and question authors. Hosting grants lobby-management permissions, not access to other players' private submissions.

- The host sets the common timer and required number of questions for every participant, including themselves. Default to two questions each; allow one to five.
- Require everyone to submit exactly the same quota of valid questions. Show contribution counts and readiness without exposing question text or correct answers.
- Authors can edit their own questions before start. The host cannot inspect, approve, or edit other players' questions.
- Require at least two participants. Before start, the host can remove a participant, which removes their questions and recalculates readiness.
- Starting atomically freezes settings, roster, and contributions, then shuffles questions on the server. No new players after start.
- Award 100 points per correct answer and zero for incorrect/unanswered answers. Authors, including the host, cannot answer or earn points on their own questions.
- Equal quotas provide equal scoring opportunities. Rank by total points; tied scores share a rank, with stable join-order display.
- Preserve disconnected players and their questions after start. Reconnect restores identity and answers; disconnection must not change others' scoring opportunities.
- Support up to 50 players and a 250-question contributed pool without raising the ordinary quiz's 20-question limit.
- Keep collaborative games in social statistics, even if questions have subject/topic tags.

### Solo practice and formative assignments

- Solo practice is initially untimed, with unlimited attempts. Unlock feedback and AI explanations after answering each question.
- Instructors assign a published quiz version to one or more groups with an explicit deadline. Allow one submitted attempt per learner, incremental answer saving, and resume before submission/deadline.
- Submission or deadline freezes the attempt; unanswered questions earn zero. Retries cannot create duplicate submissions or scores.
- Withhold assignment correct answers, explanations, and AI discussions until the deadline or explicit instructor closure, including from learners who submitted early.
- Label solo practice, assignments, and live-learning records separately. This is formative progress tracking, not an official gradebook.

## Quiz libraries and classification

- Separate reusable content from live events and attempts. Drafts are editable; publishing creates an immutable quiz/question version.
- Sessions, assignments, and practice attempts reference the version used. Later edits create new versions and cannot rewrite historical scores or content.
- Classify learning questions by a primary subject and topic within the owning workspace. Permit unclassified drafts, but require classification before publishing learning quizzes.
- Snapshot tags and selected source excerpts in published versions. Draft reclassification must not silently change historical analytics.
- AI can suggest tags, but the creator must confirm them. Keep unclassified legacy activity out of topic-specific progress.

## AI generation and question discussions

### Generation and private notes

- Accept a topic, pasted text, or text-based PDF/DOCX upload. Reject unsupported, encrypted, unreadable, and text-empty files clearly; do not silently invent document content.
- Retain original documents and extracted text in a private reusable source library until deleted. Personal sources belong to their owner; organisation sources require authorized content-manager/instructor access.
- Generate editable drafts with prompts, choices, one correct choice, explanations, suggested classification, and source excerpts where available.
- Require review before publishing. Validate question structure, correct-choice references, caps, and source identifiers independently of model output formatting.
- Distinguish topic-based generation from notes-grounded generation. Source references must resolve to real excerpts; report insufficient material rather than fabricate citations.
- Learners receive only excerpts explicitly included in published questions, not unrestricted access to complete notes.

### Deeper learning

- Offer private question-specific explanations, discussion of alternative answers, and follow-up chat.
- Unlock after answering in solo practice, after the live game ends, and after an assignment closes. AI requires sign-in.
- Check user identity, quiz version, answer-reveal state, and source permission on every turn. Teachers and organisation administrators cannot inspect learners' private discussions.
- Keep discussion history in QuizPop with deletion controls. Explain that deleting an original source does not remove excerpts already published into quiz versions.

### Integration, jobs, and limits

- Use OpenAI as the first provider behind a server-side adapter. Use the Responses API and Structured Outputs for generation, with independent server validation and creator review for factual quality.
- Keep credentials on the server. Set provider responses to `store: false` and manage discussion state in QuizPop; do not describe that setting alone as zero provider retention.
- Run extraction and quiz generation as durable background jobs with progress, cancellation, bounded retries, and clear failure states. Manual quiz creation remains available during AI outages.
- Treat documents as untrusted source material rather than instructions. Do not execute embedded directions or allow cross-user/cross-organisation retrieval.
- Fund AI through the app with configurable quotas, atomic reservations, token accounting, and a global spending ceiling. No billing system initially.
- Initial daily allowances: 10 generations and 30 discussion turns per user. Organisation activity also consumes an organisation pool of 100 generations and 300 turns daily. Limit a generation to 20 questions and a discussion to 20 turns.
- Require explicit deployment configuration for model ID, provider credentials, and the global ceiling. Disable AI cleanly when unconfigured. Release unused reservations on failure/cancellation while retaining actual provider usage in cost accounting.

## Analytics, metrics, and observability

### Learning analytics

- Personal profiles show completed attempts, accuracy, unanswered questions, subject/topic breakdowns, and trends. Users can filter their own records by context and activity type.
- Organisation profiles show assignment completion, group/learner outcomes, subject/topic performance, and question accuracy. Instructors see assigned groups; owners/admins see their organisation.
- Define accuracy as correct answers divided by eligible questions, including eligible unanswered questions. Display question/attempt counts and sample sizes alongside percentages.
- Use final assignment submissions for assignment reporting and distinguish solo-practice attempts so unlimited retries do not distort assignment outcomes.
- Compute analytics from persisted attempts, questions, eligibility, and answers. Do not equate performance on small or differently composed quizzes with established mastery.

### Social statistics

- Show signed-in users games played, wins/shared wins, scores, and accuracy on eligible questions.
- Exclude an author's own questions from collaborative accuracy denominators. Do not mix social games with learning progress or organisation learning reports.

### Operational monitoring

- Track API errors/latency, live connections, reconnect failures, timer delays, extraction/generation failures, AI latency, and token usage.
- Correlate requests/jobs by identifiers and ownership scope without logging credentials, raw notes, private discussion contents, or unnecessary participant identifiers.
- Alert on sustained failures, stalled timer/job processing, and AI spending limits. Infrastructure telemetry is separate from learner performance dashboards.

## Architecture and domain changes

- **Frontend:** retain React/Vite and the QuizPop visual system. Split the large application component into authentication, workspaces, libraries/editing, live rooms, practice/assignments, analytics, and AI source/discussion modules.
- **Application API:** retain FastAPI/SQLAlchemy as authority for content, sessions, scoring, attempts, assignment eligibility, authorization, and AI operations.
- **Authentication:** introduce the planned Better Auth TypeScript service for Google and email/password. Use organisation/membership/invitation/team capabilities; teams represent classes/training groups, with instructor-to-group assignments owned by FastAPI.
- **Auth contract:** obtain short-lived JWKS-verifiable API tokens through the browser session. FastAPI checks signature, issuer, audience, expiry, active session, and current membership/permissions. Keep API tokens out of persistent browser storage and avoid independently editable duplicate membership stores.
- **Database:** use PostgreSQL for product deployment and Alembic migrations for application tables. Give authentication tables separate migration ownership; replace ad hoc startup schema alterations after establishing a baseline.
- **Sources/jobs:** private object storage for originals, database-backed extracted sources, and a separate worker consuming durable PostgreSQL-backed jobs. Scope stored objects and jobs to their user/organisation.
- **Realtime:** extend current contracts with collaborative readiness and authenticated subscriptions. Keep one timer/broadcast authority initially; do not run independent in-memory broadcasters across API workers.
- **Deployment:** retain the Vercel/Render direction, verifying WebSocket, worker, object-storage, database, email, and authentication-origin configuration before rollout. Size services from measured load rather than assumed free-tier capacity.

### Domain additions and interfaces

Add persistent profiles linked to auth identities; group instructor assignments; owned quiz drafts and published versions; subjects/topics; reusable sources/excerpts; account-linked or guest participants; collaborative settings/contributions/authorship; assignments/attempts/answers; AI jobs/discussions/usage; and application audit records.

Add authenticated interfaces for context switching, libraries/publishing, groups/assignments, collaborative submissions/start, practice attempts, sources/jobs, question discussions, and scoped analytics. Preserve existing join links and participant-state contracts. Every interface must enforce ownership and reveal policy independently of frontend visibility.

## Authorization, auditing, and validation

- A client-supplied organisation ID selects context but never proves access. Check ownership, active membership, role, and assigned group on the server.
- Apply scoping to database reads/writes, nested resources, downloads, caches, jobs, AI retrieval, and realtime subscriptions.
- Audit membership/permission changes, publishing, assignments, lobby settings, participant removal, exports, and deletion. Record actor, scope, target, time, outcome, and correlation ID without secrets or document/discussion contents.
- Validate input/room caps, correct-choice references, unique submissions, upload type/size, bounded extraction, safe rendered text, and rate limits for sensitive auth flows, joining, answering, and AI.
- Make question-pool freeze, start, answer recording, assignment submission, and quota reservations atomic under concurrent requests and retries.
- Provide deletion for notes/discussions and explicit confirmation for destructive organisation/content actions. Explain retained published excerpts and versioned learning records before deletion.

## Implementation sequence

1. **Reliable foundation:** repair existing backend tests/dependencies, establish reproducible checks, add migrations and a schema baseline, and separate frontend/API modules without changing current quiz behavior.
2. **Identity and tenancy:** authentication, profiles, personal/organisation contexts, organisations, groups, invitations, scoped roles, session revocation, and auditing.
3. **Reusable learning:** draft/published versions, subject/topic tagging, solo practice, resumable assignments, and basic personal/group analytics.
4. **Collaborative games:** private equal-quota submissions, host-as-player controls, frozen rosters, author exclusions, reconnect, and separate social statistics.
5. **AI learning tools:** private source libraries, extraction/generation jobs, reviewed drafts, private discussions, quotas, and usage reporting.
6. **Release hardening:** monitoring/alerts, authorization/migration checks, accessibility, load checks, deployment documentation, and refreshed `README.md`/`DESIGN.md` guidance.

Each stage must have a usable end-to-end flow and passing relevant checks before dependent stages proceed. Do not carry the known unreliable test baseline into the expansion.

## Migration and compatibility

- Preserve existing events, join codes, hashed host credentials, participant reconnect tokens, answers, and standings. Do not fabricate account ownership or infer identity from names.
- Legacy host credentials remain valid only for their existing events; new hosting requires authenticated ownership.
- Keep legacy questions unclassified unless explicitly migrated by an authorized owner. Exclude unlinked historical events from personal learning analytics.
- Use additive migrations and an explicit version/session-reference backfill before requiring new fields for new records. Keep legacy authorization paths isolated.
- Back up deployed data, rehearse migrations on a copy, and gate new flows until migration and permission checks pass. Preserve theme preference and participant session-storage compatibility.

## Acceptance criteria and testing

- Accounts support sign-in, verification where needed, recovery, context switching, and revocation. Cross-organisation tests cover guessed IDs, nested resources, files, analytics, AI, jobs, and live subscriptions.
- An instructor can publish, assign, and inspect permitted group results. Learners can resume and submit once; answer review and discussions stay locked until assignment closure.
- Published versions preserve historical questions, scores, excerpts, and classification. Analytics show denominators and handle empty data, ties, and small samples honestly.
- Collaborative tests cover secrecy even from the host, exact equal quotas, invalid contributions, removal, incomplete readiness, concurrent start, author exclusions, disconnect, and reconnect.
- AI tests cover invalid/incorrect drafts, unsupported/empty files, document instructions, invalid citations, cross-tenant retrieval, refusals, timeouts, retries, cancellations, and concurrent quota use. Use mocks for routine tests and a bounded configured provider smoke test before release.
- Test practice, assignment deadlines, duplicate submission, unattempted assignments, and zero eligible questions. Keep social, practice, and assignment reports distinguishable.
- Verify host-to-results, library-to-assignment, notes-to-reviewed-quiz, and discussion journeys in both themes at desktop/tablet/mobile sizes, including keyboard access, long content, and reduced motion.
- Load-check the 50-player target, collaborative readiness, live transitions, reconnects, and analytics queries. Document the supported worker topology.
- Document frontend/API/auth/worker commands, environment variables, migrations, provider setup, quotas, object storage, email, monitoring, and recovery.

## Initial defaults and constraints

- Single choice, 2–4 answers, fixed 100-point correct answers, no speed bonus, and zero for incorrect/unanswered questions.
- Up to 50 participants; ordinary quizzes up to 20 questions; collaborative quotas of 1–5 per player, default two, with at most 250 questions.
- Server timers stay within 5–300 seconds, with five-second live results intervals. Solo practice is untimed; assignments have a deadline and one submission.
- Document uploads: 10 MiB and 100,000 extracted characters initially. Reject over-limit content explicitly rather than silently truncating; bound extraction time and decompression.
- AI allowances are configurable deployment defaults, not paid entitlements. Require explicit provider/model/spending configuration while preserving manual quiz features.
- Notes and private discussions remain until deleted. Published excerpts and versioned learning records have separate lifecycles that the interface must explain.
- This release supports formative adult learning. Formal assessment and children's school deployments need separate product planning.

## Technical references

- [Better Auth organisations, memberships, and teams](https://better-auth.com/docs/plugins/organization)
- [Better Auth JWT/JWKS for external services](https://better-auth.com/docs/plugins/jwt)
- [Alembic migrations](https://alembic.sqlalchemy.org/en/latest/tutorial.html)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI conversation state and response storage](https://developers.openai.com/api/docs/guides/conversation-state)
