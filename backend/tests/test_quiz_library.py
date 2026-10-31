"""Personal library API checks. Uses the disposable auth-test database fixture."""
from copy import deepcopy
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_auth import client, register, login
from app.main import app, close_host_event, delete_host_event
from app.database import SessionLocal
from app.models import Event, LibraryQuiz, QuizVersion

BASE = '/api/library/quizzes'
CONTENT = {'title': 'Python fundamentals', 'questions': [{'prompt': 'Define a function with?', 'choices': ['', 'def', 'class', ''], 'correct_choice_index': 1, 'time_limit_seconds': 10}]}


def request(client, method, path=BASE, **kwargs):
    csrf = client.get('/api/auth/csrf').json()['token']
    return client.request(method, path, headers={'Origin':'http://localhost:5173', 'X-CSRF-Token':csrf}, **kwargs)


def owner(client):
    register(client)
    assert login(client).status_code == 204


def create(client, content=None, publish=False):
    response = request(client, 'POST', json={**(content if content is not None else CONTENT), 'publish': publish})
    assert response.status_code == 201, response.text
    return response.json()


def test_incomplete_drafts_persist_and_cannot_publish(client):
    owner(client)
    result = create(client, {'title':'', 'questions':[{'prompt':'', 'choices':['','','','']}]})
    quiz = result['quiz']; path = f"{BASE}/{quiz['id']}"
    assert client.get(path).json()['title'] == ''
    assert result['version'] is None
    failure = request(client, 'POST', path + '/publish', json={**CONTENT, 'title':'', 'revision':1})
    assert failure.status_code == 422
    assert client.get(path).json()['revision'] == 1
    assert client.get(path + '/versions').json() == []


def test_publication_is_immutable_reusable_and_idempotent(client):
    owner(client)
    created = create(client, publish=True)
    quiz = created['quiz']; path = f"{BASE}/{quiz['id']}"
    version = created['version']
    assert version['questions'][0]['choices'] == ['def','class']
    assert version['questions'][0]['correct_choice_index'] == 0
    repeated = request(client, 'POST', path + '/publish', json={**CONTENT, 'revision':quiz['revision']})
    assert repeated.json()['version'] == version
    launched = request(client, 'POST', path + '/versions/1/events')
    assert launched.status_code == 201
    changed = deepcopy(CONTENT); changed['title'] = 'Python updated'; changed['questions'][0]['prompt'] = 'New prompt?'
    published = request(client, 'POST', path + '/publish', json={**changed, 'revision':quiz['revision']})
    assert published.status_code == 200
    assert published.json()['version']['number'] == 2
    assert client.get(path + '/versions/1').json() == version
    assert [v['number'] for v in client.get(path + '/versions').json()] == [2,1]
    with SessionLocal() as db:
        event = db.get(Event, launched.json()['event_id'])
        assert event.title == CONTENT['title']
        assert event.questions[0].prompt == CONTENT['questions'][0]['prompt']
        assert db.get(QuizVersion, event.source_version_id).number == 1
        event.state = 'completed'; db.commit()
        user = type('Owner', (), {'id':event.owner_id})()
        close_host_event(event.id, None, db, user)
        delete_host_event(event.id, None, db, user)
        assert db.get(LibraryQuiz, quiz['id']) is not None
    assert client.get(path + '/versions/1').status_code == 200
    assert request(client, 'POST', path + '/versions/2/events').status_code == 201


def test_revision_conflicts_do_not_overwrite_either_draft_or_versions(client):
    owner(client)
    quiz = create(client)['quiz']; path = f"{BASE}/{quiz['id']}"
    changed = {**CONTENT, 'title':'Saved in another tab', 'revision':1}
    assert request(client, 'PUT', path, json=changed).json()['revision'] == 2
    for suffix, method in [('', 'PUT'), ('/publish', 'POST')]:
        assert request(client, method, path + suffix, json={**CONTENT,'revision':1}).status_code == 409
    assert client.get(path).json()['title'] == changed['title']
    assert client.get(path + '/versions').json() == []
    unchanged = request(client, 'PUT', path, json={**changed, 'revision':2})
    assert unchanged.json()['revision'] == 2
    assert request(client, 'PUT', path, json={'revision':2}).status_code == 422
    assert client.get(path).json()['title'] == changed['title']


def test_library_owner_isolation_csrf_and_authentication(client):
    assert client.get(BASE).status_code == 401
    register(client, verified=False)
    assert client.get(BASE).status_code == 401
    # Authenticate a verified account using a different address.
    register(client, 'verified@example.com'); assert login(client, 'verified@example.com').status_code == 204
    quiz = create(client, publish=True)['quiz']; path = f"{BASE}/{quiz['id']}"
    assert client.post(BASE, json=CONTENT).status_code == 403
    attacker = TestClient(app)
    register(attacker, 'attacker@example.com'); assert login(attacker, 'attacker@example.com').status_code == 204
    for suffix in ['', '/versions', '/versions/1']:
        assert attacker.get(path + suffix).status_code == 404
    for method, suffix in [('PUT',''), ('POST','/publish'), ('POST','/versions/1/events')]:
        assert request(attacker, method, path + suffix, json={**CONTENT,'revision':1}).status_code == 404
    assert attacker.get(BASE).json()['items'] == []
    assert request(client, 'POST', path + '/versions/999/events').status_code == 404
    attacker.close()


def test_size_limits_pagination_and_failed_first_publication(client):
    owner(client)
    for body in [{'title':'a'*101}, {'questions':[{}]*21}, {'questions':[{'choices':['a'*201]}]}]:
        assert request(client, 'POST', json=body).status_code == 422
    before = client.get(BASE).json()['total']
    assert request(client, 'POST', json={'publish':True,'title':'','questions':[]}).status_code == 422
    assert client.get(BASE).json()['total'] == before
    first = create(client)['quiz']; second = create(client)['quiz']
    page = client.get(BASE + '?limit=1').json()
    assert page['total'] == 2 and page['items'][0]['id'] == second['id']
    assert client.get(BASE + '?limit=1&offset=1').json()['items'][0]['id'] == first['id']
    assert 'questions' not in page['items'][0]
    assert client.get(BASE+'?limit=101').status_code == 422


def test_openapi_describes_private_library_contracts(client):
    schema = client.get('/openapi.json').json()
    publication = schema['paths'][BASE+'/{quiz_id}/publish']['post']
    assert publication['tags'] == ['Personal quiz library']
    assert {'401','403','404','409','422'} <= publication['responses'].keys()
    assert 'SaveDraft' in schema['components']['schemas']
    assert {'title', 'questions', 'revision'} <= set(schema['components']['schemas']['SaveDraft']['required'])
    assert {'Origin', 'X-CSRF-Token'} <= {parameter['name'] for parameter in publication['parameters']}


def test_quick_launch_does_not_create_a_library_entry(client):
    owner(client)
    payload = {'title':'Quick quiz','questions':[{'prompt':'Q?','choices':['A','B'],'correct_choice_index':0,'time_limit_seconds':10}]}
    event = request(client, 'POST', '/api/quizzes', json=payload)
    assert event.status_code == 201
    assert client.get(BASE).json()['total'] == 0
    with SessionLocal() as db:
        assert db.get(Event, event.json()['event_id']).source_version_id is None
