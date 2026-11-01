import { useLibraryScope } from '../../contexts/WorkspaceContext';
import { Link, useParams } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import { useLibraryResource } from '../../hooks/useLibraryResource';
import { useVersionLaunch } from './LibraryQuizPage';
import { questionCountLabel } from '../../library';
import CreationConfirmation from '../../components/quiz/CreationConfirmation';
export default function LibraryVersionPage() {
  const { quizId, versionNumber } = useParams();
  return (
    <LibraryAccess>
      <VersionPreview
        key={`${quizId}:${versionNumber}`}
        quizId={quizId}
        number={versionNumber}
      />
    </LibraryAccess>
  );
}
function VersionPreview({ quizId, number }) {
  const { base, apiBase } = useLibraryScope();
  const resource = useLibraryResource(
    `${apiBase}/${quizId}/versions/${number}`,
  );
  const { created, task, host } = useVersionLaunch(quizId);
  if (created) return <CreationConfirmation created={created} />;
  const version = resource.data;
  return (
    <>
      <ResourceState resource={resource} />
      {version && (
        <>
          <LibraryHeading
            title={version.title}
            description={`Published version ${version.number} · ${questionCountLabel(version.question_count)} · ${new Date(version.published_at).toLocaleString()}`}
          >
            <button
              className="primary-button"
              disabled={task.busy}
              onClick={() => host(version.number)}
            >
              {task.busy ? 'Creating lobby...' : 'Host this version'}
            </button>
          </LibraryHeading>
          <p className="library-help">
            This version is fixed and private. Edit the draft to publish a new
            version.
          </p>
          <div className="library-actions">
            <Link className="back-link" to={`${base}/${quizId}`}>
              Version history
            </Link>
            {version.capabilities?.can_edit_draft !== false && (
              <Link className="back-link" to={`${base}/${quizId}/edit`}>
                Edit draft
              </Link>
            )}
          </div>
          {task.error && (
            <p className="error-message" role="alert">
              {task.error}
            </p>
          )}
          {version.questions.map((q, index) => (
            <article className="library-panel library-preview" key={index}>
              <p className="section-kicker">
                Question {index + 1} · {q.time_limit_seconds} seconds
              </p>
              <h2>{q.prompt}</h2>
              <ol type="A">
                {q.choices.map((choice, i) => (
                  <li
                    key={i}
                    className={
                      i === q.correct_choice_index ? 'library-correct' : ''
                    }
                  >
                    {choice}
                    {i === q.correct_choice_index && (
                      <strong> — Correct answer</strong>
                    )}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </>
      )}
    </>
  );
}
