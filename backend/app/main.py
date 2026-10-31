import hashlib
import asyncio
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Request, Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import SessionLocal, get_db
from .models import Choice, Event, Participant, ParticipantAnswer, Question, utc_datetime
from .schemas import AnswerSubmit, ParticipantJoin, QuizCreate
from .auth import router as auth_router, current_user, optional_user, websocket_user
from .library import router as library_router
from .event_service import build_event, event_created_payload

POINTS_PER_CORRECT_ANSWER = 100
RESULTS_INTERVAL_SECONDS = 5


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Older versions could persist an active state but had no timer fields.
    with SessionLocal() as db:
        legacy_active_events = db.scalars(select(Event.id).where(
            Event.state == "active",
            Event.current_question_position.is_(None),
        )).all()
        for event_id in legacy_active_events:
            event = locked_event(db, event_id)
            if event is None or event.state != "active" or event.current_question_position is not None:
                continue
            event.current_question_position = 0
            event.timer_deadline = datetime.now(timezone.utc) + timedelta(seconds=event.questions[0].time_limit_seconds)
            db.commit()
    timer_task = asyncio.create_task(timer_worker())
    yield
    timer_task.cancel()
    try:
        await timer_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="QuizPop API", version="0.1.0", lifespan=lifespan)
frontend_origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)

app.include_router(auth_router)
app.include_router(library_router)

@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        cookie = request.cookies.get("quizpop_csrf", "")
        supplied = request.headers.get("x-csrf-token", "")
        if origin not in frontend_origins or not cookie or not secrets.compare_digest(cookie, supplied):
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Invalid request origin or CSRF token. Refresh and try again."}, status_code=403)
    oauth_authorize = request.url.path.endswith('/authorize') and request.url.path.startswith('/api/auth/')
    oauth_callback = request.url.path.endswith('/callback') and request.url.path.startswith('/api/auth/')
    from urllib.parse import urlsplit
    referer = urlsplit(request.headers.get('referer', ''))
    oauth_origin = request.headers.get('origin') or (f'{referer.scheme}://{referer.netloc}' if referer.netloc else '')
    if oauth_authorize and oauth_origin not in frontend_origins:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Invalid OAuth origin'}, status_code=403)
    if oauth_callback:
        expected = request.cookies.get('quizpop_oauth_state', '')
        if not expected or not secrets.compare_digest(expected, request.query_params.get('state', '')):
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'Invalid OAuth browser state'}, status_code=403)
    response = await call_next(request)
    if oauth_authorize and response.status_code == 200:
        import json
        from urllib.parse import urlparse, parse_qs
        from fastapi.responses import JSONResponse
        body = b''.join([chunk async for chunk in response.body_iterator])
        data = json.loads(body)
        state_token = parse_qs(urlparse(data['authorization_url']).query)['state'][0]
        response = JSONResponse(data)
        from .auth import SECURE
        response.set_cookie('quizpop_oauth_state', state_token, secure=SECURE, httponly=True, samesite='lax', max_age=600)
    if oauth_callback and response.status_code >= 400:
        from fastapi.responses import RedirectResponse
        from .auth import FRONTEND
        response = RedirectResponse(FRONTEND + '/account/login?error=google', status_code=303)
        response.delete_cookie('quizpop_oauth_state')
    if oauth_callback and response.status_code < 300:
        from fastapi.responses import RedirectResponse
        from .auth import FRONTEND
        redirected = RedirectResponse(FRONTEND + '/account/profile', status_code=303)
        for name, value in response.raw_headers:
            if name == b'set-cookie':
                redirected.raw_headers.append((name, value))
        redirected.delete_cookie('quizpop_oauth_state')
        response = redirected
    if request.url.path.startswith('/api/auth'):
        response.headers['Cache-Control'] = 'no-store'
    return response


