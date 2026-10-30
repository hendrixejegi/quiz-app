import { ArrowRight, Plus } from 'lucide-react';
import QuestionEditor from './QuestionEditor';
import { blankQuestion } from '../../contexts/QuizDraftContext';
export default function QuizBuilder({
  title,
  setTitle,
  questions,
  setQuestions,
  updateQuestion,
  createQuiz,
  busy,
  error,
}) {
  return (
    <form className="builder" onSubmit={createQuiz}>
      <div className="builder-heading">
        <div>
          <span className="section-kicker">THE SETUP</span>
          <h2>Your quiz, your rules.</h2>
        </div>
        <span className="step-count">You’re the quizmaster.</span>
      </div>
      <label className="field-label" htmlFor="quiz-title">
        QUIZ TITLE
      </label>
      <input
        id="quiz-title"
        className="text-input title-input"
        maxLength="100"
        placeholder="e.g. Friday night trivia"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      {questions.map((question, index) => (
        <QuestionEditor
          key={index}
          question={question}
          index={index}
          canRemove={questions.length > 1}
          onRemove={() =>
            setQuestions((items) => items.filter((_, i) => i !== index))
          }
          onChange={(updates) => updateQuestion(index, updates)}
        />
      ))}
      <div className="builder-actions">
        <button
          type="button"
          className="add-question"
          onClick={() => setQuestions((items) => [...items, blankQuestion()])}
          disabled={questions.length >= 20}
        >
          <Plus size={16} /> Add another question{' '}
          <span>{questions.length}/20</span>
        </button>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? (
            'Creating…'
          ) : (
            <>
              Create quiz <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
