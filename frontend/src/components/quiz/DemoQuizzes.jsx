import { ArrowRight } from 'lucide-react';
import { DEMO_CATEGORIES } from '../../demoQuiz';
export default function DemoQuizzes({
  createDemoQuiz,
  demoCreatingId,
  demoError,
}) {
  return (
    <section className="demo-section" aria-labelledby="demo-heading">
      <div className="demo-heading">
        <div>
          <span className="section-kicker">READY-MADE QUIZZES</span>
          <h2 id="demo-heading">Pick a quiz. Bring your people.</h2>
        </div>
        <span className="demo-total">{DEMO_CATEGORIES.length} QUIZZES</span>
      </div>
      <p className="demo-intro">
        Choose a category to create a ready-to-host quiz. You’ll get a join link
        and your own host room.
      </p>
      <div className="demo-categories">
        {DEMO_CATEGORIES.map((category) => (
          <article className="demo-category" key={category.name}>
            <span className="demo-category-number">{category.icon}</span>
            <div>
              <h3>{category.name}</h3>
              <p>{category.detail}</p>
              <span className="demo-category-count">
                {category.questions.length} questions ·{' '}
                {category.timeLimitSeconds ?? 20} seconds each
              </span>
            </div>
            <button
              className="primary-button demo-start-button"
              type="button"
              onClick={() => createDemoQuiz(category.id)}
              disabled={demoCreatingId != null}
            >
              {demoCreatingId === category.id ? (
                'Creating…'
              ) : (
                <>
                  Start Quiz <ArrowRight size={16} />{' '}
                </>
              )}
            </button>
          </article>
        ))}
      </div>
      {demoError && (
        <p className="error-message" role="alert">
          {demoError}
        </p>
      )}
    </section>
  );
}
