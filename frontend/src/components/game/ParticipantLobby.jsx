import { Radio } from 'lucide-react';
export default function ParticipantLobby({ event, participant }) {
  return (
    <div className="lobby-card">
      <span className="lobby-orbit">
        <Radio size={26} />
      </span>
      <div className="eyebrow">
        <span className="eyebrow-line" />
        YOU’RE IN
        <span className="eyebrow-line" />
      </div>
      <h1 className="lobby-title">
        Stay close,
        <br />
        <span className="highlight-text">{participant.display_name}.</span>
      </h1>
      <p className="hero-copy">
        You’re in the lobby for <strong>{event.title}</strong>.<br />
        The host will start the game soon.
      </p>
      <div className="waiting-status">
        <span className="pulse-dot" /> WAITING FOR THE HOST
      </div>
      <div className="lobby-instructions">
        <span className="section-kicker">WHILE YOU WAIT</span>
        <ul>
          <li>
            Choose carefully: you can’t change your answer after selecting it.
          </li>
          <li>Answer before the timer runs out.</li>
          <li>If you join during a question, you can answer the next one.</li>
          <li>There’s a short pause between questions while results appear.</li>
        </ul>
      </div>
    </div>
  );
}
