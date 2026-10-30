import CopyButton from '../common/CopyButton';
export default function SharePanel({ created }) {
  return (
    <div className="share-card">
      <span className="section-kicker">PARTICIPANT LINK</span>
      <div className="share-value">
        <span>{created.participant_url}</span>
        <CopyButton value={created.participant_url} />
      </div>
      <div className="join-code">
        JOIN CODE <strong>{created.join_code}</strong>
      </div>
    </div>
  );
}
