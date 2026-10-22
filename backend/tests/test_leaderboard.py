import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.main import (
    POINTS_PER_CORRECT_ANSWER,
    RESULTS_INTERVAL_SECONDS,
    advance_expired_event,
    can_answer_question,
    leaderboard_payload,
    participant_review,
)
from app.models import Choice, Event, Participant, ParticipantAnswer, Question


class LeaderboardTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.now = datetime.now(timezone.utc)
        self.event = Event(
            id="event-1", title="Quiz", join_code="QUIZ123", host_token_hash="host", state="active",
            current_question_position=0, timer_deadline=self.now + timedelta(seconds=20),
        )
        self.q1 = Question(position=0, prompt="First?", time_limit_seconds=20, correct_choice_index=0)
        self.q1.choices = [Choice(position=0, text="Right"), Choice(position=1, text="Wrong")]
        self.q2 = Question(position=1, prompt="Second?", time_limit_seconds=10, correct_choice_index=1)
        self.q2.choices = [Choice(position=0, text="No"), Choice(position=1, text="Yes")]
        self.event.questions = [self.q1, self.q2]
        self.p1 = Participant(id="p1", event=self.event, private_name="One", display_name="One", reconnect_token_hash="1", joined_at=self.now - timedelta(minutes=2))
        self.p2 = Participant(id="p2", event=self.event, private_name="Two", display_name="Two", reconnect_token_hash="2", joined_at=self.now - timedelta(minutes=1))
        self.p3 = Participant(id="p3", event=self.event, private_name="Three", display_name="Three", reconnect_token_hash="3", joined_at=self.now)
        self.late = Participant(id="late", event=self.event, private_name="Late", display_name="Late", reconnect_token_hash="4", joined_at=self.now + timedelta(seconds=1))
        self.db.add(self.event)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_fixed_points_shared_ties_and_join_order(self):
        self.db.add_all([
            ParticipantAnswer(participant_id="p1", question_id=self.q1.id, choice_index=0, submitted_at=self.now),
            ParticipantAnswer(participant_id="p2", question_id=self.q1.id, choice_index=0, submitted_at=self.now),
            ParticipantAnswer(participant_id="p3", question_id=self.q1.id, choice_index=1, submitted_at=self.now),
        ])
        self.db.flush()

        standings = leaderboard_payload(self.db, self.event)

        self.assertEqual(standings[:2], [
            {"rank": 1, "display_name": "One", "points": POINTS_PER_CORRECT_ANSWER},
            {"rank": 1, "display_name": "Two", "points": POINTS_PER_CORRECT_ANSWER},
        ])
        self.assertEqual(standings[2:], [
            {"rank": 3, "display_name": "Three", "points": 0},
            {"rank": 3, "display_name": "Late", "points": 0},
        ])

    def test_final_review_marks_correct_incorrect_and_unanswered(self):
        self.db.add_all([
            ParticipantAnswer(participant_id="p1", question_id=self.q1.id, choice_index=0, submitted_at=self.now),
            ParticipantAnswer(participant_id="p1", question_id=self.q2.id, choice_index=0, submitted_at=self.now),
        ])
        self.db.flush()

        review = participant_review(self.db, self.event, self.p1)

        self.assertEqual([item["outcome"] for item in review], ["correct", "incorrect"])
        self.assertEqual(review[0]["correct_answer"], "Right")
        self.assertEqual(review[1]["selected_answer"], "No")
        self.assertEqual(participant_review(self.db, self.event, self.p3)[1]["outcome"], "unanswered")

    def test_late_joiner_can_answer_from_the_next_question(self):
        self.assertTrue(can_answer_question(self.event, self.p3, self.q1))
        self.assertFalse(can_answer_question(self.event, self.late, self.q1))

        self.event.current_question_position = 1
        self.event.timer_deadline = self.now + timedelta(seconds=2 + self.q2.time_limit_seconds)
        self.assertTrue(can_answer_question(self.event, self.late, self.q2))

    def test_question_results_interval_and_automatic_finish(self):
        first_deadline = self.event.timer_deadline

        self.assertTrue(advance_expired_event(self.db, self.event, first_deadline))
        self.assertEqual(self.event.state, "results")
        self.assertEqual(self.event.timer_deadline, first_deadline + timedelta(seconds=RESULTS_INTERVAL_SECONDS))

        second_question_deadline = self.event.timer_deadline + timedelta(seconds=self.q2.time_limit_seconds)
        self.assertTrue(advance_expired_event(self.db, self.event, second_question_deadline))
        self.assertEqual(self.event.state, "results")

        self.assertTrue(advance_expired_event(
            self.db, self.event, second_question_deadline + timedelta(seconds=RESULTS_INTERVAL_SECONDS)
        ))
        self.assertEqual(self.event.state, "completed")


if __name__ == "__main__":
    unittest.main()
