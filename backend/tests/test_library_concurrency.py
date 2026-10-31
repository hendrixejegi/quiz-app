"""Optional concurrency checks, restricted to a separately configured PostgreSQL test database."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.auth import User
from app.database import Base, engine as configured_engine
from app.library_schemas import SaveDraft
from app.library_service import owned_quiz, published_content, publish, save_content
from app.models import LibraryQuiz, QuizVersion


@pytest.fixture
def library_postgres():
    raw = os.environ.get('TEST_POSTGRES_URL')
    if not raw:
        pytest.skip('Set TEST_POSTGRES_URL to a disposable PostgreSQL test database')
    url = make_url(raw)
    assert url.get_backend_name() == 'postgresql' and 'test' in (url.database or '').lower()
    configured = configured_engine.url
    assert (url.host, url.port or 5432, url.database) != (configured.host, configured.port or 5432, configured.database)
    schema = 'library_test_' + uuid.uuid4().hex
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={'options':f'-csearch_path={schema} -cstatement_timeout=10000'})
    try:
        Base.metadata.create_all(engine)
        owner_id = uuid.uuid4()
        with Session(engine) as db:
            db.add(User(id=owner_id, email='library@example.test', display_name='Owner', hashed_password='not-a-login', is_verified=True))
            db.flush()
            db.add(LibraryQuiz(id='quiz', owner_id=owner_id, title='Quiz', questions=[{'prompt':'Q?', 'choices':['A','B'], 'correct_choice_index':0, 'time_limit_seconds':10}]))
            db.commit()
        yield engine, SimpleNamespace(id=owner_id)
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.mark.parametrize('changed', [False, True])
def test_competing_publications_are_idempotent_or_conflict_without_duplicate_numbers(library_postgres, changed):
    engine, owner = library_postgres
    barrier = Barrier(2)
    def attempt(index):
        with Session(engine) as db:
            barrier.wait(timeout=5)
            quiz = owned_quiz(db, 'quiz', owner, lock=True)
            payload = SaveDraft(title=f'Change {index}' if changed else 'Quiz', questions=quiz.questions, revision=1)
            try:
                validated = published_content(payload)
                save_content(db, quiz, payload)
                version = publish(db, quiz, validated)
                result = (200, version.id)
                db.commit()
                return result
            except HTTPException as error:
                db.rollback()
                return error.status_code, None
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, (1,2)))
    assert sorted(status for status, _ in results) == ([200,409] if changed else [200,200])
    if not changed:
        assert results[0][1] == results[1][1]
    with Session(engine) as db:
        versions = db.scalars(select(QuizVersion)).all()
        assert len(versions) == 1 and versions[0].number == 1
        assert versions[0].draft_revision == (2 if changed else 1)
