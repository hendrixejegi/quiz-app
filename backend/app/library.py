"""Private personal quiz library. Synchronous routes run in FastAPI's thread pool."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .auth import current_user
from .database import get_db
from .event_service import build_event, event_created_payload
from .library_schemas import CreateDraft, SaveDraft, QuizRead, QuizPage, VersionSummary, VersionRead, Publication, EventCreated, LibraryError
from .library_service import owned_quiz, published_content, save_content, publish, quiz_payload, version_payload
from .models import LibraryQuiz, QuizVersion
from .schemas import QuizCreate

router = APIRouter(prefix='/api/library/quizzes', tags=['Personal quiz library'], responses={
    401: {'description': 'A verified account session is required.', 'model': LibraryError},
    403: {'description': 'Account verification or CSRF/origin validation failed.', 'model': LibraryError},
    404: {'description': 'Resource does not exist or belongs to another account.', 'model': LibraryError},
    409: {'description': 'Stale draft revision or competing publication; reload before retrying.', 'model': LibraryError},
    422: {'description': 'Invalid draft limits or incomplete publication content.', 'model': LibraryError},
})

MUTATION_DOCS = {'parameters': [
    {'name': 'X-CSRF-Token', 'in': 'header', 'required': True, 'schema': {'type': 'string'},
     'description': 'Token from GET /api/auth/csrf; send its matching cookie with credentials.'},
    {'name': 'Origin', 'in': 'header', 'required': True, 'schema': {'type': 'string'},
     'description': 'An exact origin configured in FRONTEND_ORIGINS.'},
]}


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'A competing update was saved. Reload the quiz before trying again.') from None


@router.get('', response_model=QuizPage, summary='List your private quizzes')
def list_quizzes(offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
                 db: Session = Depends(get_db), user=Depends(current_user)):
    """Draft titles, revision status and latest published versions; never another owner's content."""
    condition = (LibraryQuiz.owner_id == user.id) & LibraryQuiz.organisation_id.is_(None)
    total = db.scalar(select(func.count()).select_from(LibraryQuiz).where(condition))
    quizzes = db.scalars(select(LibraryQuiz).where(condition).order_by(LibraryQuiz.updated_at.desc(), LibraryQuiz.id).offset(offset).limit(limit)).all()
    return {'items': [quiz_payload(db, quiz) for quiz in quizzes], 'total': total, 'offset': offset, 'limit': limit}


@router.post('', response_model=Publication, status_code=201, summary='Save a new draft, optionally publishing atomically', openapi_extra=MUTATION_DOCS)
def create_draft(payload: CreateDraft, db: Session = Depends(get_db), user=Depends(current_user)):
    """Incomplete content is allowed unless publish=true. Publication is private and does not create a live room."""
    validated = published_content(payload) if payload.publish else None
    quiz = LibraryQuiz(id=str(uuid.uuid4()), owner_id=user.id, title=payload.title,
                       questions=[q.model_dump() for q in payload.questions])
    db.add(quiz)
    db.flush()
    version = publish(db, quiz, validated) if validated else None
    result = {'quiz': quiz_payload(db, quiz), 'version': version_payload(version) if version else None}
    commit(db)
    return result


@router.get('/{quiz_id}', response_model=QuizRead, summary='Read your saved draft')
def read_quiz(quiz_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    return quiz_payload(db, owned_quiz(db, quiz_id, user))


@router.put('/{quiz_id}', response_model=QuizRead, summary='Save unfinished draft content with revision protection', openapi_extra=MUTATION_DOCS)
def update_draft(quiz_id: str, payload: SaveDraft, db: Session = Depends(get_db), user=Depends(current_user)):
    quiz = owned_quiz(db, quiz_id, user, lock=True)
    save_content(db, quiz, payload)
    result = quiz_payload(db, quiz)
    commit(db)
    return result


@router.post('/{quiz_id}/publish', response_model=Publication, summary='Save and publish a numbered immutable version', openapi_extra=MUTATION_DOCS)
def publish_draft(quiz_id: str, payload: SaveDraft, db: Session = Depends(get_db), user=Depends(current_user)):
    """Validates before saving. Repeating unchanged publication returns the same version. Stale revisions return 409."""
    quiz = owned_quiz(db, quiz_id, user, lock=True)
    if payload.revision != quiz.revision:
        raise HTTPException(409, 'This draft changed in another tab. Reload the saved draft; your local edits have not been saved.')
    validated = published_content(payload)
    save_content(db, quiz, payload)
    version = publish(db, quiz, validated)
    result = {'quiz': quiz_payload(db, quiz), 'version': version_payload(version)}
    commit(db)
    return result


@router.get('/{quiz_id}/versions', response_model=list[VersionSummary], summary='List your published version history')
def list_versions(quiz_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    owned_quiz(db, quiz_id, user)
    return [version_payload(v) for v in db.scalars(select(QuizVersion).where(QuizVersion.quiz_id == quiz_id).order_by(QuizVersion.number.desc())).all()]


def owned_version(db, quiz_id, number, user):
    owned_quiz(db, quiz_id, user)
    version = db.scalar(select(QuizVersion).where(QuizVersion.quiz_id == quiz_id, QuizVersion.number == number))
    if version is None:
        raise HTTPException(404, 'Published version not found')
    return version


@router.get('/{quiz_id}/versions/{number}', response_model=VersionRead, summary='Preview an immutable version, including correct answers')
def read_version(quiz_id: str, number: int, db: Session = Depends(get_db), user=Depends(current_user)):
    return version_payload(owned_version(db, quiz_id, number, user))


@router.post('/{quiz_id}/versions/{number}/events', response_model=EventCreated, status_code=201, summary='Host this exact published version in a fresh lobby', openapi_extra=MUTATION_DOCS)
def host_version(quiz_id: str, number: int, db: Session = Depends(get_db), user=Depends(current_user)):
    """Copies the version into event records. Subsequent edits and event deletion do not alter the library version."""
    version = owned_version(db, quiz_id, number, user)
    event = build_event(QuizCreate(title=version.title, questions=version.questions), user.id, version.id)
    db.add(event)
    db.flush()
    result = event_created_payload(event)
    commit(db)
    return result
