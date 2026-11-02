"""Shared transaction-locked quiz clock."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import Event, utc_datetime

RESULTS_INTERVAL_SECONDS = 5

def locked_event(db: Session, event_id: str) -> Event | None:
    # Never flush a stale timer object's state before acquiring the row lock.
    with db.no_autoflush:
        return db.scalar(select(Event).where(Event.id == event_id).with_for_update()
                         .execution_options(populate_existing=True))


def initialize_legacy_timers():
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


def advance_expired_events(should_stop=lambda: False):
    # PostgreSQL lock waits must not block request completion on the event loop.
    # Each session belongs entirely to this worker thread.
    with SessionLocal() as db:
        ids = db.scalars(select(Event.id).where(Event.state.in_(["active", "results"]), Event.timer_deadline <= datetime.now(timezone.utc))).all()
    for event_id in ids:
        if should_stop():
            break
        with SessionLocal() as db:
            event = locked_event(db, event_id)
            if event is not None:
                advance_expired_event(db, event)


