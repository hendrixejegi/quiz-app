"""Organisation role boundaries and membership-authorized live games."""
from datetime import timedelta
from urllib.parse import urlsplit
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from test_auth import client, register, login
from app.main import app
from app.database import SessionLocal
from app.models import Membership, OrganisationInvitation, OrganisationAudit, Event, Participant, ParticipantAnswer, LibraryQuiz, utc_now

BASE='/api/organisations'
QUIZ={'title':'Shared Python','questions':[{'prompt':'Define a function?','choices':['def','class','',''],'correct_choice_index':0,'time_limit_seconds':20}]}


def mutate(c, method, path, payload=None):
    token=c.get('/api/auth/csrf').json()['token']
    return c.request(method,path,headers={'Origin':'http://localhost:5173','X-CSRF-Token':token},**({'json':payload} if payload is not None else {}))


def organisation(c,name='Learning team'):
    response=mutate(c,'POST',BASE,{'name':name}); assert response.status_code==201,response.text
    return response.json()['id']


def invite(c,org,email,role):
    response=mutate(c,'POST',f'{BASE}/{org}/invitations',{'email':email,'role':role}); assert response.status_code==201,response.text
    return response.json()


def accept(c,link):
    return mutate(c,'POST',BASE+'/invitations/accept',{'token':urlsplit(link).fragment})


def account(email):
    c=TestClient(app); identifier=register(c,email); assert login(c,email).status_code==204
    return c,identifier


def setup_team(client):
    register(client); assert login(client).status_code==204
    org=organisation(client)
    actors={}
    for role in ['admin','instructor','learner']:
        email=role+'@example.com'; actor,identifier=account(email)
        link=invite(client,org,email,role)['url']; assert accept(actor,link).status_code==200
        actors[role]=(actor,identifier)
    return org,actors


def member_id(org,user_id):
    import uuid
    with SessionLocal() as db:
        return db.scalar(select(Membership.id).where(Membership.organisation_id==org,Membership.user_id==uuid.UUID(str(user_id))))


def test_role_matrix_personal_isolation_and_hidden_peer_drafts(client):
    org,actors=setup_team(client)
    instructor,_=actors['instructor']; admin,_=actors['admin']; learner,_=actors['learner']
    base=f'{BASE}/{org}/quizzes'
    personal=mutate(client,'POST','/api/library/quizzes',{**QUIZ,'publish':True}).json()['quiz']
    assert instructor.get('/api/library/quizzes/'+personal['id']).status_code==404
    created=mutate(client,'POST',base,{**QUIZ,'publish':True}).json()['quiz']; quiz_id=created['id']
    draft=mutate(client,'POST',base,{'title':'Private draft','questions':[]}).json()['quiz']
    assert instructor.get(base+'/'+draft['id']).status_code==404
    assert instructor.get(base).json()['total']==1
    modified={**QUIZ,'title':'Secret unpublished title','revision':1}
    assert mutate(client,'PUT',base+'/'+quiz_id,modified).status_code==200
    peer=instructor.get(base+'/'+quiz_id).json()
    assert peer['title']==QUIZ['title'] and peer['questions'] is None and peer['revision'] is None and peer['has_unpublished_changes'] is None
    assert peer['capabilities']['can_edit_draft'] is False
    assert mutate(instructor,'PUT',base+'/'+quiz_id,modified).status_code==403
    assert instructor.get(base+'/'+quiz_id+'/versions/1').status_code==200
    for suffix in ['', '/'+quiz_id, '/'+quiz_id+'/versions/1']:
        assert learner.get(base+suffix).status_code==403
    assert mutate(learner,'POST',base,QUIZ).status_code==403
    assert mutate(admin,'PUT',base+'/'+quiz_id,{**QUIZ,'revision':2}).status_code==200
    own=mutate(instructor,'POST',base,QUIZ).json()['quiz']
    assert own['capabilities']['can_edit_draft']
    assert mutate(instructor,'POST',base+'/'+own['id']+'/publish',{**QUIZ,'revision':1}).status_code==200
    # Even the original creator cannot escape organisation policy via personal routes.
    assert instructor.get('/api/library/quizzes/'+own['id']).status_code==404
    assert mutate(instructor,'PUT','/api/library/quizzes/'+own['id'],{**QUIZ,'revision':1}).status_code==404
    assert client.get('/api/library/quizzes').json()['total']==1
    other=organisation(client,'Other team')
    assert instructor.get(f'{BASE}/{other}').status_code==404
    assert client.get(f'{BASE}/{other}/quizzes/{quiz_id}').status_code==404
    # Copy preserves the personal draft/history and creates no published versions.
    copied=mutate(instructor,'POST',base+'/copy-personal/'+personal['id']); assert copied.status_code==404
    copied=mutate(client,'POST',base+'/copy-personal/'+personal['id']); assert copied.status_code==201
    assert client.get(base+'/'+copied.json()['id']+'/versions').json()==[]
    assert client.get('/api/library/quizzes/'+personal['id']+'/versions').json()[0]['number']==1
    for actor,_ in actors.values(): actor.close()