def authorize_host(event, authorization, user):
    if event is None:
        raise HTTPException(404, "Quiz not found")
    if event.owner_id:
        if user is None or str(user.id) != event.owner_id:
            raise HTTPException(403, "This quiz belongs to another account. Sign in as its owner.")
    elif not authorization or not authorization.startswith("Bearer ") or not secrets.compare_digest(token_hash(authorization[7:].strip()), event.host_token_hash):
        raise HTTPException(403, "Invalid legacy host link")



def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def lookup_event(db: Session, join_code: str) -> Event:
    event = db.scalar(select(Event).where(Event.join_code == join_code.upper()))
    if event is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return event


def question_payload(question: Question) -> dict:
    return {
        "position": question.position,
        "prompt": question.prompt,
        "choices": [choice.text for choice in question.choices],
        "time_limit_seconds": question.time_limit_seconds,
    }


def question_started_at(event: Event, question: Question) -> datetime:
    pause = RESULTS_INTERVAL_SECONDS if event.state == "results" else 0
    return utc_datetime(event.timer_deadline) - timedelta(seconds=question.time_limit_seconds + pause)


def locked_event(db: Session, event_id: str) -> Event | None:
    # Never flush a stale timer object's state before acquiring the row lock.
    with db.no_autoflush:
        return db.scalar(select(Event).where(Event.id == event_id).with_for_update()
                         .execution_options(populate_existing=True))


def can_answer_question(event: Event, participant: Participant, question: Question) -> bool:
    return utc_datetime(participant.joined_at) <= question_started_at(event, question)


def leaderboard_payload(db: Session, event: Event, before_question: Question | None = None) -> list[dict]:
    participants = db.scalars(select(Participant).where(Participant.event_id == event.id)).all()
    answer_query = (
        select(ParticipantAnswer.participant_id, ParticipantAnswer.question_id, ParticipantAnswer.choice_index)
        .join(Question, Question.id == ParticipantAnswer.question_id)
        .where(Question.event_id == event.id)
    )
    if before_question is not None:
        participants = [p for p in participants if utc_datetime(p.joined_at) <= question_started_at(event, before_question)]
        answer_query = answer_query.where(Question.position < before_question.position)
    answers = db.execute(answer_query).all()
    questions = {question.id: question for question in event.questions}
    totals = {participant.id: 0 for participant in participants}
    for participant_id, question_id, choice_index in answers:
        if questions[question_id].correct_choice_index == choice_index:
            totals[participant_id] += POINTS_PER_CORRECT_ANSWER
    participants.sort(key=lambda participant: (-totals[participant.id], utc_datetime(participant.joined_at), participant.id))
    ranking = []
    previous_points = None
    rank = 0
    for index, participant in enumerate(participants, start=1):
        points = totals[participant.id]
        if points != previous_points:
            rank = index
            previous_points = points
        ranking.append({"rank": rank, "display_name": participant.display_name, "points": points})
    return ranking


def question_results_feedback(
    db: Session,
    event: Event,
    participant: Participant,
    question: Question,
    answer: ParticipantAnswer | None,
    current_rank: int,
) -> dict:
    eligible = can_answer_question(event, participant, question)
    if not eligible:
        outcome = "not_eligible"
        points_awarded = 0
        rank_before = None
        rank_change: int | str = "new"
    else:
        correct = answer is not None and answer.choice_index == question.correct_choice_index
        outcome = "correct" if correct else "incorrect" if answer is not None else "unanswered"
        points_awarded = POINTS_PER_CORRECT_ANSWER if correct else 0
        previous_ranking = leaderboard_payload(db, event, before_question=question)
        previous_entry = next((row for row in previous_ranking if row["display_name"] == participant.display_name), None)
        rank_before = previous_entry["rank"] if previous_entry else None
        rank_change = "new" if rank_before is None else rank_before - current_rank
    return {
        "outcome": outcome,
        "points_awarded": points_awarded,
        "rank_before": rank_before,
        "rank_change": rank_change,
    }


