"""Organisation authorization shared by HTTP, library, and live-game services."""
import uuid
from fastapi import HTTPException
from sqlalchemy import select
from .models import Organisation, Membership, OrganisationAudit

MANAGERS = {'owner', 'admin'}
AUTHORS = {'owner', 'admin', 'instructor'}


def audit(db, organisation_id, user, action, target_id, outcome='success'):
    db.add(OrganisationAudit(id=str(uuid.uuid4()), organisation_id=organisation_id, actor_id=user.id,
        action=action, target_id=str(target_id), outcome=outcome,
        correlation_id=db.info.setdefault('correlation_id', str(uuid.uuid4()))))


def denied(db, organisation_id, user, action='access.denied', target_id=None, status=403, detail='Your role cannot perform this action.'):
    if user is not None:
        db.info['organisation_denial'] = dict(organisation_id=organisation_id, user=user.id, action=action,
            target_id=str(target_id or organisation_id), correlation_id=db.info.setdefault('correlation_id', str(uuid.uuid4())))
    raise HTTPException(status, detail)


def organisation_access(db, organisation_id, user, lock=None, participant=False):
    query = select(Organisation).where(Organisation.id == organisation_id)
    if lock:
        query = query.with_for_update(read=lock == 'shared').execution_options(populate_existing=True)
    organisation = db.scalar(query)
    if organisation is None:
        raise HTTPException(404, 'Organisation not found')
    if user is None:
        raise HTTPException(401, {'code':'ORG_AUTH_REQUIRED','reason':'Sign in with a verified account to join this organisation game.'})
    member = db.scalar(select(Membership).where(Membership.organisation_id == organisation_id,
        Membership.user_id == user.id, Membership.active.is_(True)).execution_options(populate_existing=True))
    if member is None:
        denied(db, organisation_id, user, status=403 if participant else 404,
            detail={'code':'ORG_ACCESS_REVOKED','reason':'Organisation access has ended.'} if participant else 'Organisation not found')
    return organisation, member


def require_role(db, organisation, member, user, roles, action='access.denied', target_id=None):
    if member.role not in roles:
        denied(db, organisation.id, user, action, target_id)


def can_edit(member, quiz, user):
    return member.role in MANAGERS or (member.role == 'instructor' and quiz.owner_id == user.id)


def can_control(member, event, user):
    return member.role in MANAGERS or (member.role == 'instructor' and event.owner_id == str(user.id))


def capabilities(member):
    return {'manage_members':member.role in MANAGERS, 'author_quizzes':member.role in AUTHORS,
            'manage_admins':member.role == 'owner', 'transfer_ownership':member.role == 'owner',
            'view_audit':member.role in MANAGERS}
