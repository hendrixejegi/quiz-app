import { ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useParticipantRoom } from '../hooks/useParticipantRoom';
import { useCountdown } from '../hooks/useCountdown';
import ParticipantIdentityFields from '../components/quiz/ParticipantIdentityFields';
import ParticipantLobby from '../components/game/ParticipantLobby';
import FinalResults from '../components/game/FinalResults';
import QuestionResults from '../components/game/QuestionResults';
import ActiveQuestion from '../components/game/ActiveQuestion';
export default function ParticipantPage() {
  const { joinCode } = useParams();
  return (
    <ParticipantRoom
      key={joinCode.toUpperCase()}
      joinCode={joinCode.toUpperCase()}
    />
  );
}
function ParticipantRoom({ joinCode }) {
  const {
    event,
    participant,
    joinForm,
    setJoinForm,
    join: joinQuiz,
    busy,
    error,
    answeredChoice,
    answerSubmitting,
    submitAnswer,
  } = useParticipantRoom(joinCode);
  const remainingSeconds = useCountdown(event);
  const activeQuestion = event?.current_question;
  return (
    <div className="join-wrap">
      {!event && !error && <p role="status">Loading quiz…</p>}
      <Link className="back-link" to="/">
        <ArrowLeft size={15} /> Create a quiz
      </Link>
      {error && !event ? (
        <div className="notice-card error-message" role="alert">
          {error}
        </div>
      ) : event && !participant ? (
        <>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            {event.state === 'lobby' ? 'YOU’RE INVITED' : 'TEST IN PROGRESS'}
            <span className="eyebrow-line" />
          </div>
          <h1 className="join-title">
            {event.title}
            <br />
            <span className="highlight-text">
              {event.state === 'lobby' ? 'starts with you.' : 'join in.'}
            </span>
          </h1>
          <div className="join-meta">
            <span>
              <Users size={16} /> {event.participant_count} here
            </span>
            <span className="meta-divider" />
            <span>ROOM {event.join_code}</span>
          </div>
          <form className="join-card" onSubmit={joinQuiz}>
            <h2>
              {event.state === 'lobby' ? 'Save your seat.' : 'Join the test.'}
            </h2>
            <p>Pick a name your friends will recognize.</p>
            <ParticipantIdentityFields
              value={joinForm}
              onChange={setJoinForm}
            />
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full-button" disabled={busy}>
              {busy ? (
                'Joining…'
              ) : (
                <>
                  {event.state === 'lobby' ? 'Join the lobby' : 'Join the test'}{' '}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        </>
      ) : (
        participant &&
        event?.state === 'lobby' && (
          <ParticipantLobby event={event} participant={participant} />
        )
      )}
      {participant && event?.state === 'completed' && (
        <FinalResults event={event} participant={participant} />
      )}
      {participant && event?.state === 'results' && activeQuestion && (
        <QuestionResults
          event={event}
          participant={participant}
          activeQuestion={activeQuestion}
        />
      )}
      {participant && event?.state === 'active' && activeQuestion && (
        <ActiveQuestion
          {...{
            event,
            activeQuestion,
            remainingSeconds,
            answeredChoice,
            answerSubmitting,
            submitAnswer,
            error,
          }}
        />
      )}
    </div>
  );
}
