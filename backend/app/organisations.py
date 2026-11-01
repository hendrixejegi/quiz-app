"""Organisation administration and email-bound invitation lifecycle."""
import hashlib
import secrets
import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .auth import current_user, User, FRONTEND
from .database import get_db
from .models import Organisation, Membership, OrganisationInvitation, OrganisationAudit, utc_now, utc_datetime
from .permissions import organisation_access, require_role, capabilities, MANAGERS, denied, audit
from .organisation_schemas import OrganisationName, OrganisationRead, MembershipRead, RoleChange, InvitationCreate, InvitationRead, InvitationLink, InvitationToken, InvitationPreview, TransferOwnership, AuditPage
from .library import commit, MUTATION_DOCS

router = APIRouter(prefix='/api/organisations', tags=['Organisations and permissions'], responses={
    401:{'description':'Verified sign-in required'},404:{'description':'Organisation or resource unavailable'},
    403:{'description':'Insufficient role, invitation email mismatch, or CSRF rejection', 'content':{'application/json':{'examples':{
        'owner_only':{'summary':'Admin attempts to grant admin privileges','value':{'detail':'Only the owner can manage admin access. Ownership changes require a transfer.'}},
        'wrong_email':{'summary':'Verified invitation recipient has a different email','value':{'detail':'Sign in with the verified email this invitation was sent to.'}},
    }}}},
    409:{'description':'Membership, invitation, or ownership conflict'},410:{'description':'Invitation expired'}})


def org_payload(org, member):
    return {'id':org.id, 'name':org.name, 'role':member.role, 'capabilities':capabilities(member)}


def invitation_payload(invite):
    return {'id':invite.id,'email':invite.email,'role':invite.role,'status':invite.status,
            'issuer_id':str(invite.issuer_id),'expires_at':utc_datetime(invite.expires_at)}


def manage_target(db, org, member, user, target_role):
    require_role(db, org, member, user, MANAGERS, 'membership.denied')
    if target_role == 'owner' or (target_role == 'admin' and member.role != 'owner'):
        denied(db, org.id, user, 'membership.denied', detail='Only the owner can manage admin access. Ownership changes require a transfer.')


def revoke_issuer_links(db, org, user, issuer):
    for invite in db.scalars(select(OrganisationInvitation).where(OrganisationInvitation.organisation_id == org.id,
        OrganisationInvitation.issuer_id == issuer.user_id, OrganisationInvitation.status == 'pending')).all():
        if not issuer.active or issuer.role not in MANAGERS or (invite.role == 'admin' and issuer.role != 'owner'):
            invite.status = 'revoked'
            audit(db, org.id, user, 'invitation.revoked', invite.id)


@router.get('', response_model=list[OrganisationRead])
def list_organisations(db: Session = Depends(get_db), user=Depends(current_user)):
    rows = db.execute(select(Organisation, Membership).join(Membership, Membership.organisation_id == Organisation.id)
        .where(Membership.user_id == user.id, Membership.active.is_(True)).order_by(Organisation.name, Organisation.id)).all()
    return [org_payload(org, member) for org, member in rows]


@router.post('', response_model=OrganisationRead, status_code=201, openapi_extra=MUTATION_DOCS)
def create_organisation(payload: OrganisationName, db: Session = Depends(get_db), user=Depends(current_user)):
    org = Organisation(id=str(uuid.uuid4()), name=payload.name)
    db.add(org); db.flush()
    member = Membership(id=str(uuid.uuid4()), organisation_id=org.id, user_id=user.id, role='owner', active=True)
    db.add(member); audit(db, org.id, user, 'organisation.created', org.id)
    result = org_payload(org, member); commit(db)
    return result


@router.get('/{organisation_id}', response_model=OrganisationRead)
def read_organisation(organisation_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    return org_payload(*organisation_access(db, organisation_id, user))


@router.patch('/{organisation_id}', response_model=OrganisationRead, openapi_extra=MUTATION_DOCS)
def rename_organisation(organisation_id: str, payload: OrganisationName, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    require_role(db, org, member, user, {'owner'}, 'organisation.rename.denied')
    org.name = payload.name; audit(db, org.id, user, 'organisation.renamed', org.id)
    result = org_payload(org, member); commit(db)
    return result


@router.get('/{organisation_id}/members', response_model=list[MembershipRead])
def list_members(organisation_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user)
    require_role(db, org, member, user, MANAGERS, 'membership.list.denied')
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id).where(Membership.organisation_id == org.id)
        .order_by(Membership.active.desc(), User.display_name)).all()
    return [{'id':m.id,'user_id':str(account.id),'display_name':account.display_name,'email':account.email,'role':m.role,'active':m.active} for m, account in rows]


def target_member(db, org, membership_id):
    target = db.scalar(select(Membership).where(Membership.organisation_id == org.id, Membership.id == membership_id)
        .execution_options(populate_existing=True))
    if target is None or not target.active: raise HTTPException(404, 'Active membership not found')
    return target


