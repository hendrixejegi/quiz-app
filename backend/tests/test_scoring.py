import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.main import participant_snapshot, score_rows, submit_answer
from app.models import Answer, Choice, Event, Participant, Question


@pytest.fixture
def game():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db: Session = factory()
    event = Event(id="event-1", title="Test quiz", join_code="ABCDE", host_token_hash="host-hash", state="active")
    questions = []
    for position, prompt in enumerate(("First?", "Second?")):
        question = Question(position=position, prompt=prompt, time_limit_seconds=20, correct_choice_index=0)
        question.choices = [Choice(position=0, text="Correct"), Choice(position=1, text="Wrong")]
        questions.append(question)
        event.questions.append(question)
    players = [
        Participant(id=f"player-{i}", event_id=event.id, private_name=f"Player {i}", display_name=name, reconnect_token_hash=f"token-{i}")
        for i, name in enumerate(("Ari", "Bea", "Cal"), start=1)
    ]
    event.participants.extend(players)
    db.add(event)
    db.commit()
    db.refresh(event)
    yield db, event, players
    db.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_correct_and_incorrect_answers_are_saved_and_ranked(game):
    db, event, players = game
    correct = submit_answer(db, event, players[0], 0, 0)
    wrong = submit_answer(db, event, players[1], 0, 1)
    assert correct["type"] == "answer_accepted"
    assert correct["points"] == 100
    assert correct["rank"] == 1
    assert wrong["points"] == 0
    assert db.query(Answer).count() == 2
    assert [(row["display_name"], row["points"], row["rank"]) for row in score_rows(db, event)] == [
        ("Ari", 100, 1), ("Bea", 0, 2), ("Cal", 0, 2),
    ]


def test_one_answer_per_question_and_question_order_are_enforced(game):
    db, event, players = game
    assert submit_answer(db, event, players[0], 1, 0)["type"] == "answer_rejected"
    assert submit_answer(db, event, players[0], 0, 0)["type"] == "answer_accepted"
    duplicate = submit_answer(db, event, players[0], 0, 1)
    assert duplicate["type"] == "answer_rejected"
    assert submit_answer(db, event, players[0], 1, 1)["type"] == "answer_accepted"
    assert score_rows(db, event)[0]["points"] == 100


def test_participant_payload_hides_correct_choices_until_final_answer(game):
    db, event, players = game
    state = participant_snapshot(db, event, players[0].id)
    assert "correct_choice_index" not in state["questions"][0]
    assert "answer_key" not in state
    first = submit_answer(db, event, players[0], 0, 0)
    assert "answer_key" not in first
    final = submit_answer(db, event, players[0], 1, 1)
    assert final["answer_key"] == [
        {"question_index": 0, "correct_choice_index": 0, "answer_text": "Correct"},
        {"question_index": 1, "correct_choice_index": 0, "answer_text": "Correct"},
    ]


def test_answers_are_rejected_before_quiz_starts(game):
    db, event, players = game
    event.state = "lobby"
    db.commit()
    assert submit_answer(db, event, players[0], 0, 0)["type"] == "answer_rejected"
