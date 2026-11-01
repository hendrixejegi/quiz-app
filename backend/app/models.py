from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, JSON, Boolean, Index, text
from fastapi_users_db_sqlalchemy.generics import GUID
import uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    organisation_id: Mapped[str | None] = mapped_column(ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=True, index=True)
    source_version_id: Mapped[str | None] = mapped_column(ForeignKey("quiz_versions.id", ondelete="RESTRICT"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    join_code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    host_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(20), default="lobby", nullable=False)
    current_question_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timer_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    questions: Mapped[list["Question"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Question.position"
    )
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Participant.joined_at"
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(String(500), nullable=False)
    time_limit_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_choice_index: Mapped[int] = mapped_column(Integer, nullable=False)
    choices: Mapped[list["Choice"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", order_by="Choice.position"
    )
    event: Mapped[Event] = relationship(back_populates="questions")


class Choice(Base):
    __tablename__ = "choices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(String(200), nullable=False)
    question: Mapped[Question] = relationship(back_populates="choices")


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("event_id", "display_name", name="uq_event_display_name"), UniqueConstraint("event_id", "user_id", name="uq_event_participant_account"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("user.id"), nullable=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    private_name: Mapped[str] = mapped_column(String(80), nullable=False)
    display_name: Mapped[str] = mapped_column(String(32), nullable=False)
    reconnect_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    event: Mapped[Event] = relationship(back_populates="participants")


class ParticipantAnswer(Base):
    __tablename__ = "participant_answers"
    # PostgreSQL backs a named unique constraint with a schema-wide index.
    # Keep the index name table-specific to avoid collisions with older schemas.
    __table_args__ = (
        UniqueConstraint(
            "participant_id",
            "question_id",
            name="uq_participant_answers_participant_question",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    choice_index: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class LibraryQuiz(Base):
    __tablename__ = "library_quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("user.id"), nullable=False, index=True)
    organisation_id: Mapped[str | None] = mapped_column(ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    questions: Mapped[list] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class QuizVersion(Base):
    __tablename__ = "quiz_versions"
    __table_args__ = (
        UniqueConstraint("quiz_id", "number", name="uq_quiz_version_number"),
        UniqueConstraint("quiz_id", "draft_revision", name="uq_quiz_version_revision"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    quiz_id: Mapped[str] = mapped_column(ForeignKey("library_quizzes.id", ondelete="RESTRICT"), nullable=False, index=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    draft_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    questions: Mapped[list] = mapped_column(JSON, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Organisation(Base):
    __tablename__ = "organisations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Membership(Base):
    __tablename__ = "organisation_memberships"
    __table_args__ = (
        UniqueConstraint("organisation_id", "user_id", name="uq_organisation_member"),
        Index("uq_organisation_owner", "organisation_id", unique=True,
              postgresql_where=text("role = 'owner' AND active = true"),
              sqlite_where=text("role = 'owner' AND active = 1")),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("user.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class OrganisationInvitation(Base):
    __tablename__ = "organisation_invitations"
    __table_args__ = (Index("uq_pending_organisation_email", "organisation_id", "email", unique=True,
        postgresql_where=text("status = 'pending'"), sqlite_where=text("status = 'pending'")),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True)
    issuer_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("user.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_by: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("user.id"), nullable=True)


class OrganisationAudit(Base):
    __tablename__ = "organisation_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("user.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
