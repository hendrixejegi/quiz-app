import asyncio
from threading import Event
from unittest.mock import patch
import pytest
from sqlalchemy.exc import OperationalError
from app.timer_daemon import Progress, run_loop
from app.main import app, lifespan
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import Event as QuizEvent, Question, Choice
from app.timing import advance_expired_events


def test_worker_advances_without_requests_and_catches_up():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    now = datetime.now(timezone.utc)
    with sessions() as db:
        db.add(QuizEvent(id='clock', title='Clock', join_code='CLOCK', host_token_hash='unused',
            state='active', current_question_position=0, timer_deadline=now - timedelta(seconds=1),
            questions=[Question(position=0, prompt='Q', time_limit_seconds=5, correct_choice_index=0,
                choices=[Choice(position=0, text='A'), Choice(position=1, text='B')])]))
        db.commit()
    with patch('app.timing.SessionLocal', sessions):
        advance_expired_events()
        with sessions() as db:
            event = db.get(QuizEvent, 'clock')
            assert event.state == 'results'
            event.timer_deadline = now - timedelta(seconds=20)
            db.commit()
        advance_expired_events()
        advance_expired_events()
    with sessions() as db:
        assert db.get(QuizEvent, 'clock').state == 'completed'
    engine.dispose()


def test_api_startup_does_not_start_timer():
    async def scenario():
        with patch('app.readiness.check_schema_ready'), patch('asyncio.create_task') as task:
            async with lifespan(app):
                task.assert_not_called()
    asyncio.run(scenario())


def test_transient_failure_recovers_and_shutdown_stops_new_work():
    stop = Event()
    calls = []
    def cycle():
        calls.append(True)
        if len(calls) == 1:
            raise OperationalError('secret', {}, Exception())
        stop.set()
    with patch.object(stop, 'wait'):
        run_loop(stop, Progress(), cycle, lambda: None)
    assert len(calls) == 2


def test_schema_failure_exits_without_polling():
    def invalid():
        raise RuntimeError('missing schema')
    with pytest.raises(RuntimeError, match='missing schema'):
        run_loop(Event(), Progress(), lambda: pytest.fail('must not poll'), invalid)


def test_stalled_loop_is_unhealthy():
    progress = Progress()
    assert progress.healthy()
    progress.updated -= 61
    assert not progress.healthy()


def test_shutdown_finishes_current_cycle_without_starting_another():
    from threading import Thread
    stop, entered, release = Event(), Event(), Event()
    completed = []
    def cycle():
        entered.set()
        release.wait(2)
        completed.append(True)
    thread = Thread(target=run_loop, args=(stop, Progress(), cycle, lambda: None))
    thread.start()
    try:
        assert entered.wait(2)
        stop.set()
        assert thread.is_alive()
    finally:
        release.set()
        thread.join(3)
    assert not thread.is_alive()
    assert completed == [True]


def test_database_credentials_failure_is_fatal():
    class InvalidCredentials(Exception):
        sqlstate = '28P01'
    def cycle():
        raise OperationalError('secret', {}, InvalidCredentials())
    with pytest.raises(RuntimeError, match='Invalid daemon database configuration'):
        run_loop(Event(), Progress(), cycle, lambda: None)