def participant_review(db: Session, event: Event, participant: Participant) -> list[dict]:
    answers = {answer.question_id: answer.choice_index for answer in db.scalars(
        select(ParticipantAnswer).where(ParticipantAnswer.participant_id == participant.id)
    ).all()}
    review = []
    for question in event.questions:
        choice_index = answers.get(question.id)
        correct = choice_index == question.correct_choice_index
        review.append({
            "position": question.position,
            "prompt": question.prompt,
            "selected_answer": question.choices[choice_index].text if choice_index is not None else None,
            "correct_answer": question.choices[question.correct_choice_index].text,
            "outcome": "correct" if correct else "incorrect" if choice_index is not None else "unanswered",
        })
    return review


def advance_expired_event(db: Session, event: Event, now: datetime | None = None) -> bool:
    event = locked_event(db, event.id)
    if event is None or event.state not in {"active", "results"} or event.timer_deadline is None:
        return False
    now = utc_datetime(now or datetime.now(timezone.utc))
    changed = False
    while event.state in {"active", "results"} and event.timer_deadline is not None and utc_datetime(event.timer_deadline) <= now:
        expired_deadline = utc_datetime(event.timer_deadline)
        changed = True
        if event.state == "active":
            event.state = "results"
            event.timer_deadline = expired_deadline + timedelta(seconds=RESULTS_INTERVAL_SECONDS)
        else:
            next_position = (event.current_question_position or 0) + 1
            if next_position >= len(event.questions):
                event.state = "completed"
                event.current_question_position = None
                event.timer_deadline = None
            else:
                event.state = "active"
                event.current_question_position = next_position
                event.timer_deadline = expired_deadline + timedelta(seconds=event.questions[next_position].time_limit_seconds)
    if changed:
        db.commit()
    return changed


def advance_expired_events():
    # PostgreSQL lock waits must not block request completion on the event loop.
    # Each session belongs entirely to this worker thread.
    with SessionLocal() as db:
        ids = db.scalars(select(Event.id).where(Event.state.in_(["active", "results"]))).all()
    for event_id in ids:
        with SessionLocal() as db:
            event = locked_event(db, event_id)
            if event is not None:
                advance_expired_event(db, event)


async def timer_worker():
    while True:
        await asyncio.to_thread(advance_expired_events)
        await asyncio.sleep(0.2)


def participant_for_request(db: Session, event: Event, authorization: str | None) -> Participant:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Participant link required")
    token = authorization.removeprefix("Bearer ").strip()
    participant = db.scalar(select(Participant).where(
        Participant.event_id == event.id,
        Participant.reconnect_token_hash == token_hash(token),
    ))
    if participant is None or not secrets.compare_digest(participant.reconnect_token_hash, token_hash(token)):
        raise HTTPException(status_code=403, detail="Invalid participant link")
    return participant


