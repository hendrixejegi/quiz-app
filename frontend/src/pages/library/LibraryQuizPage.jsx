import CopyToOrganisation from '../../components/organisations/CopyToOrganisation';
import { useLibraryScope } from '../../contexts/WorkspaceContext';
import { Link, useParams } from 'react-router';
import { useState } from 'react';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import {
  useLibraryResource,
  useLibraryTask,
} from '../../hooks/useLibraryResource';
import CreationConfirmation from '../../components/quiz/CreationConfirmation';
import { api } from '../../api';
import { quizTitle, questionCountLabel } from '../../library';
export default function LibraryQuizPage() {
  const { quizId } = useParams();
  return (
    <LibraryAccess>
      <QuizOverview key={quizId} quizId={quizId} />
    </LibraryAccess>
  );
}
export function useVersionLaunch(quizId) {
  const { apiBase } = useLibraryScope();
  const [created, setCreated] = useState(null);
  const task = useLibraryTask();
  function host(number) {
    if (task.busy) return;
    task.run(
      (signal) =>
        api(`${apiBase}/${quizId}/versions/${number}/events`, {
          method: 'POST',
          signal,
        }),
      (result) =>
        setCreated({
          ...result,
          participant_url: new URL(
            result.participant_url,
            window.location.origin,
          ).href,
        }),
    );
  }
  return { created, task, host };
}
function QuizOverview({ quizId }) {
  const { base, apiBase, organisation } = useLibraryScope();
  const resource = useLibraryResource(`${apiBase}/${quizId}`);
  const versions = useLibraryResource(`${apiBase}/${quizId}/versions`);
  const { created, task, host } = useVersionLaunch(quizId);
  if (created) return <CreationConfirmation created={created} />;
  const quiz = resource.data;
  return (
    <>
      <ResourceState resource={resource} />
      {quiz && (
        <>
          <LibraryHeading
            title={quizTitle(quiz.title)}
            description={
              quiz.capabilities?.can_edit_draft === false
                ? 'Published organisation quiz. Preview a version or host a game.'
                : quiz.has_unpublished_changes
                  ? 'Your saved draft has unpublished changes.'
                  : 'Your saved draft matches the latest published version.'
            }
          >
            {quiz.capabilities?.can_edit_draft !== false && (
              <Link className="secondary-button" to={`${base}/${quizId}/edit`}>
                Edit draft
              </Link>
            )}
            {quiz.latest_version && (
              <button
                className="primary-button"
                disabled={task.busy}
                onClick={() => host(quiz.latest_version)}
              >
                {task.busy
                  ? 'Creating lobby...'
                  : `Host latest · v${quiz.latest_version}`}
              </button>
            )}
          </LibraryHeading>
          {quiz.capabilities?.can_edit_draft !== false && (
            <section className="library-panel">
              <h2>Saved draft</h2>
              <p>
                {questionCountLabel(quiz.question_count)} · Revision{' '}
                {quiz.revision} · Saved{' '}
                {new Date(quiz.updated_at).toLocaleString()}
              </p>
              <p>
                Edits stay in your draft until you publish. Existing versions
                and games stay unchanged.
              </p>
            </section>
          )}
          <section className="library-panel">
            <h2>Published versions</h2>
            <p>
              {organisation
                ? 'Organisation instructors and managers can preview published answers and host these versions.'
                : 'Only you can preview these answers or launch a game from this library.'}
            </p>
            <ResourceState resource={versions} />
            {versions.data &&
              (versions.data.length ? (
                <ol className="library-versions">
                  {versions.data.map((version) => (
                    <li key={version.number}>
                      <div>
                        <Link
                          className="library-title"
                          to={`${base}/${quizId}/versions/${version.number}`}
                        >
                          Version {version.number}
                        </Link>
                        <p>
                          {version.title} ·{' '}
                          {questionCountLabel(version.question_count)} ·{' '}
                          {new Date(version.published_at).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        className="secondary-button"
                        to={`${base}/${quizId}/versions/${version.number}`}
                      >
                        Preview
                        <span className="sr-only">
                          {' '}
                          version {version.number}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>
                  No published versions yet. Finish your draft, then choose Save
                  and publish.
                </p>
              ))}
          </section>
          {!organisation && <CopyToOrganisation quizId={quizId} />}
          {task.error && (
            <p className="error-message" role="alert">
              {task.error}
            </p>
          )}
        </>
      )}
    </>
  );
}