def test_invitations_are_email_bound_expire_rotate_and_do_not_escalate(client):
    register(client); assert login(client).status_code==204
    org=organisation(client)
    recipient,identifier=account('recipient@example.com'); other,_=account('wrong@example.com')
    issued=invite(client,org,'RECIPIENT@example.com','instructor'); token=urlsplit(issued['url']).fragment
    assert accept(other,issued['url']).status_code==403
    preview=mutate(recipient,'POST',BASE+'/invitations/preview',{'token':token}); assert preview.status_code==200
    assert preview.json()['organisation']['name']=='Learning team'
    assert 'token_hash' not in str(client.get(f'{BASE}/{org}/invitations').json())
    replacement=mutate(client,'POST',f"{BASE}/{org}/invitations/{issued['invitation']['id']}/regenerate").json()
    assert accept(recipient,issued['url']).status_code==404
    assert accept(recipient,replacement['url']).status_code==200
    assert accept(recipient,replacement['url']).status_code==200
    membership=member_id(org,identifier)
    assert mutate(client,'PATCH',f'{BASE}/{org}/members/{membership}',{'role':'learner'}).status_code==200
    assert accept(recipient,replacement['url']).json()['role']=='learner'
    assert mutate(client,'DELETE',f'{BASE}/{org}/members/{membership}').status_code==204
    assert accept(recipient,replacement['url']).status_code==409
    new=invite(client,org,'recipient@example.com','learner')
    assert accept(recipient,new['url']).status_code==200
    expired=invite(client,org,'wrong@example.com','learner')
    with SessionLocal() as db:
        row=db.get(OrganisationInvitation,expired['invitation']['id']); row.expires_at=utc_now()-timedelta(seconds=1); db.commit()
    assert accept(other,expired['url']).status_code==410
    revoked=mutate(client,'POST',f"{BASE}/{org}/invitations/{expired['invitation']['id']}/regenerate").json()
    assert mutate(client,'DELETE',f"{BASE}/{org}/invitations/{expired['invitation']['id']}").status_code==204
    assert accept(other,revoked['url']).status_code==409
    recipient.close();other.close()


def test_admin_boundaries_ownership_and_issuer_demotion(client):
    org,actors=setup_team(client)
    admin,admin_user=actors['admin']; instructor,instructor_user=actors['instructor']; learner,learner_user=actors['learner']
    admin_member=member_id(org,admin_user); instructor_member=member_id(org,instructor_user)
    assert mutate(admin,'POST',f'{BASE}/{org}/invitations',{'email':'new@example.com','role':'admin'}).status_code==403
    assert mutate(admin,'PATCH',f'{BASE}/{org}/members/{instructor_member}',{'role':'admin'}).status_code==403
    assert mutate(admin,'DELETE',f'{BASE}/{org}/members/{admin_member}').status_code==403
    assert mutate(instructor,'POST',f'{BASE}/{org}/invitations',{'email':'new@example.com','role':'learner'}).status_code==403
    assert mutate(client,'POST',f'{BASE}/{org}/leave').status_code==409
    assert mutate(admin,'POST',f'{BASE}/{org}/ownership',{'user_id':learner_user}).status_code==403
    outstanding=invite(admin,org,'pending@example.com','learner')
    assert mutate(client,'PATCH',f'{BASE}/{org}/members/{admin_member}',{'role':'instructor'}).status_code==200
    with SessionLocal() as db: assert db.get(OrganisationInvitation,outstanding['invitation']['id']).status=='revoked'
    assert mutate(client,'POST',f'{BASE}/{org}/ownership',{'user_id':learner_user}).json()['role']=='admin'
    assert learner.get(f'{BASE}/{org}').json()['role']=='owner'
    assert mutate(client,'POST',f'{BASE}/{org}/leave').status_code==204
    with SessionLocal() as db:
        owners=db.scalar(select(func.count()).select_from(Membership).where(Membership.organisation_id==org,Membership.active.is_(True),Membership.role=='owner'))
        assert owners==1
    for actor,_ in actors.values(): actor.close()


