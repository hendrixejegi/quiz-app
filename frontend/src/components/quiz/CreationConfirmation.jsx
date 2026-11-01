import { Check, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import SharePanel from './SharePanel';
export default function CreationConfirmation({ created }) {
  return (
    <div className="result-panel">
      <div className="success-icon">
        <Check size={27} />
      </div>
      <div className="eyebrow">
        <span className="eyebrow-line" />
        ROOM IS READY
        <span className="eyebrow-line" />
      </div>
      <h1>
        Let the game
        <br />
        <span className="highlight-text">find its people.</span>
      </h1>
      <p className="hero-copy">
        Your quiz <strong>{created.title}</strong> is waiting in the lobby.
      </p>
      <SharePanel created={created} />
      <Link className="primary-button host-button" to={created.host_url}>
        Open host lobby <ArrowRight size={17} />
      </Link>
      <p className="private-note">
        Your host room is protected by your account. Use an authorised account
        to control this quiz.
      </p>
    </div>
  );
}
