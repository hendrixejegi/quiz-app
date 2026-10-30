export default function QuestionTimer({ remainingSeconds, activeQuestion }) {
  return (
    <>
      <div
        className={`timer-display ${remainingSeconds <= 5 ? 'timer-urgent' : ''}`}
        aria-live="polite"
      >
        <strong>{remainingSeconds}</strong>
        <span>SECONDS REMAINING</span>
      </div>
      <div
        className="timer-track"
        role="progressbar"
        aria-label="Question time remaining"
        aria-valuemin="0"
        aria-valuemax={activeQuestion.time_limit_seconds}
        aria-valuenow={Math.min(
          remainingSeconds,
          activeQuestion.time_limit_seconds,
        )}
      >
        <span
          style={{
            width: `${Math.min(100, Math.max(0, (remainingSeconds / activeQuestion.time_limit_seconds) * 100))}%`,
          }}
        />
      </div>
    </>
  );
}
