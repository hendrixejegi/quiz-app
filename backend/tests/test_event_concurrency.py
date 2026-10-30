"""Opt-in row-lock checks. TEST_POSTGRES_URL must name a disposable test database."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.database import Base, engine as configured_engine
from app.main import advance_expired_event, close_host_event, delete_host_event, locked_event
from app.models import Event, Question, Choice

@pytest.mark.parametrize('operation', ['close', 'delete'])
def test_stale_timer_waits_for_lifecycle_lock_and_cannot_resurrect(operation):
    raw = os.environ.get('TEST_POSTGRES_URL')
    if not raw:
        pytest.skip('Set TEST_POSTGRES_URL to a disposable PostgreSQL test database')
    url = make_url(raw)
    assert url.get_backend_name() == 'postgresql' and 'test' in (url.database or '').lower()
    assert url.set(drivername='postgresql') != configured_engine.url.set(drivername='postgresql')
    schema = 'lifecycle_test_' + uuid.uuid4().hex
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            event = Event(id='race', title='Race', join_code='RACE', host_token_hash='unused', state='completed',
                questions=[Question(position=0, prompt='Q', time_limit_seconds=10, correct_choice_index=0,
                    choices=[Choice(position=0, text='A'), Choice(position=1, text='B')])])
            db.add(event); db.commit()
        with ThreadPoolExecutor() as pool, Session(engine) as stale, Session(engine) as controller:
            old = stale.get(Event, 'race')
            old.state = 'active'; old.current_question_position = 0
            old.timer_deadline = datetime.now(timezone.utc) - timedelta(seconds=30)
            row = locked_event(controller, 'race')
            if operation == 'delete':
                row.state = 'closed'; controller.flush()
            pending = pool.submit(advance_expired_event, stale, old)
            with pytest.raises(TimeoutError):
                pending.result(timeout=0.2)
            if operation == 'close':
                # Legacy token hash is deliberately test-only.
                from app.main import token_hash
                row.host_token_hash = token_hash('host'); controller.flush()
                close_host_event('race', 'Bearer host', controller, None)
            else:
                from app.main import token_hash
                row.host_token_hash = token_hash('host'); controller.flush()
                delete_host_event('race', 'Bearer host', controller, None)
            assert pending.result(timeout=5) is False
        with Session(engine) as db:
            row = db.get(Event, 'race')
            assert row is None if operation == 'delete' else row.state == 'closed'
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
