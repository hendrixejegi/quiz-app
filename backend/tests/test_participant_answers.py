"""Participant submissions through the current timed-game API."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app, leaderboard_payload, token_hash
from app.models import Choice, Event, Participant, ParticipantAnswer, Question


@pytest.fixture
def game():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        now = datetime.now(timezone.utc)
        event = Event(id='submission-event', title='Submission checks', join_code='ANSWERS',
                      host_token_hash=token_hash('legacy-host'), state='active',
                      current_question_position=0, timer_deadline=now + timedelta(seconds=20))
        event.questions = [
            Question(position=position, prompt=prompt, time_limit_seconds=20,
                     correct_choice_index=position,
                     choices=[Choice(position=0, text='First'), Choice(position=1, text='Second')])
            for position, prompt in enumerate(('First question?', 'Second question?'))
        ]
        event.participants = [
            Participant(id=f'player-{index}', private_name=name, display_name=name,
                        reconnect_token_hash=token_hash(f'player-token-{index}'),
                        joined_at=now - timedelta(minutes=1) + timedelta(seconds=index))
            for index, name in enumerate(('Ari', 'Bea', 'Cal'))
        ]
        db.add(event)
        db.commit()

        def override_db():
            with Session(engine) as request_db:
                yield request_db

        with patch.dict(app.dependency_overrides, {get_db: override_db}):
            client = TestClient(app)
            try:
                yield client, db, event
            finally:
                client.close()
    engine.dispose()


def answer(client, choice_index=0, player=0):
    csrf = client.get('/api/auth/csrf').json()['token']
    return client.post('/api/events/ANSWERS/answers', json={'choice_index': choice_index}, headers={
        'Origin': 'http://localhost:5173', 'X-CSRF-Token': csrf,
        'Authorization': f'Bearer player-token-{player}',
    })


def state(client, player=0):
    return client.get('/api/events/ANSWERS/state', headers={
        'Authorization': f'Bearer player-token-{player}',
    })


def test_correct_incorrect_and_unanswered_scores_are_persisted(game):
    client, db, event = game
    assert answer(client, choice_index=0, player=0).status_code == 201
    assert answer(client, choice_index=1, player=1).status_code == 201
    rows = db.scalars(select(ParticipantAnswer)).all()
    assert len(rows) == 2
    assert [(row['display_name'], row['points'], row['rank']) for row in leaderboard_payload(db, event)] == [
        ('Ari', 100, 1), ('Bea', 0, 2), ('Cal', 0, 2),
    ]


def test_duplicate_answer_preserves_original_and_next_question_is_independent(game):
    client, db, event = game
    assert answer(client, choice_index=0).status_code == 201
    assert answer(client, choice_index=1).status_code == 409
    assert state(client).json()['answer_choice_index'] == 0
    event.current_question_position = 1
    event.timer_deadline = datetime.now(timezone.utc) + timedelta(seconds=20)
    db.commit()
    assert answer(client, choice_index=1).status_code == 201
    rows = db.scalars(select(ParticipantAnswer).order_by(ParticipantAnswer.question_id)).all()
    assert [row.choice_index for row in rows] == [0, 1]
    assert len({row.question_id for row in rows}) == 2


def test_answer_key_is_hidden_until_game_completion(game):
    client, db, event = game
    before = state(client).json()
    assert 'correct_choice_index' not in before['current_question']
    assert 'answer_review' not in before
    assert answer(client).status_code == 201
    during = state(client).json()
    assert 'correct_choice_index' not in during['current_question']
    assert 'answer_review' not in during
    event.state = 'completed'
    event.current_question_position = None
    event.timer_deadline = None
    db.commit()
    review = state(client).json()['answer_review']
    assert [row['correct_answer'] for row in review] == ['First', 'Second']
    assert [row['outcome'] for row in review] == ['correct', 'unanswered']


@pytest.mark.parametrize('room_state', ['lobby', 'completed'])
def test_answers_are_rejected_outside_an_active_question(game, room_state):
    client, db, event = game
    event.state = room_state
    db.commit()
    assert answer(client).status_code == 409
    assert db.scalars(select(ParticipantAnswer)).all() == []


def test_expired_question_does_not_accept_or_persist_an_answer(game):
    client, db, event = game
    event.timer_deadline = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert answer(client).status_code == 409
    assert db.scalars(select(ParticipantAnswer)).all() == []


def test_invalid_choices_and_unrecognized_participants_cannot_submit(game):
    client, db, _ = game
    assert answer(client, choice_index=2).status_code == 422
    assert answer(client, player=99).status_code == 403
    assert db.scalars(select(ParticipantAnswer)).all() == []


def test_reconnect_token_restores_the_saved_answer(game):
    client, _, _ = game
    assert answer(client, choice_index=1).status_code == 201
    reconnected = TestClient(app)
    try:
        snapshot = state(reconnected).json()
        assert snapshot['participant_display_name'] == 'Ari'
        assert snapshot['answer_choice_index'] == 1
    finally:
        reconnected.close()
