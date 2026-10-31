"""Draft updates and publication share one transaction and an owner row lock."""
import uuid
from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from .models import LibraryQuiz, QuizVersion, utc_now, utc_datetime
from .schemas import QuizCreate


def owned_quiz(db, quiz_id, user, lock=False):
    query = select(LibraryQuiz).where(LibraryQuiz.id == quiz_id, LibraryQuiz.owner_id == user.id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    quiz = db.scalar(query)
    if quiz is None:
        raise HTTPException(404, 'Quiz not found')
    return quiz


def published_content(content):
    if not content.title.strip():
        raise HTTPException(422, 'Add a quiz title before publishing.')
    if not content.questions:
        raise HTTPException(422, 'Add at least one question before publishing.')
    questions = []
    for index, question in enumerate(content.questions, 1):
        if not question.prompt.strip():
            raise HTTPException(422, f'Question {index}: add a question prompt.')
        filled = [(i, text.strip()) for i, text in enumerate(question.choices) if text.strip()]
        if len(filled) < 2:
            raise HTTPException(422, f'Question {index}: fill in at least two answer choices.')
        correct = next((i for i, (original, _) in enumerate(filled) if original == question.correct_choice_index), None)
        if correct is None:
            raise HTTPException(422, f'Question {index}: choose a correct answer that has text.')
        questions.append({**question.model_dump(), 'choices': [text for _, text in filled], 'correct_choice_index': correct})
    return QuizCreate(title=content.title, questions=questions)


def save_content(db, quiz, payload):
    if payload.revision != quiz.revision:
        raise HTTPException(409, 'This draft changed in another tab. Your edits are still here; reload the saved draft before trying again.')
    questions = [question.model_dump() for question in payload.questions]
    if quiz.title == payload.title and quiz.questions == questions:
        return
    # Compare-and-swap also protects SQLite, where FOR UPDATE is unavailable.
    result = db.execute(update(LibraryQuiz).where(LibraryQuiz.id == quiz.id, LibraryQuiz.revision == payload.revision)
        .values(title=payload.title, questions=questions, revision=payload.revision + 1, updated_at=utc_now())
        .execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise HTTPException(409, 'This draft changed in another tab. Reload the saved draft.')
    db.refresh(quiz)


def publish(db, quiz, validated):
    version = db.scalar(select(QuizVersion).where(QuizVersion.quiz_id == quiz.id, QuizVersion.draft_revision == quiz.revision))
    if version is not None:
        return version
    number = (db.scalar(select(func.max(QuizVersion.number)).where(QuizVersion.quiz_id == quiz.id)) or 0) + 1
    version = QuizVersion(id=str(uuid.uuid4()), quiz_id=quiz.id, number=number, draft_revision=quiz.revision,
                          title=validated.title, questions=[q.model_dump() for q in validated.questions])
    db.add(version)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Another publication was saved. Reload before publishing again.') from None
    return version


def version_payload(version):
    return {'number': version.number, 'draft_revision': version.draft_revision, 'title': version.title,
            'question_count': len(version.questions), 'published_at': utc_datetime(version.published_at), 'questions': version.questions}


def quiz_payload(db, quiz):
    latest = db.scalar(select(QuizVersion).where(QuizVersion.quiz_id == quiz.id).order_by(QuizVersion.number.desc()).limit(1))
    return {'id': quiz.id, 'title': quiz.title, 'questions': quiz.questions, 'revision': quiz.revision,
            'question_count': len(quiz.questions), 'created_at': utc_datetime(quiz.created_at), 'updated_at': utc_datetime(quiz.updated_at),
            'latest_version': latest.number if latest else None,
            'has_unpublished_changes': latest is None or latest.draft_revision != quiz.revision}
