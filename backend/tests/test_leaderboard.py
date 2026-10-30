import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.main import (
    POINTS_PER_CORRECT_ANSWER,
    RESULTS_INTERVAL_SECONDS,
    advance_expired_event,
    can_answer_question,
    get_participant_event_state,
    leaderboard_payload,
    participant_review,
    question_results_feedback,
    token_hash,
    utc_datetime,
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
        self.p1 = Participant(id="p1", event=self.event, private_name="One", display_name="One", reconnect_token_hash=token_hash("1"), joined_at=self.now - timedelta(minutes=2))
        self.p2 = Participant(id="p2", event=self.event, private_name="Two", display_name="Two", reconnect_token_hash=token_hash("2"), joined_at=self.now - timedelta(minutes=1))
        self.p3 = Participant(id="p3", event=self.event, private_name="Three", display_name="Three", reconnect_token_hash=token_hash("3"), joined_at=self.now)
        self.late = Participant(id="late", event=self.event, private_name="Late", display_name="Late", reconnect_token_hash=token_hash("4"), joined_at=self.now + timedelta(seconds=1))
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

    def test_question_feedback_outcomes_points_and_ineligible_joiner(self):
        self.event.state = "results"
        self.event.timer_deadline = self.now + timedelta(
            seconds=self.q1.time_limit_seconds + RESULTS_INTERVAL_SECONDS
        )
        answers = [
            ParticipantAnswer(participant_id="p1", question_id=self.q1.id, choice_index=0, submitted_at=self.now),
            ParticipantAnswer(participant_id="p2", question_id=self.q1.id, choice_index=1, submitted_at=self.now),
        ]
        self.db.add_all(answers)
        self.db.flush()
        standings = leaderboard_payload(self.db, self.event)
        ranks = {row["display_name"]: row["rank"] for row in standings}
        answer_by_participant = {"p1": answers[0], "p2": answers[1]}

        correct = question_results_feedback(self.db, self.event, self.p1, self.q1, answer_by_participant["p1"], ranks["One"])
        incorrect = question_results_feedback(self.db, self.event, self.p2, self.q1, answer_by_participant["p2"], ranks["Two"])
        unanswered = question_results_feedback(self.db, self.event, self.p3, self.q1, None, ranks["Three"])
        not_eligible = question_results_feedback(self.db, self.event, self.late, self.q1, None, ranks["Late"])

        self.assertEqual((correct["outcome"], correct["points_awarded"], correct["rank_change"]), ("correct", 100, 0))
        self.assertEqual((incorrect["outcome"], incorrect["points_awarded"]), ("incorrect", 0))
        self.assertEqual((unanswered["outcome"], unanswered["points_awarded"]), ("unanswered", 0))
        self.assertEqual((not_eligible["outcome"], not_eligible["points_awarded"], not_eligible["rank_change"]), ("not_eligible", 0, "new"))

    def test_question_feedback_rank_movement_and_shared_ranks(self):
        self.event.current_question_position = 1
        self.event.state = "results"
        question_two_start = self.now + timedelta(seconds=2)
        self.event.timer_deadline = question_two_start + timedelta(
            seconds=self.q2.time_limit_seconds + RESULTS_INTERVAL_SECONDS
        )
        self.db.add_all([
            ParticipantAnswer(participant_id="p1", question_id=self.q1.id, choice_index=0, submitted_at=self.now),
            ParticipantAnswer(participant_id="p2", question_id=self.q1.id, choice_index=0, submitted_at=self.now),
            ParticipantAnswer(participant_id="p3", question_id=self.q1.id, choice_index=1, submitted_at=self.now),
            ParticipantAnswer(participant_id="p3", question_id=self.q2.id, choice_index=1, submitted_at=self.now + timedelta(seconds=3)),
        ])
        self.db.flush()
        current_ranking = leaderboard_payload(self.db, self.event)
        p3_rank = next(row["rank"] for row in current_ranking if row["display_name"] == "Three")

        feedback = question_results_feedback(self.db, self.event, self.p3, self.q2, self.db.scalar(
            select(ParticipantAnswer).where(
                ParticipantAnswer.participant_id == "p3", ParticipantAnswer.question_id == self.q2.id
            )
        ), p3_rank)

        self.assertEqual(feedback["rank_before"], 3)
        self.assertEqual(feedback["rank_change"], 2)
        self.assertEqual(p3_rank, 1)

    def test_participant_state_only_includes_feedback_during_results(self):
        active_state = get_participant_event_state("QUIZ123", "Bearer 1", self.db)
        self.assertEqual(active_state["state"], "active")
        self.assertNotIn("leaderboard_top3", active_state)
        self.assertNotIn("question_feedback", active_state)

        self.event.state = "results"
        self.event.timer_deadline = self.now + timedelta(
            seconds=self.q1.time_limit_seconds + RESULTS_INTERVAL_SECONDS
        )
        results_state = get_participant_event_state("QUIZ123", "Bearer 1", self.db)
        self.assertEqual(results_state["question_feedback"]["outcome"], "unanswered")
        self.assertEqual(results_state["question_feedback"]["points_awarded"], 0)
        self.assertIn("leaderboard_top3", results_state)

        self.event.state = "completed"
        self.event.current_question_position = None
        self.event.timer_deadline = None
        final_state = get_participant_event_state("QUIZ123", "Bearer 1", self.db)
        self.assertIn("leaderboard", final_state)
        self.assertIn("answer_review", final_state)
        self.assertNotIn("question_feedback", final_state)

    def test_question_results_interval_and_automatic_finish(self):
        self.db.commit()
        first_deadline = utc_datetime(self.event.timer_deadline)

        self.assertTrue(advance_expired_event(self.db, self.event, first_deadline))
        self.assertEqual(self.event.state, "results")
        self.assertEqual(utc_datetime(self.event.timer_deadline), first_deadline + timedelta(seconds=RESULTS_INTERVAL_SECONDS))

        second_question_deadline = self.event.timer_deadline + timedelta(seconds=self.q2.time_limit_seconds)
        self.assertTrue(advance_expired_event(self.db, self.event, second_question_deadline))
        self.assertEqual(self.event.state, "results")
        self.assertEqual(utc_datetime(self.event.timer_deadline), utc_datetime(second_question_deadline) + timedelta(seconds=5))

        self.assertTrue(advance_expired_event(
            self.db, self.event, second_question_deadline + timedelta(seconds=RESULTS_INTERVAL_SECONDS)
        ))
        self.assertEqual(self.event.state, "completed")

    def test_question_start_microsecond_boundaries_in_active_and_results(self):
        for state in ("active", "results"):
            self.event.state = state
            self.event.timer_deadline = self.now + timedelta(seconds=20 + (5 if state == "results" else 0))
            for offset, expected in ((-1, True), (0, True), (1, False)):
                self.p3.joined_at = self.now + timedelta(microseconds=offset)
                self.assertEqual(can_answer_question(self.event, self.p3, self.q1), expected)

    def test_delayed_advancement_preserves_exact_deadlines_and_finishes(self):
        self.db.commit()
        first = utc_datetime(self.event.timer_deadline)
        # SQLite returns naive values; injected naive UTC must mean the same instant.
        advance_expired_event(self.db, self.event, (first + timedelta(seconds=5)).replace(tzinfo=None))
        self.assertEqual(self.event.state, "active")
        self.assertEqual(self.event.current_question_position, 1)
        self.assertEqual(utc_datetime(self.event.timer_deadline), first + timedelta(seconds=15))
        self.assertEqual((utc_datetime(self.event.timer_deadline) - first).total_seconds(), 15)
        advance_expired_event(self.db, self.event, first + timedelta(minutes=10))
        self.assertEqual(self.event.state, "completed")
        self.assertIsNone(self.event.timer_deadline)

    def test_stale_timer_cannot_overwrite_closed_or_recreate_deleted_event(self):
        self.db.commit()
        with Session(self.engine) as other:
            row = other.get(Event, self.event.id)
            row.state = "closed"
            other.commit()
        self.assertFalse(advance_expired_event(self.db, self.event, self.now + timedelta(hours=1)))
        self.assertEqual(self.event.state, "closed")
        with Session(self.engine) as other:
            other.delete(other.get(Event, self.event.id)); other.commit()
        self.assertFalse(advance_expired_event(self.db, self.event, self.now + timedelta(hours=1)))
        with Session(self.engine) as other:
            self.assertIsNone(other.get(Event, "event-1"))


if __name__ == "__main__":
    unittest.main()
