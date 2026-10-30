export default function QuestionFeedback({ feedback }) {
  if (!feedback) return null;
  const outcomeLabels = {
    correct: 'Correct',
    incorrect: 'Incorrect',
    unanswered: 'Unanswered',
    not_eligible: 'Not eligible',
  };
  const movement =
    feedback.rank_change === 'new'
      ? 'New to the leaderboard'
      : feedback.rank_change > 0
        ? `Up ${feedback.rank_change} ${feedback.rank_change === 1 ? 'place' : 'places'}`
        : feedback.rank_change < 0
          ? `Down ${Math.abs(feedback.rank_change)} ${Math.abs(feedback.rank_change) === 1 ? 'place' : 'places'}`
          : 'No rank change';
  return (
    <section
      className={`question-feedback feedback-${feedback.outcome}`}
      aria-live="polite"
    >
      <div className="feedback-outcome">
        <strong>{outcomeLabels[feedback.outcome]}</strong>
        <span>+{feedback.points_awarded} points</span>
      </div>
      <div className="feedback-rank">
        <span>Your rank movement</span>
        <strong>{movement}</strong>
      </div>
    </section>
  );
}
