"""Organisation-scoped library; unpublished peer drafts never enter responses."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, exists, case
from sqlalchemy.orm import Session
from .auth import current_user
from .database import get_db
from .models import LibraryQuiz, QuizVersion, utc_datetime
from .permissions import organisation_access, require_role, AUTHORS, can_edit, denied, audit
from .library import commit, MUTATION_DOCS
from .library_service import owned_quiz, published_content, save_content, publish, quiz_payload, version_payload
from .library_schemas import CreateDraft, SaveDraft, VersionSummary, EventCreated
from .organisation_library_schemas import OrganisationQuizPage, OrganisationQuizRead, OrganisationPublication, OrganisationVersionRead
from .event_service import build_event, event_created_payload
from .schemas import QuizCreate

router = APIRouter(prefix='/api/organisations/{organisation_id}/quizzes', tags=['Organisation quiz library'], responses={
    401:{'description':'Verified sign-in required'},403:{'description':'Insufficient role or CSRF failure', 'content':{'application/json':{'example':{'detail':'Your role cannot perform this action.'}}}},
    404:{'description':'Resource unavailable in this organisation'},409:{'description':'Revision or publication conflict'},422:{'description':'Invalid draft or publication'}})


def quiz_access(db, organisation_id, user, quiz_id=None, write=False, edit=False):
    org, member = organisation_access(db, organisation_id, user, 'shared' if write else None)
    require_role(db, org, member, user, AUTHORS, 'quiz.access.denied', quiz_id)
    if quiz_id is None: return org, member, None
    query = select(LibraryQuiz).where(LibraryQuiz.id == quiz_id, LibraryQuiz.organisation_id == org.id)
    if write: query = query.with_for_update().execution_options(populate_existing=True)
    quiz = db.scalar(query)
    if quiz is None: raise HTTPException(404, 'Quiz not found')
    editable = can_edit(member, quiz, user)
    if edit and not editable: denied(db, org.id, user, 'quiz.edit.denied', quiz.id)
    if not editable and not db.scalar(select(QuizVersion.id).where(QuizVersion.quiz_id == quiz.id).limit(1)):
        denied(db, org.id, user, 'quiz.draft.denied', quiz.id, status=404, detail='Quiz not found')
    return org, member, quiz


def shared_quiz_payload(db, quiz, member, user):
    editable = can_edit(member, quiz, user)
    if editable:
        result = quiz_payload(db, quiz)
    else:
        latest = db.scalar(select(QuizVersion).where(QuizVersion.quiz_id == quiz.id).order_by(QuizVersion.number.desc()).limit(1))
        result = {'id':quiz.id,'title':latest.title,'questions':None,'revision':None,
            'question_count':len(latest.questions),'created_at':utc_datetime(quiz.created_at),
            'updated_at':utc_datetime(latest.published_at),'latest_version':latest.number,'has_unpublished_changes':None}
    return {**result, 'capabilities':{'can_edit_draft':editable,'can_publish':editable,'can_host':member.role in AUTHORS}}


@router.get('', response_model=OrganisationQuizPage)
def list_shared_quizzes(organisation_id: str, offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, _ = quiz_access(db, organisation_id, user)
    condition = LibraryQuiz.organisation_id == org.id
    visible_updated = LibraryQuiz.updated_at
    if member.role == 'instructor':
        condition = condition & ((LibraryQuiz.owner_id == user.id) | exists(select(QuizVersion.id).where(QuizVersion.quiz_id == LibraryQuiz.id)))
        published_at = select(func.max(QuizVersion.published_at)).where(QuizVersion.quiz_id == LibraryQuiz.id).correlate(LibraryQuiz).scalar_subquery()
        visible_updated = case((LibraryQuiz.owner_id == user.id, LibraryQuiz.updated_at), else_=published_at)
    rows = db.scalars(select(LibraryQuiz).where(condition).order_by(visible_updated.desc(), LibraryQuiz.id).offset(offset).limit(limit)).all()
    return {'items':[shared_quiz_payload(db, q, member, user) for q in rows], 'total':db.scalar(select(func.count()).select_from(LibraryQuiz).where(condition)), 'offset':offset,'limit':limit}


@router.post('', response_model=OrganisationPublication, status_code=201, openapi_extra=MUTATION_DOCS)
def create_shared_quiz(organisation_id: str, payload: CreateDraft, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, _ = quiz_access(db, organisation_id, user, write=True)
    validated = published_content(payload) if payload.publish else None
    quiz = LibraryQuiz(id=str(uuid.uuid4()), organisation_id=org.id, owner_id=user.id, title=payload.title, questions=[q.model_dump() for q in payload.questions])
    db.add(quiz); db.flush()
    version = publish(db, quiz, validated) if validated else None
    audit(db, org.id, user, 'quiz.published' if version else 'quiz.created', quiz.id)
    result = {'quiz':shared_quiz_payload(db, quiz, member, user),'version':version_payload(version) if version else None}; commit(db)
    return result


@router.post('/copy-personal/{quiz_id}', response_model=OrganisationQuizRead, status_code=201, openapi_extra=MUTATION_DOCS)
def copy_personal_quiz(organisation_id: str, quiz_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, _ = quiz_access(db, organisation_id, user, write=True)
    original = owned_quiz(db, quiz_id, user)
    import copy
    quiz = LibraryQuiz(id=str(uuid.uuid4()), organisation_id=org.id, owner_id=user.id, title=original.title, questions=copy.deepcopy(original.questions))
    db.add(quiz); db.flush(); audit(db, org.id, user, 'quiz.copied', quiz.id)
    result = shared_quiz_payload(db, quiz, member, user); commit(db)
    return result


@router.get('/{quiz_id}', response_model=OrganisationQuizRead)
def read_shared_quiz(organisation_id: str, quiz_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, quiz = quiz_access(db, organisation_id, user, quiz_id)
    return shared_quiz_payload(db, quiz, member, user)


@router.put('/{quiz_id}', response_model=OrganisationQuizRead, openapi_extra=MUTATION_DOCS)
def save_shared_quiz(organisation_id: str, quiz_id: str, payload: SaveDraft, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, quiz = quiz_access(db, organisation_id, user, quiz_id, write=True, edit=True)
    save_content(db, quiz, payload); audit(db, org.id, user, 'quiz.saved', quiz.id)
    result = shared_quiz_payload(db, quiz, member, user); commit(db)
    return result


@router.post('/{quiz_id}/publish', response_model=OrganisationPublication, openapi_extra=MUTATION_DOCS)
def publish_shared_quiz(organisation_id: str, quiz_id: str, payload: SaveDraft, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, quiz = quiz_access(db, organisation_id, user, quiz_id, write=True, edit=True)
    if payload.revision != quiz.revision: raise HTTPException(409, 'This draft changed. Reload before publishing; your local edits are still here.')
    validated = published_content(payload); save_content(db, quiz, payload)
    version = publish(db, quiz, validated); audit(db, org.id, user, 'quiz.published', quiz.id)
    result = {'quiz':shared_quiz_payload(db, quiz, member, user), 'version':version_payload(version)}; commit(db)
    return result


@router.get('/{quiz_id}/versions', response_model=list[VersionSummary])
def shared_versions(organisation_id: str, quiz_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    quiz_access(db, organisation_id, user, quiz_id)
    return [version_payload(v) for v in db.scalars(select(QuizVersion).where(QuizVersion.quiz_id == quiz_id).order_by(QuizVersion.number.desc())).all()]


def shared_version(db, quiz_id, number):
    version = db.scalar(select(QuizVersion).where(QuizVersion.quiz_id == quiz_id, QuizVersion.number == number))
    if version is None: raise HTTPException(404, 'Version not found')
    return version


@router.get('/{quiz_id}/versions/{number}', response_model=OrganisationVersionRead)
def read_shared_version(organisation_id: str, quiz_id: str, number: int, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, quiz = quiz_access(db, organisation_id, user, quiz_id)
    return {**version_payload(shared_version(db, quiz_id, number)), 'capabilities':shared_quiz_payload(db, quiz, member, user)['capabilities']}


@router.post('/{quiz_id}/versions/{number}/events', response_model=EventCreated, status_code=201, openapi_extra=MUTATION_DOCS)
def host_shared_version(organisation_id: str, quiz_id: str, number: int, db: Session = Depends(get_db), user=Depends(current_user)):
    org, member, quiz = quiz_access(db, organisation_id, user, quiz_id, write=True)
    version = shared_version(db, quiz_id, number)
    event = build_event(QuizCreate(title=version.title, questions=version.questions), user.id, version.id)
    event.organisation_id = org.id
    db.add(event); db.flush(); audit(db, org.id, user, 'event.created', event.id)
    result = event_created_payload(event); commit(db)
    return result
