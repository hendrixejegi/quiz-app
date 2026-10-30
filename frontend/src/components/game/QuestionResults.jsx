import QuestionFeedback from './QuestionFeedback';
import RankingList from './RankingList';
export default function QuestionResults({
  event,
  participant,
  activeQuestion,
}) {
  return (
    <div className="participant-live-layout">
      <div className="participant-test result-interval">
        <div className="eyebrow">
          <span className="eyebrow-line" />
          QUESTION RESULTS
          <span className="eyebrow-line" />
        </div>
        <div className="test-progress">
          QUESTION {String(activeQuestion.position + 1).padStart(2, '0')}{' '}
          <span>OF {String(event.question_count).padStart(2, '0')}</span>
        </div>
        <h1 className="test-question">{activeQuestion.prompt}</h1>
        <QuestionFeedback feedback={event.question_feedback} />
        <p className="answer-locked">
          Next question starts in {event.results_remaining_seconds} seconds.
        </p>
      </div>
      <aside className="participant-leaderboard">
        <span className="section-kicker">LIVE RANKING</span>
        <h2>Your standing</h2>
        <RankingList
          entries={event.leaderboard_top3 || []}
          currentName={participant.display_name}
        />
        <div className="your-rank">
          <span>Your rank</span>
          <strong>#{event.leaderboard_self?.rank ?? '—'}</strong>
          <span>{event.leaderboard_self?.points ?? 0} points</span>
        </div>
      </aside>
    </div>
  );
}
