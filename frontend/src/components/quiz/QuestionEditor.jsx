import { Check, X } from 'lucide-react';
export default function QuestionEditor({
  question,
  index,
  canRemove,
  onRemove,
  onChange,
}) {
  const choices = Array.from(
    { length: 4 },
    (_, index) => question.choices[index] ?? '',
  );
  return (
    <article className="question-editor" key={index}>
      <div className="question-editor-top">
        <span className="question-number">
          QUESTION {String(index + 1).padStart(2, '0')}
        </span>
        {canRemove && (
          <button
            type="button"
            className="icon-button"
            onClick={onRemove}
            aria-label="Remove question"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <textarea
        className="text-input prompt-input"
        aria-label={`Question ${index + 1} prompt`}
        placeholder="Write your question..."
        maxLength="500"
        value={question.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        required
      />
      <div className="choice-grid">
        {choices.map((choice, ci) => (
          <label
            className={`choice-field ${question.correct_choice_index === ci ? 'correct' : ''}`}
            key={ci}
          >
            <span className="choice-letter">
              {String.fromCharCode(65 + ci)}
            </span>
            <input
              aria-label={`Answer ${String.fromCharCode(65 + ci)}`}
              maxLength="200"
              placeholder={`Answer ${String.fromCharCode(65 + ci)}`}
              value={choice}
              onChange={(e) =>
                onChange({
                  choices: choices.map((value, index) =>
                    index === ci ? e.target.value : value,
                  ),
                })
              }
            />
            <button
              type="button"
              className="correct-toggle"
              aria-label={`Mark answer ${String.fromCharCode(65 + ci)} correct`}
              aria-pressed={question.correct_choice_index === ci}
              onClick={() => onChange({ correct_choice_index: ci })}
            >
              {question.correct_choice_index === ci && <Check size={13} />}
            </button>
          </label>
        ))}
      </div>
      <div className="question-footer">
        <span>
          <span className="mini-dot" /> Tap the ring to mark the correct answer
        </span>
        <label className="timer-select">
          TIMER{' '}
          <select
            value={question.time_limit_seconds}
            onChange={(e) =>
              onChange({ time_limit_seconds: Number(e.target.value) })
            }
          >
            {[...new Set([10, 15, 20, 30, 45, 60, question.time_limit_seconds])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}s
                </option>
              ))}
          </select>
        </label>
      </div>
    </article>
  );
}
