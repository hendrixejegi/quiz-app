"""Run against a disposable database: AUTH_SECRET=test DATABASE_URL=sqlite:///./auth-test.db pytest tests/test_auth.py."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.database import Base, engine, SessionLocal
from app.auth import User, AccessToken
from app.models import Event

ORIGIN = 'http://localhost:5173'

@pytest.fixture
def client():
    assert 'auth-test' in str(engine.url), 'Authentication tests require a disposable auth-test database'
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        from sqlalchemy import delete
        db.execute(delete(AccessToken)); db.execute(delete(User)); db.commit()
    yield TestClient(app)


def post(client, path, **kwargs):
    csrf = client.get('/api/auth/csrf').json()['token']
    return client.post(path, headers={'Origin': ORIGIN, 'X-CSRF-Token': csrf}, **kwargs)


def register(client, email='host@example.com', verified=True):
    response = post(client, '/api/auth/register', json={'email': email, 'password': 'correct horse battery staple', 'display_name': 'Host', 'is_superuser': True})
    assert response.status_code == 201, response.text
    assert response.json()['is_superuser'] is False
    if verified:
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.email == email)); user.is_verified = True; db.commit()
    return response.json()['id']


def login(client, email='host@example.com'):
    return post(client, '/api/auth/session/login', data={'username': email, 'password': 'correct horse battery staple'})


def test_verification_login_and_csrf(client):
    register(client, verified=False)
    assert login(client).status_code == 400
    assert client.post('/api/auth/session/login', data={}).status_code == 403
    token = client.get('/api/auth/csrf').json()['token']
    assert client.post('/api/auth/forgot-password', headers={'Origin': 'https://evil.example', 'X-CSRF-Token': token}, json={'email': 'host@example.com'}).status_code == 403
    assert client.get('/api/auth/users/me').status_code == 401


def test_owner_controls_logout_and_revocation(client):
    register(client)
    assert login(client).status_code == 204
    assert client.get('/api/auth/users/me').json()['display_name'] == 'Host'
    payload = {'title': 'Owned quiz', 'questions': [{'prompt': 'Which?', 'choices': ['Yes', 'No'], 'correct_choice_index': 0, 'time_limit_seconds': 20}]}
    created = post(client, '/api/quizzes', json=payload)
    assert created.status_code == 201, created.text
    event_id = created.json()['event_id']
    assert '#' not in created.json()['host_url']
    assert client.get(f'/api/host/{event_id}').status_code == 200
    attacker = TestClient(app)
    register(attacker, 'other@example.com'); assert login(attacker, 'other@example.com').status_code == 204
    assert attacker.get(f'/api/host/{event_id}').status_code == 403
    old_cookie = client.cookies.get('quizpop_session')
    assert post(client, '/api/auth/revoke-sessions').status_code == 204
    client.cookies.set('quizpop_session', old_cookie)
    assert client.get('/api/auth/users/me').status_code == 401
    assert client.get(f'/api/host/{event_id}').status_code == 403


def test_email_flows_and_reset_revokes_sessions(client):
    register(client, verified=False)
    with patch('app.auth.send_account_email', new_callable=AsyncMock) as mail:
        assert post(client, '/api/auth/request-verify-token', json={'email': 'host@example.com'}).status_code == 202
        verify_token = mail.call_args.args[1]
        assert post(client, '/api/auth/verify', json={'token': verify_token}).status_code == 200
        assert login(client).status_code == 204
        assert post(client, '/api/auth/forgot-password', json={'email': 'host@example.com'}).status_code == 202
        reset_token = mail.call_args.args[1]
        assert post(client, '/api/auth/reset-password', json={'token': reset_token, 'password': 'a different long password'}).status_code == 200
        assert client.get('/api/auth/users/me').status_code == 401
        assert post(client, '/api/auth/reset-password', json={'token': reset_token, 'password': 'a different long password'}).status_code == 400


def test_oauth_callback_requires_browser_state(client):
    assert client.get('/api/auth/google/callback?state=attacker').status_code == 403


def test_legacy_host_link_still_works(client):
    from app.main import token_hash
    event_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Event(id=event_id, title='Legacy', join_code=uuid.uuid4().hex[:7], host_token_hash=token_hash('legacy-secret'))); db.commit()
    assert client.get(f'/api/host/{event_id}', headers={'Authorization': 'Bearer legacy-secret'}).status_code == 200
    assert client.get(f'/api/host/{event_id}', headers={'Authorization': 'Bearer wrong'}).status_code == 403


def test_expired_sessions_and_live_revocation(client):
    from datetime import datetime, timedelta, timezone
    from app.auth import websocket_user
    register(client)
    assert login(client).status_code == 204
    token = client.cookies.get('quizpop_session')
    assert asyncio.run(websocket_user(token)) is not None
    with SessionLocal() as db:
        record = db.scalar(select(AccessToken).where(AccessToken.token == token))
        record.created_at = datetime.now(timezone.utc) - timedelta(days=2)
        db.commit()
    assert client.get('/api/auth/users/me').status_code == 401
    assert asyncio.run(websocket_user(token)) is None

def test_profile_edit_and_logout(client):
    register(client); assert login(client).status_code == 204
    token = client.get('/api/auth/csrf').json()['token']
    changed = client.patch('/api/auth/users/me', headers={'Origin': ORIGIN, 'X-CSRF-Token': token}, json={'display_name': 'New host', 'is_superuser': True})
    assert changed.status_code == 200
    assert changed.json()['display_name'] == 'New host'
    assert changed.json()['is_superuser'] is False
    assert post(client, '/api/auth/session/logout').status_code == 204
    assert client.get('/api/auth/users/me').status_code == 401
    assert post(client, '/api/quizzes', json={'title': 'Guest', 'questions': [{'prompt': '?', 'choices': ['a', 'b'], 'correct_choice_index': 0, 'time_limit_seconds': 10}]}).status_code == 401


def test_open_host_socket_closes_after_revocation(client):
    from starlette.websockets import WebSocketDisconnect
    register(client); assert login(client).status_code == 204
    user = client.get('/api/auth/users/me').json()
    event_id = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Event(id=event_id, title='Owned', join_code=uuid.uuid4().hex[:7], host_token_hash='unused', owner_id=user['id'])); db.commit()
    with client.websocket_connect(f'/api/host/{event_id}/ws', headers={'Origin': ORIGIN}) as socket:
        socket.send_text('')
        assert socket.receive_json()['data']['title'] == 'Owned'
        assert post(client, '/api/auth/revoke-sessions').status_code == 204
        with pytest.raises(WebSocketDisconnect) as closed:
            # A frame already in flight may arrive before revocation is committed.
            for _ in range(3):
                socket.receive_json()
        assert closed.value.code == 4403
