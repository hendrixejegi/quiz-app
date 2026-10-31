import { Link, useSearchParams } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import { useLibraryResource } from '../../hooks/useLibraryResource';
import { quizTitle, questionCountLabel } from '../../library';
export default function LibraryPage() {
  return (
    <LibraryAccess>
      <QuizList />
    </LibraryAccess>
  );
}
function QuizList() {
  const [params, setParams] = useSearchParams();
  const parsedOffset = Number(params.get('offset'));
  const offset =
    Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const resource = useLibraryResource(
    `/api/library/quizzes?offset=${offset}&limit=20`,
  );
  const page = resource.data;
  return (
    <>
      <LibraryHeading
        back={false}
        title="My quizzes"
        description="Your drafts. Your published versions. Ready whenever your people are."
      >
        <Link className="primary-button" to="/library/new">
          New quiz
        </Link>
      </LibraryHeading>
      <ResourceState resource={resource} />
      {page &&
        (page.total === 0 ? (
          <section className="library-panel">
            <h2>Your first quiz starts here.</h2>
            <p>
              Save a work in progress, publish it when you're ready, and host it
              more than once.
            </p>
            <Link className="secondary-button" to="/library/new">
              Create your first draft
            </Link>
          </section>
        ) : (
          <>
            <p className="library-count">
              {page.total} {page.total === 1 ? 'quiz' : 'quizzes'}. Only you can
              access this library.
            </p>
            <div className="library-list">
              {page.items.map((quiz) => (
                <article className="library-row" key={quiz.id}>
                  <div>
                    <Link className="library-title" to={`/library/${quiz.id}`}>
                      {quizTitle(quiz.title)}
                    </Link>
                    <p>
                      {questionCountLabel(quiz.question_count)} · Updated{' '}
                      {new Date(quiz.updated_at).toLocaleDateString()}
                    </p>
                    <span>
                      {quiz.latest_version
                        ? `Published v${quiz.latest_version}${quiz.has_unpublished_changes ? ' · Unpublished changes' : ''}`
                        : 'Draft only'}
                    </span>
                  </div>
                  <Link
                    className="secondary-button"
                    to={`/library/${quiz.id}/edit`}
                  >
                    Edit draft
                    <span className="sr-only">: {quizTitle(quiz.title)}</span>
                  </Link>
                </article>
              ))}
            </div>
            {page.total > 20 && (
              <nav className="library-actions" aria-label="Library pages">
                <button
                  className="secondary-button"
                  disabled={offset === 0}
                  onClick={() =>
                    setParams({ offset: String(Math.max(0, offset - 20)) })
                  }
                >
                  Previous
                </button>
                <span>
                  {offset + 1}–{Math.min(offset + 20, page.total)} of{' '}
                  {page.total}
                </span>
                <button
                  className="secondary-button"
                  disabled={offset + 20 >= page.total}
                  onClick={() => setParams({ offset: String(offset + 20) })}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        ))}
    </>
  );
}
