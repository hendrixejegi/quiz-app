import { ArrowRight, Users } from 'lucide-react';
import { useLocation, useParams } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useHostRoom } from '../hooks/useHostRoom';
import RankingList from '../components/game/RankingList';
import CopyButton from '../components/common/CopyButton';
export default function HostPage() {
  const { eventId } = useParams();
  const { hash } = useLocation();
  const { user, loading } = useAuth();
  return (
    <HostRoom
      key={eventId + hash}
      eventId={eventId}
      token={hash.slice(1)}
      user={user}
      loading={loading}
    />
  );
}
function HostRoom({ eventId, token, user, loading }) {
  const {
    data: hostInfo,
    error,
    connection: hostConnection,
    busy,
    start: startQuiz,
  } = useHostRoom(eventId, token, user, loading);
  return (
    <div className="host-wrap">
      {!hostInfo && !error && <p role="status">Loading host room…</p>}
      {error && !hostInfo ? (
        <div className="notice-card error-message" role="alert">
          {error}
        </div>
      ) : (
        hostInfo && (
          <>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              HOST CONTROL
              <span className="eyebrow-line" />
            </div>
            <h1 className="host-title">
              {hostInfo.title}
              <br />
              <span className="highlight-text">
                {hostInfo.state === 'lobby'
                  ? 'lobby.'
                  : hostInfo.state === 'completed'
                    ? 'complete.'
                    : 'live.'}
              </span>
            </h1>
            <div className="host-stats">
              <div className="stat-card">
                <span className="section-kicker">IN THE ROOM</span>
                <strong>
                  {String(hostInfo.participant_count).padStart(2, '0')}
                </strong>
                <span className="stat-caption">of 50 players</span>
              </div>
              <div className="stat-card">
                <span className="section-kicker">JOIN CODE</span>
                <strong className="stat-code">{hostInfo.join_code}</strong>
                <CopyButton
                  className="copy-inline"
                  value={hostInfo.join_code}
                  label="Copy code"
                  size={14}
                />
              </div>
            </div>
            <div className="players-card">
              <div className="players-heading">
                <div>
                  <span className="section-kicker">THE CROWD</span>
                  <h2>Players in the room</h2>
                </div>
                <div className="host-indicators">
                  <span className="event-state-pill">
                    {hostInfo.state.toUpperCase()}
                  </span>
                  <span className={`live-pill connection-${hostConnection}`}>
                    <span className="status-dot" />
                    {hostConnection === 'connected'
                      ? 'LIVE'
                      : hostConnection.toUpperCase()}
                  </span>
                </div>
              </div>
              {hostInfo.state === 'lobby' ? (
                hostInfo.participants.length ? (
                  <div className="player-list">
                    {hostInfo.participants.map((player, index) => (
                      <div
                        className="player-row"
                        key={`${player.display_name}-${index}`}
                      >
                        <span className="player-avatar">
                          {player.display_name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{player.display_name}</span>
                        <span className="player-private">{player.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-players">
                    <Users size={22} />
                    <p>
                      Share the join code and your players will appear here.
                    </p>
                  </div>
                )
              ) : (
                <>
                  <div className="host-live-summary">
                    {hostInfo.state === 'completed'
                      ? 'Final standings'
                      : hostInfo.state === 'results'
                        ? 'Question results'
                        : `Question ${Number(hostInfo.current_question_position ?? 0) + 1} of ${hostInfo.question_count}`}
                  </div>
                  <RankingList
                    entries={hostInfo.leaderboard || []}
                    showPoints
                  />
                </>
              )}
              {hostInfo.state === 'lobby' ? (
                <button
                  className="primary-button start-quiz-button"
                  onClick={startQuiz}
                  disabled={busy || hostInfo.participant_count === 0}
                >
                  {busy ? (
                    'Starting…'
                  ) : (
                    <>
                      Start quiz <ArrowRight size={17} />
                    </>
                  )}
                </button>
              ) : (
                <p className="quiz-started">
                  {hostInfo.state === 'completed'
                    ? 'Quiz complete.'
                    : 'Standings update live as answers come in.'}
                </p>
              )}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </div>
            <p className="private-note">
              New participants appear here as they join.
            </p>
          </>
        )
      )}
    </div>
  );
}