def test_member_games_bind_accounts_reconnect_and_revoke_access(client):
    org,actors=setup_team(client)
    instructor,instructor_user=actors['instructor']; learner,learner_user=actors['learner']; admin,_=actors['admin']
    base=f'{BASE}/{org}/quizzes'
    quiz=mutate(instructor,'POST',base,{**QUIZ,'publish':True}).json()['quiz']
    event=mutate(instructor,'POST',base+'/'+quiz['id']+'/versions/1/events').json()
    code=event['join_code']; room=f'/api/events/{code}'
    anonymous=TestClient(app)
    assert anonymous.get(room).status_code==401
    outside,_=account('outside@example.com'); assert outside.get(room).status_code==403
    joined=mutate(learner,'POST',room+'/participants',{'name':'Learner','display_name':'Learner'}).json()
    rotated=mutate(learner,'POST',room+'/participants',{'name':'Ignored','display_name':'Ignored'}).json()
    assert joined['participant_id']==rotated['participant_id'] and joined['reconnect_token']!=rotated['reconnect_token']
    auth={'Authorization':'Bearer '+rotated['reconnect_token']}
    assert admin.get(room+'/state',headers=auth).status_code==403
    assert instructor.get('/api/host/'+event['event_id']).status_code==200
    assert admin.get('/api/host/'+event['event_id']).status_code==200
    assert learner.get('/api/host/'+event['event_id']).status_code==403
    assert mutate(instructor,'POST','/api/host/'+event['event_id']+'/start').status_code==200
    csrf=learner.get('/api/auth/csrf').json()['token']
    answered=learner.post(room+'/answers',json={'choice_index':0},headers={**auth,'Origin':'http://localhost:5173','X-CSRF-Token':csrf}); assert answered.status_code==201
    assert mutate(client,'DELETE',f'{BASE}/{org}/members/{member_id(org,learner_user)}').status_code==204
    denied=learner.get(room+'/state',headers=auth); assert denied.status_code==403 and denied.json()['detail']['code']=='ORG_ACCESS_REVOKED'
    assert learner.post(room+'/answers',json={'choice_index':0},headers={**auth,'Origin':'http://localhost:5173','X-CSRF-Token':csrf}).status_code==403
    assert mutate(client,'PATCH',f'{BASE}/{org}/members/{member_id(org,instructor_user)}',{'role':'learner'}).status_code==200
    assert instructor.get('/api/host/'+event['event_id']).status_code==403
    assert admin.get('/api/host/'+event['event_id']).status_code==200
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Participant).where(Participant.event_id==event['event_id']))==1
        assert db.scalar(select(func.count()).select_from(ParticipantAnswer).join(Participant).where(Participant.event_id==event['event_id']))==1
    for actor,_ in actors.values(): actor.close()
    anonymous.close();outside.close()


def test_audit_visibility_no_secrets_and_csrf(client):
    org,actors=setup_team(client)
    admin,_=actors['admin']; learner,_=actors['learner']
    assert client.post(BASE,json={'name':'Bypass'}).status_code==403
    assert learner.get(f'{BASE}/{org}/members').status_code==403
    assert learner.get(f'{BASE}/{org}/audit').status_code==403
    records=admin.get(f'{BASE}/{org}/audit?limit=100').json()
    assert records['total']>=5
    assert any(row['outcome']=='denied' for row in records['items'])
    assert all(set(row)=={'id','actor_id','action','target_id','outcome','correlation_id','created_at'} for row in records['items'])
    assert 'token' not in str(records) and 'example.com' not in str(records)
    for actor,_ in actors.values(): actor.close()


def test_open_host_connection_rechecks_membership_after_demotion(client):
    from starlette.websockets import WebSocketDisconnect
    import pytest
    org, actors = setup_team(client)
    instructor, instructor_user = actors['instructor']
    base = f'{BASE}/{org}/quizzes'
    quiz = mutate(instructor, 'POST', base, {**QUIZ, 'publish': True}).json()['quiz']
    event = mutate(instructor, 'POST', base+'/'+quiz['id']+'/versions/1/events').json()
    with instructor.websocket_connect('/api/host/'+event['event_id']+'/ws', headers={'Origin':'http://localhost:5173'}) as socket:
        socket.send_text('')
        assert socket.receive_json()['data']['state'] == 'lobby'
        assert mutate(client, 'PATCH', f'{BASE}/{org}/members/{member_id(org,instructor_user)}', {'role':'learner'}).status_code == 200
        with pytest.raises(WebSocketDisconnect) as error:
            while True:
                socket.receive_json()
        assert error.value.code == 4403
    for actor, _ in actors.values(): actor.close()
