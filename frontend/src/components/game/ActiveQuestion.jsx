import QuestionTimer from './QuestionTimer';
export default function ActiveQuestion({
  event,
  activeQuestion,
  remainingSeconds,
  answeredChoice,
  answerSubmitting,
  submitAnswer,
  error,
}) {
  return (
    <div className="participant-test">
      <div className="eyebrow">
        <span className="eyebrow-line" />
        {event.title}
        <span className="eyebrow-line" />
      </div>
      <div className="test-progress">
        QUESTION {String(activeQuestion.position + 1).padStart(2, '0')}{' '}
        <span>OF {String(event.question_count).padStart(2, '0')}</span>
      </div>
      <QuestionTimer
        remainingSeconds={remainingSeconds}
        activeQuestion={activeQuestion}
      />
      <h1 className="test-question">{activeQuestion.prompt}</h1>
      {answeredChoice == null &&
        remainingSeconds > 0 &&
        event.can_answer_current_question && (
          <p className="answer-hint">
            Choose carefully—your answer locks in when you select it.
          </p>
        )}
      <div className="test-choices">
        {activeQuestion.choices.map((choice, index) => (
          <button
            key={index}
            className={`test-choice ${answeredChoice === index ? 'selected' : ''}`}
            aria-pressed={answeredChoice === index}
            disabled={
              answeredChoice != null ||
              remainingSeconds === 0 ||
              answerSubmitting ||
              !event.can_answer_current_question
            }
            onClick={() => submitAnswer(index)}
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {choice}
          </button>
        ))}
      </div>
      {!event.can_answer_current_question && (
        <p className="answer-locked">
          You joined during this question. You can answer the next one.
        </p>
      )}
      {answeredChoice != null && (
        <p className="answer-locked">
          Answer locked in. Standings update when the question ends.
        </p>
      )}
      {remainingSeconds === 0 && (
        <p className="answer-locked">Time is up. Showing the standings…</p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
