import RankingList from './RankingList';

export default function FinalPodium({ entries, currentName }) {
  const podium = entries.slice(0, 3);
  const remaining = entries.slice(3);
  const placements = ['first', 'second', 'third'];
  return (
    <>
      {podium.length > 0 && (
        <ol
          className={`final-podium podium-count-${podium.length}`}
          aria-label="Top three participants"
        >
          {podium.map((entry, index) => (
            <li
              className={`podium-entry podium-${placements[index]}${entry.display_name === currentName ? ' podium-self' : ''}`}
              key={`${index}-${entry.display_name}`}
            >
              <span className="podium-rank">#{entry.rank}</span>
              <span className="podium-medallion" aria-hidden="true">
                {entry.display_name.trim().charAt(0).toUpperCase()}
              </span>
              <strong className="podium-name">{entry.display_name}</strong>
              <span className="podium-score">{entry.points} points</span>
            </li>
          ))}
        </ol>
      )}
      {remaining.length > 0 && (
        <section className="final-remaining">
          <span className="section-kicker">THE REST OF THE FIELD</span>
          <RankingList entries={remaining} currentName={currentName} />
        </section>
      )}
    </>
  );
}
