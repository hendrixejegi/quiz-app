from types import SimpleNamespace
from unittest.mock import patch
import pytest
from sqlalchemy import select, func
from test_participant_answers import game, answer, state
from app.main import app
from app.auth import optional_user
from app.models import Event, Question, Choice, Participant, ParticipantAnswer


def action(client, method, suffix='', token='legacy-host'):
    csrf = client.get('/api/auth/csrf').json()['token']
    return client.request(method, '/api/host/submission-event' + suffix, headers={
        'Origin': 'http://localhost:5173', 'X-CSRF-Token': csrf, 'Authorization': f'Bearer {token}'})


def test_closure_retains_host_results_hides_participant_and_deletes_without_orphans(game):
    client, db, event = game
    assert answer(client).status_code == 201
    event.state = 'completed'; event.timer_deadline = None; event.current_question_position = None; db.commit()
    assert 'answer_review' in state(client).json()
    closed = action(client, 'POST', '/close')
    assert closed.status_code == 200
    assert closed.json()['leaderboard'][0]['points'] == 100
    assert action(client, 'POST', '/close').json() == closed.json()
    assert set(state(client).json()) == {'title', 'join_code', 'state'}
    assert answer(client).status_code == 409
    assert action(client, 'DELETE').status_code == 204
    assert state(client).status_code == 404
    assert action(client, 'POST', '/close').status_code == 404
    for model in (Event, Question, Choice, Participant, ParticipantAnswer):
        assert db.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.parametrize('state_name', ['lobby', 'active', 'results'])
def test_only_completed_events_close_and_only_closed_events_delete(game, state_name):
    client, db, event = game
    event.state = state_name; db.commit()
    assert action(client, 'POST', '/close').status_code == 409
    assert action(client, 'DELETE').status_code == 409


def test_lifecycle_requires_csrf_and_correct_host_credentials(game):
    client, db, event = game
    event.state = 'completed'; db.commit()
    for method, suffix in [('POST', '/close'), ('DELETE', '')]:
        assert client.request(method, '/api/host/submission-event' + suffix).status_code == 403
        for token in ('wrong', 'player-token-0'):
            assert action(client, method, suffix, token).status_code == 403
    event.owner_id = 'owner'; db.commit()
    assert action(client, 'POST', '/close').status_code == 403
    with patch.dict(app.dependency_overrides, {optional_user: lambda: SimpleNamespace(id='other')}):
        assert action(client, 'POST', '/close').status_code == 403
        assert action(client, 'DELETE').status_code == 403
    with patch.dict(app.dependency_overrides, {optional_user: lambda: SimpleNamespace(id='owner')}):
        assert action(client, 'POST', '/close', token='').status_code == 200
        assert action(client, 'DELETE', token='').status_code == 204

def test_completed_event_cannot_be_deleted_and_closed_join_is_blocked(game):
    client, db, event = game
    event.state = 'completed'; db.commit()
    assert action(client, 'DELETE').status_code == 409
    assert action(client, 'POST', '/close').status_code == 200
    csrf = client.get('/api/auth/csrf').json()['token']
    response = client.post('/api/events/ANSWERS/participants', json={'name':'New player', 'display_name':'New'}, headers={
        'Origin':'http://localhost:5173', 'X-CSRF-Token':csrf})
    assert response.status_code == 409
    assert set(client.get('/api/events/ANSWERS').json()) == {'title','join_code','state'}
    assert db.scalar(select(func.count()).select_from(Participant)) == 3
