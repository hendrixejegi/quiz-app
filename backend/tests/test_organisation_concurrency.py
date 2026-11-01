"""Optional organisation races in a unique schema of a disposable PostgreSQL DB."""
import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from test_library_concurrency import library_postgres
from app.auth import User
from app.models import Organisation, Membership, OrganisationInvitation, LibraryQuiz, QuizVersion, utc_now
from app.organisations import accept_invitation, transfer_ownership, remove_member
from app.organisation_schemas import InvitationToken, TransferOwnership
from app.organisation_library import publish_shared_quiz, save_shared_quiz
from app.library_schemas import SaveDraft


@pytest.fixture
def team_postgres(library_postgres):
    engine, owner = library_postgres
    learner = SimpleNamespace(id=uuid.uuid4(), email='learner@example.com')
    author = SimpleNamespace(id=uuid.uuid4(), email='author@example.com')
    owner.email = 'owner@example.com'
    with Session(engine) as db:
        db.add_all([User(id=u.id, email=u.email, display_name='Test', hashed_password='not-a-login', is_verified=True) for u in [learner, author]])
        db.add(Organisation(id='org', name='Race test')); db.flush()
        db.add_all([Membership(id=str(u.id), organisation_id='org', user_id=u.id, role=role, active=True) for u, role in [(owner,'owner'),(author,'instructor')]])
        db.add(LibraryQuiz(id='shared', owner_id=author.id, organisation_id='org', title='Quiz', questions=[{'prompt':'Q?', 'choices':['A','B'], 'correct_choice_index':0,'time_limit_seconds':10}]))
        db.commit()
    yield engine, owner, author, learner


def race(engine, operation):
    barrier=Barrier(2)
    def attempt(index):
        with Session(engine) as db:
            barrier.wait(timeout=5)
            try:
                result=operation(db,index)
                return 200,result
            except HTTPException as error:
                db.rollback()
                return error.status_code,None
    with ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(attempt,(0,1)))


def test_competing_acceptance_creates_one_membership(team_postgres):
    engine, owner, author, learner = team_postgres
    secret='disposable-invitation-token-for-race'
    with Session(engine) as db:
        db.add(OrganisationInvitation(id='invite',organisation_id='org',issuer_id=owner.id,email=learner.email,role='learner',token_hash=hashlib.sha256(secret.encode()).hexdigest(),status='pending',expires_at=utc_now()+timedelta(days=7)));db.commit()
    results=race(engine, lambda db,index: accept_invitation(InvitationToken(token=secret),db,learner))
    assert [status for status,_ in results]==[200,200]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Membership).where(Membership.user_id==learner.id))==1


def test_competing_owner_transfers_keep_exactly_one_owner(team_postgres):
    engine,owner,author,learner=team_postgres
    with Session(engine) as db:
        db.add(Membership(id=str(learner.id),organisation_id='org',user_id=learner.id,role='learner',active=True));db.commit()
    results=race(engine,lambda db,index:transfer_ownership('org',TransferOwnership(user_id=[author.id,learner.id][index]),db,owner))
    assert sorted(status for status,_ in results)==[200,403]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Membership).where(Membership.organisation_id=='org',Membership.role=='owner',Membership.active.is_(True)))==1


def test_revocation_serializes_with_protected_write(team_postgres):
    engine,owner,author,learner=team_postgres
    payload=SaveDraft(title='Updated',questions=[],revision=1)
    def operation(db,index):
        if index: return remove_member('org',str(author.id),db,owner)
        return save_shared_quiz('org','shared',payload,db,author)
    results=race(engine,operation)
    assert results[1][0]==200 and results[0][0] in [200,404]
    with Session(engine) as db:
        assert db.get(Membership,str(author.id)).active is False
        with pytest.raises(HTTPException) as error: save_shared_quiz('org','shared',payload,db,author)
        assert error.value.status_code==404


def test_competing_shared_publications_reuse_immutable_version(team_postgres):
    engine,owner,author,learner=team_postgres
    with Session(engine) as db:
        quiz=db.get(LibraryQuiz,'shared'); payload=SaveDraft(title=quiz.title,questions=quiz.questions,revision=1)
    results=race(engine,lambda db,index:publish_shared_quiz('org','shared',payload,db,author))
    assert [status for status,_ in results]==[200,200]
    with Session(engine) as db:
        versions=db.scalars(select(QuizVersion).where(QuizVersion.quiz_id=='shared')).all()
        assert len(versions)==1 and versions[0].number==1
