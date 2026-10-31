"""Creation shared by quick-launch quizzes and immutable library versions."""
import hashlib
import secrets
import uuid
from .models import Event, Question, Choice


def build_event(payload, owner_id, source_version_id=None):
    event = Event(id=str(uuid.uuid4()), owner_id=str(owner_id), source_version_id=source_version_id,
                  title=payload.title, join_code=secrets.token_urlsafe(5).replace('-', '').replace('_', '').upper()[:7],
                  host_token_hash=hashlib.sha256(secrets.token_urlsafe(32).encode()).hexdigest())
    event.questions = [Question(position=index, prompt=q.prompt, time_limit_seconds=q.time_limit_seconds,
        correct_choice_index=q.correct_choice_index,
        choices=[Choice(position=i, text=value) for i, value in enumerate(q.choices)])
        for index, q in enumerate(payload.questions)]
    return event


def event_created_payload(event):
    return {'event_id': event.id, 'title': event.title, 'join_code': event.join_code,
            'participant_url': f'/?join={event.join_code}', 'host_url': f'/host/{event.id}'}
