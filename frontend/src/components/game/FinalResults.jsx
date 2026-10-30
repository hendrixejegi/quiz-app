import FinalPodium from './FinalPodium';
import AnswerReview from './AnswerReview';
export default function FinalResults({ event, participant }) {
  return (
    <div className="final-results">
      <div className="eyebrow">
        <span className="eyebrow-line" />
        QUIZ COMPLETE
        <span className="eyebrow-line" />
      </div>
      <h1 className="lobby-title">
        The final
        <br />
        <span className="highlight-text">leaderboard.</span>
      </h1>
      <p className="hero-copy">
        You finished at rank{' '}
        <strong>#{event.leaderboard_self?.rank ?? '—'}</strong> with{' '}
        <strong>{event.leaderboard_self?.points ?? 0} points.</strong>
      </p>
      <section className="final-ranking">
        <div className="final-ranking-heading">
          <span className="section-kicker">FINAL STANDINGS</span>
        </div>
        <FinalPodium
          entries={event.leaderboard || []}
          currentName={participant.display_name}
        />
      </section>
      <AnswerReview event={event} />
    </div>
  );
}
