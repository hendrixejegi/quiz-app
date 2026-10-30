export default function RankingList({
  entries,
  currentName,
  showPoints = true,
}) {
  return (
    <ol className="ranking-list">
      {entries.map((entry) => (
        <li
          className={
            entry.display_name === currentName
              ? 'ranking-row ranking-self'
              : 'ranking-row'
          }
          key={`${entry.rank}-${entry.display_name}`}
        >
          <span className="ranking-place">{entry.rank}</span>
          <span className="ranking-name">{entry.display_name}</span>
          {showPoints && (
            <strong className="ranking-points">{entry.points} pts</strong>
          )}
        </li>
      ))}
    </ol>
  );
}