def host_lobby_payload(db: Session, event: Event) -> dict:
    participants = db.scalars(
        select(Participant)
        .where(Participant.event_id == event.id)
        .order_by(Participant.joined_at)
    ).all()
    return {
        "title": event.title,
        "join_code": event.join_code,
        "state": event.state,
        "participant_count": len(participants),
        "participants": [
            {"name": participant.private_name, "display_name": participant.display_name}
            for participant in participants
        ],
        "question_count": len(event.questions),
        "current_question_position": event.current_question_position,
        "deadline_at": utc_datetime(event.timer_deadline).isoformat() if event.timer_deadline else None,
        "leaderboard": leaderboard_payload(db, event),
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/quizzes", status_code=status.HTTP_201_CREATED)
def create_quiz(payload: QuizCreate, db: Session = Depends(get_db), user=Depends(current_user)):
    event = build_event(payload, user.id)
    db.add(event)
    db.commit()
    return event_created_payload(event)


@app.get("/api/events/{join_code}")
def get_public_event(join_code: str, db: Session = Depends(get_db)):
    event = lookup_event(db, join_code)
    if event.state == "closed":
        return {"title": event.title, "join_code": event.join_code, "state": "closed"}
    participant_count = db.scalar(
        select(func.count()).select_from(Participant).where(Participant.event_id == event.id)
    ) or 0
    return {
        "title": event.title,
        "join_code": event.join_code,
        "state": event.state,
        "participant_count": participant_count,
        "max_participants": 50,
    }


@app.post("/api/events/{join_code}/participants", status_code=status.HTTP_201_CREATED)
def join_event(
    join_code: str,
    payload: ParticipantJoin,
    db: Session = Depends(get_db),
):
    event = lookup_event(db, join_code)
    if event.state not in {"lobby", "active", "results"}:
        raise HTTPException(status_code=409, detail="This quiz is no longer accepting participants")
    count = db.scalar(select(func.count()).select_from(Participant).where(Participant.event_id == event.id)) or 0
    if count >= 50:
        raise HTTPException(status_code=409, detail="This quiz is full")
    duplicate = db.scalar(
        select(Participant.id).where(
            Participant.event_id == event.id,
            func.lower(Participant.display_name) == payload.display_name.casefold(),
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="That display name is already taken")

    reconnect_token = secrets.token_urlsafe(32)
    participant = Participant(
        id=str(uuid.uuid4()),
        event_id=event.id,
        private_name=payload.name,
        display_name=payload.display_name,
        reconnect_token_hash=token_hash(reconnect_token),
    )
    db.add(participant)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That display name is already taken") from None
    return {
        "participant_id": participant.id,
        "display_name": participant.display_name,
        "reconnect_token": reconnect_token,
        "state": event.state,
    }


@app.get("/api/events/{join_code}/state")
def get_participant_event_state(
    join_code: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    event = lookup_event(db, join_code)
    participant = participant_for_request(db, event, authorization)
    advance_expired_event(db, event)
    result = {
        "title": event.title,
        "join_code": event.join_code,
        "state": event.state,
        "participant_display_name": participant.display_name,
    }
    if event.state == "closed":
        return {key: result[key] for key in ("title", "join_code", "state")}
    ranking = None
    if event.state in {"results", "completed"}:
        ranking = leaderboard_payload(db, event)
        own_entry = next((row for row in ranking if row["display_name"] == participant.display_name), None)
        result.update({
            "leaderboard_top3": ranking[:3],
            "leaderboard_self": own_entry,
        })
    if event.state in {"active", "results"} and event.current_question_position is not None:
        question = event.questions[event.current_question_position]
        answer = db.scalar(select(ParticipantAnswer).where(
            ParticipantAnswer.participant_id == participant.id,
            ParticipantAnswer.question_id == question.id,
        ))
        now = datetime.now(timezone.utc)
        result.update({
            "current_question_position": event.current_question_position,
            "question_count": len(event.questions),
            "current_question": question_payload(question),
            "deadline_at": utc_datetime(event.timer_deadline).isoformat(),
            "server_time": now.isoformat(),
            "answer_choice_index": answer.choice_index if answer else None,
            "can_answer_current_question": can_answer_question(event, participant, question),
        })
    if event.state == "results":
        result["results_remaining_seconds"] = max(0, int((utc_datetime(event.timer_deadline) - now).total_seconds() + 0.999))
        own_entry = next(row for row in ranking if row["display_name"] == participant.display_name)
        result["question_feedback"] = question_results_feedback(
            db, event, participant, question, answer, own_entry["rank"]
        )
    elif event.state == "completed":
        result["question_count"] = len(event.questions)
        result["leaderboard"] = ranking
        result["answer_review"] = participant_review(db, event, participant)
    return result


@app.post("/api/events/{join_code}/answers", status_code=status.HTTP_201_CREATED)
def submit_participant_answer(
    join_code: str,
    payload: AnswerSubmit,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    event = lookup_event(db, join_code)
    participant = participant_for_request(db, event, authorization)
    advance_expired_event(db, event)
    if event.state != "active" or event.current_question_position is None:
        raise HTTPException(status_code=409, detail="There is no active question")
    question = event.questions[event.current_question_position]
    if not can_answer_question(event, participant, question):
        raise HTTPException(status_code=409, detail="You joined during this question and can answer the next one")
    if payload.choice_index >= len(question.choices):
        raise HTTPException(status_code=422, detail="Choose one of the available answers")
    if utc_datetime(event.timer_deadline) <= datetime.now(timezone.utc):
        advance_expired_event(db, event)
        raise HTTPException(status_code=409, detail="Time has expired for this question")
    existing = db.scalar(select(ParticipantAnswer).where(
        ParticipantAnswer.participant_id == participant.id,
        ParticipantAnswer.question_id == question.id,
    ))
    if existing:
        raise HTTPException(status_code=409, detail="Your answer is already locked")
    answer = ParticipantAnswer(
        participant_id=participant.id,
        question_id=question.id,
        choice_index=payload.choice_index,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(answer)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Your answer is already locked") from None
    return {"state": "accepted", "choice_index": answer.choice_index}


@app.get("/api/host/{event_id}")
def get_host_event(event_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db), user=Depends(optional_user)):
    event = db.get(Event, event_id)
    authorize_host(event, authorization, user)
    return host_lobby_payload(db, event)


@app.websocket("/api/host/{event_id}/ws")
async def host_lobby_updates(websocket: WebSocket, event_id: str):
    if websocket.headers.get('origin') not in frontend_origins:
        await websocket.close(code=4403)
        return
    await websocket.accept()
    try:
        token = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        while True:
            user = await websocket_user(websocket.cookies.get('quizpop_session'))
            try:
                data = await asyncio.to_thread(authorized_host_snapshot, event_id, token, user)
            except HTTPException:
                await websocket.close(code=4403)
                return
            await websocket.send_json({"type": "host_lobby", "data": data})
            # Recheck database session and ownership before every protected update.
            await asyncio.sleep(1)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass


def authorized_host_snapshot(event_id: str, token: str, user) -> dict:
    with SessionLocal() as db:
        event = db.get(Event, event_id)
        authorize_host(event, f'Bearer {token}', user)
        return host_lobby_payload(db, event)


@app.post("/api/host/{event_id}/start")
def start_host_event(event_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db), user=Depends(optional_user)):
    event = locked_event(db, event_id)
    authorize_host(event, authorization, user)
    if event.state != "lobby":
        raise HTTPException(status_code=409, detail="This quiz has already started")

    event.state = "active"
    event.current_question_position = 0
    event.timer_deadline = datetime.now(timezone.utc) + timedelta(seconds=event.questions[0].time_limit_seconds)
    db.commit()
    return {"state": event.state}


@app.post("/api/host/{event_id}/close")
def close_host_event(event_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db), user=Depends(optional_user)):
    event = locked_event(db, event_id)
    authorize_host(event, authorization, user)
    if event.state not in {"completed", "closed"}:
        raise HTTPException(409, "Complete the quiz before closing it")
    if event.state == "completed":
        event.state = "closed"
        db.flush()
    result = host_lobby_payload(db, event)
    db.commit()
    return result


@app.delete("/api/host/{event_id}", status_code=204)
def delete_host_event(event_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db), user=Depends(optional_user)):
    event = locked_event(db, event_id)
    authorize_host(event, authorization, user)
    if event.state != "closed":
        raise HTTPException(409, "Close the event before deleting it")
    db.execute(delete(ParticipantAnswer).where(
        (ParticipantAnswer.question_id.in_(select(Question.id).where(Question.event_id == event.id))) |
        (ParticipantAnswer.participant_id.in_(select(Participant.id).where(Participant.event_id == event.id)))
    ))
    db.delete(event)
    db.commit()