@router.patch('/{organisation_id}/members/{membership_id}', response_model=OrganisationRead, openapi_extra=MUTATION_DOCS)
def change_role(organisation_id: str, membership_id: str, payload: RoleChange, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    require_role(db, org, member, user, MANAGERS, 'membership.denied')
    target = target_member(db, org, membership_id)
    if target.role == 'owner': raise HTTPException(409, 'Transfer ownership instead of changing the owner role.')
    manage_target(db, org, member, user, target.role); manage_target(db, org, member, user, payload.role)
    target.role = payload.role; revoke_issuer_links(db, org, user, target)
    audit(db, org.id, user, 'membership.role_changed', target.id)
    result = org_payload(org, member); commit(db)
    return result


@router.delete('/{organisation_id}/members/{membership_id}', status_code=204, openapi_extra=MUTATION_DOCS)
def remove_member(organisation_id: str, membership_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    require_role(db, org, member, user, MANAGERS, 'membership.denied')
    target = target_member(db, org, membership_id)
    if target.role == 'owner': raise HTTPException(409, 'The owner must transfer ownership before leaving.')
    manage_target(db, org, member, user, target.role)
    target.active = False; revoke_issuer_links(db, org, user, target)
    audit(db, org.id, user, 'membership.removed', target.id); commit(db)


@router.post('/{organisation_id}/leave', status_code=204, openapi_extra=MUTATION_DOCS)
def leave_organisation(organisation_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    if member.role == 'owner': raise HTTPException(409, 'Transfer ownership before leaving the organisation.')
    member.active = False; revoke_issuer_links(db, org, user, member)
    audit(db, org.id, user, 'membership.left', member.id); commit(db)


@router.post('/{organisation_id}/ownership', response_model=OrganisationRead, openapi_extra=MUTATION_DOCS)
def transfer_ownership(organisation_id: str, payload: TransferOwnership, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    require_role(db, org, member, user, {'owner'}, 'ownership.transfer.denied')
    target = db.scalar(select(Membership).where(Membership.organisation_id == org.id, Membership.user_id == payload.user_id, Membership.active.is_(True)))
    if target is None: raise HTTPException(409, 'Choose an active organisation member.')
    if target.id != member.id:
        member.role = 'admin'; db.flush()
        target.role = 'owner'; revoke_issuer_links(db, org, user, member)
        audit(db, org.id, user, 'ownership.transferred', target.id)
    result = org_payload(org, member); commit(db)
    return result


@router.get('/{organisation_id}/invitations', response_model=list[InvitationRead])
def list_invitations(organisation_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user)
    require_role(db, org, member, user, MANAGERS, 'invitation.list.denied')
    return [invitation_payload(invite) for invite in db.scalars(select(OrganisationInvitation).where(OrganisationInvitation.organisation_id == org.id).order_by(OrganisationInvitation.expires_at.desc())).all()]


def issue_link(invite):
    token = secrets.token_urlsafe(32)
    invite.token_hash = hashlib.sha256(token.encode()).hexdigest()
    invite.expires_at = utc_now() + timedelta(days=7)
    return {'invitation':invitation_payload(invite), 'url':FRONTEND + '/organisations/invitations/accept#' + token}


@router.post('/{organisation_id}/invitations', response_model=InvitationLink, status_code=201, openapi_extra=MUTATION_DOCS)
def create_invitation(organisation_id: str, payload: InvitationCreate, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    manage_target(db, org, member, user, payload.role)
    email = str(payload.email).strip().casefold()
    existing = db.scalar(select(Membership.id).join(User, User.id == Membership.user_id).where(Membership.organisation_id == org.id, Membership.active.is_(True), func.lower(User.email) == email))
    if existing: raise HTTPException(409, 'This account is already a member; use member management to change its role.')
    for old in db.scalars(select(OrganisationInvitation).where(OrganisationInvitation.organisation_id == org.id, OrganisationInvitation.email == email, OrganisationInvitation.status == 'pending')).all():
        if utc_datetime(old.expires_at) > utc_now(): raise HTTPException(409, 'A pending invitation already exists. Regenerate or revoke it.')
        old.status = 'expired'
    db.flush()
    invite = OrganisationInvitation(id=str(uuid.uuid4()), organisation_id=org.id, issuer_id=user.id, email=email, role=payload.role, status='pending')
    result = issue_link(invite); db.add(invite)
    audit(db, org.id, user, 'invitation.created', invite.id); commit(db)
    return result


def managed_invitation(db, org, member, user, invitation_id):
    require_role(db, org, member, user, MANAGERS, 'invitation.denied')
    invite = db.scalar(select(OrganisationInvitation).where(OrganisationInvitation.id == invitation_id, OrganisationInvitation.organisation_id == org.id))
    if invite is None: raise HTTPException(404, 'Invitation not found')
    manage_target(db, org, member, user, invite.role)
    return invite


@router.post('/{organisation_id}/invitations/{invitation_id}/regenerate', response_model=InvitationLink, openapi_extra=MUTATION_DOCS)
def regenerate_invitation(organisation_id: str, invitation_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    invite = managed_invitation(db, org, member, user, invitation_id)
    if invite.status == 'accepted': raise HTTPException(409, 'Accepted invitations cannot be reused.')
    other = db.scalar(select(OrganisationInvitation.id).where(OrganisationInvitation.organisation_id == org.id, OrganisationInvitation.email == invite.email, OrganisationInvitation.status == 'pending', OrganisationInvitation.id != invite.id))
    if other: raise HTTPException(409, 'Another pending invitation exists for this email.')
    invite.status = 'pending'; invite.issuer_id = user.id
    result = issue_link(invite); audit(db, org.id, user, 'invitation.regenerated', invite.id); commit(db)
    return result


@router.delete('/{organisation_id}/invitations/{invitation_id}', status_code=204, openapi_extra=MUTATION_DOCS)
def revoke_invitation(organisation_id: str, invitation_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user, 'exclusive')
    invite = managed_invitation(db, org, member, user, invitation_id)
    if invite.status == 'accepted': raise HTTPException(409, 'Remove membership instead of revoking an accepted invitation.')
    invite.status = 'revoked'; audit(db, org.id, user, 'invitation.revoked', invite.id); commit(db)


def checked_invitation(db, token, user):
    invite = db.scalar(select(OrganisationInvitation).where(OrganisationInvitation.token_hash == hashlib.sha256(token.encode()).hexdigest()))
    if invite is None: raise HTTPException(404, 'Invitation unavailable')
    org = db.scalar(select(Organisation).where(Organisation.id == invite.organisation_id).with_for_update().execution_options(populate_existing=True))
    db.refresh(invite)
    if invite.email != user.email.strip().casefold():
        denied(db, org.id, user, 'invitation.email_mismatch', invite.id, detail='Sign in with the verified email this invitation was sent to.')
    member = db.scalar(select(Membership).where(Membership.organisation_id == org.id, Membership.user_id == user.id).execution_options(populate_existing=True))
    if invite.status == 'accepted':
        if invite.accepted_by == user.id and member and member.active: return org, invite, member
        raise HTTPException(409, 'This invitation has already been used. Ask for a new invitation if your membership ended.')
    if invite.status != 'pending': raise HTTPException(409, 'This invitation is no longer available.')
    if utc_datetime(invite.expires_at) <= utc_now(): raise HTTPException(410, 'This invitation has expired. Ask for a new link.')
    issuer = db.scalar(select(Membership).where(Membership.organisation_id == org.id, Membership.user_id == invite.issuer_id, Membership.active.is_(True)).execution_options(populate_existing=True))
    if issuer is None or issuer.role not in MANAGERS or (invite.role == 'admin' and issuer.role != 'owner'):
        raise HTTPException(409, 'This invitation is no longer available.')
    if member and member.active: raise HTTPException(409, 'You already belong to this organisation. An invitation cannot change your role.')
    return org, invite, member


@router.post('/invitations/preview', response_model=InvitationPreview, openapi_extra=MUTATION_DOCS)
def preview_invitation(payload: InvitationToken, db: Session = Depends(get_db), user=Depends(current_user)):
    org, invite, member = checked_invitation(db, payload.token, user)
    return {'organisation':{'id':org.id,'name':org.name,'role':member.role if member and member.active else invite.role,
        'capabilities':capabilities(member) if member and member.active else {}}, 'role':invite.role,'expires_at':utc_datetime(invite.expires_at),'accepted':invite.status == 'accepted'}


@router.post('/invitations/accept', response_model=OrganisationRead, openapi_extra=MUTATION_DOCS)
def accept_invitation(payload: InvitationToken, db: Session = Depends(get_db), user=Depends(current_user)):
    org, invite, member = checked_invitation(db, payload.token, user)
    if invite.status != 'accepted':
        if member is None:
            member = Membership(id=str(uuid.uuid4()), organisation_id=org.id, user_id=user.id, role=invite.role, active=True); db.add(member)
        else: member.active = True; member.role = invite.role
        invite.status = 'accepted'; invite.accepted_by = user.id
        audit(db, org.id, user, 'invitation.accepted', invite.id)
    result = org_payload(org, member); commit(db)
    return result


@router.get('/{organisation_id}/audit', response_model=AuditPage)
def read_audit(organisation_id: str, offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), user=Depends(current_user)):
    org, member = organisation_access(db, organisation_id, user)
    require_role(db, org, member, user, MANAGERS, 'audit.read.denied')
    condition = OrganisationAudit.organisation_id == org.id
    records = db.scalars(select(OrganisationAudit).where(condition).order_by(OrganisationAudit.created_at.desc(), OrganisationAudit.id).offset(offset).limit(limit)).all()
    return {'items':[{'id':r.id,'actor_id':str(r.actor_id),'action':r.action,'target_id':r.target_id,'outcome':r.outcome,'correlation_id':r.correlation_id,'created_at':utc_datetime(r.created_at)} for r in records],
        'total':db.scalar(select(func.count()).select_from(OrganisationAudit).where(condition)), 'offset':offset,'limit':limit}
