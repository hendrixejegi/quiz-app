from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from .schemas import QuestionCreate


class DraftQuestion(BaseModel):
    prompt: str = Field(default='', max_length=500)
    choices: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=lambda: ['', '', '', ''], max_length=4)
    correct_choice_index: int | None = Field(default=0, ge=0, le=3)
    time_limit_seconds: int = Field(default=20, ge=5, le=300)

class DraftContent(BaseModel):
    title: str = Field(default='', max_length=100)
    questions: list[DraftQuestion] = Field(default_factory=list, max_length=20)


class CreateDraft(DraftContent):
    publish: bool = False
    model_config = ConfigDict(json_schema_extra={'examples': [{'title': 'Python basics', 'questions': [{'prompt': 'Define a function with?', 'choices': ['def', 'class', '', ''], 'correct_choice_index': 0, 'time_limit_seconds': 20}], 'publish': False}]})


class SaveDraft(DraftContent):
    title: str = Field(max_length=100)
    questions: list[DraftQuestion] = Field(max_length=20)
    revision: int = Field(ge=1, description='Expected saved revision; stale writes return 409.')


class VersionSummary(BaseModel):
    number: int
    draft_revision: int
    title: str
    question_count: int
    published_at: datetime


class VersionRead(VersionSummary):
    questions: list[QuestionCreate]


class QuizSummary(BaseModel):
    id: str
    title: str
    revision: int
    question_count: int
    created_at: datetime
    updated_at: datetime
    latest_version: int | None
    has_unpublished_changes: bool


class QuizRead(QuizSummary):
    questions: list[DraftQuestion]


class QuizPage(BaseModel):
    items: list[QuizSummary]
    total: int
    offset: int
    limit: int


class Publication(BaseModel):
    quiz: QuizRead
    version: VersionRead | None = None


class EventCreated(BaseModel):
    event_id: str
    title: str
    join_code: str
    participant_url: str
    host_url: str


class LibraryError(BaseModel):
    detail: str | list[dict]
