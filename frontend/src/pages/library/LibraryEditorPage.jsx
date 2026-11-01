import { useLibraryScope } from '../../contexts/WorkspaceContext';
import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import {
  useLibraryResource,
  useLibraryTask,
} from '../../hooks/useLibraryResource';
import { blankQuestion } from '../../contexts/QuizDraftContext';
import QuestionEditor from '../../components/quiz/QuestionEditor';
import { api } from '../../api';
import { draftContent } from '../../library';
export default function LibraryEditorPage() {
  const { quizId } = useParams();
  return (
    <LibraryAccess>
      <EditorEntry key={quizId || 'new'} quizId={quizId} />
    </LibraryAccess>
  );
}
function EditorEntry({ quizId }) {
  return quizId ? <SavedEditor quizId={quizId} /> : <EditorForm saved={null} />;
}
function SavedEditor({ quizId }) {
  const { apiBase } = useLibraryScope();
  const resource = useLibraryResource(`${apiBase}/${quizId}`);
  if (resource.data?.capabilities?.can_edit_draft === false)
    return (
      <p role="alert">
        Only the author or organisation managers can edit this draft.
      </p>
    );
  return resource.data ? (
    <EditorForm saved={resource.data} reload={resource.retry} />
  ) : (
    <ResourceState resource={resource} />
  );
}
function EditorForm({ saved, reload }) {
  const { base, apiBase } = useLibraryScope();
  const initial = saved
    ? draftContent(saved)
    : { title: '', questions: [blankQuestion()] };
  const [content, setContent] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [revision, setRevision] = useState(saved?.revision);
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const task = useLibraryTask();
  const navigate = useNavigate();
  const allowNavigation = useRef(false);
  const dirty = JSON.stringify(content) !== baseline;
  const blocker = useBlocker(() => dirty && !allowNavigation.current);
  useEffect(() => {
    const warn = (event) => {
      if (dirty && !allowNavigation.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function save(publishing) {
    if (task.busy) return;
    setConflict(false);
    setNotice('');
    task.run(
      async (signal) => {
        try {
          return await api(
            saved
              ? `${apiBase}/${saved.id}${publishing ? '/publish' : ''}`
              : apiBase,
            {
              method: saved && !publishing ? 'PUT' : 'POST',
              signal,
              body: JSON.stringify({
                ...content,
                ...(saved ? { revision } : { publish: publishing }),
              }),
            },
          );
        } catch (reason) {
          if (!signal.aborted && reason.status === 409) setConflict(true);
          throw reason;
        }
      },
      (result) => {
        const quiz = result.quiz || result;
        setBaseline(JSON.stringify(content));
        setRevision(quiz.revision);
        setNotice('Draft saved.');
        if (publishing || !saved) {
          allowNavigation.current = true;
          navigate(
            publishing
              ? `${base}/${quiz.id}/versions/${result.version.number}`
              : `${base}/${quiz.id}/edit`,
            { replace: !saved },
          );
        }
      },
    );
  }
  function updateQuestion(index, changes) {
    setContent((value) => ({
      ...value,
      questions: value.questions.map((q, i) =>
        i === index ? { ...q, ...changes } : q,
      ),
    }));
  }
  return (
    <>
      <LibraryHeading
        title={saved ? 'Edit draft' : 'New quiz'}
        description="Save unfinished ideas. Publish a version when every question is ready."
      >
        {saved && (
          <Link className="secondary-button" to={`${base}/${saved.id}`}>
            Version history
          </Link>
        )}
      </LibraryHeading>
      <p role="status" className="library-save-status">
        {task.busy
          ? 'Saving...'
          : dirty
            ? 'Unsaved changes'
            : notice ||
              (saved ? `Saved draft · Revision ${revision}` : 'Not saved yet')}
      </p>
      <form
        className="library-panel library-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
      >
        <fieldset disabled={task.busy}>
          <label className="field-label" htmlFor="library-title">
            Quiz title
          </label>
          <input
            id="library-title"
            className="text-input title-input"
            maxLength={100}
            value={content.title}
            placeholder="Give your quiz a name"
            onChange={(event) =>
              setContent((value) => ({ ...value, title: event.target.value }))
            }
          />
          {content.questions.map((question, index) => (
            <QuestionEditor
              key={index}
              question={question}
              index={index}
              canRemove={true}
              onRemove={() =>
                setContent((value) => ({
                  ...value,
                  questions: value.questions.filter((_, i) => i !== index),
                }))
              }
              onChange={(changes) => updateQuestion(index, changes)}
            />
          ))}
          <button
            type="button"
            className="add-question"
            disabled={content.questions.length >= 20}
            onClick={() =>
              setContent((value) => ({
                ...value,
                questions: [...value.questions, blankQuestion()],
              }))
            }
          >
            Add question ({content.questions.length}/20)
          </button>
          <div className="library-actions library-editor-actions">
            <button className="secondary-button" type="submit">
              Save draft
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => save(true)}
            >
              Save and publish
            </button>
          </div>
        </fieldset>
        <p className="library-help">
          Publishing creates a private, fixed version. Hosting is a separate
          step.
        </p>
        {task.error && (
          <p className="error-message" role="alert">
            {task.error}
          </p>
        )}
        {conflict && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReloadConfirm(true)}
          >
            Reload saved draft
          </button>
        )}
        {reloadConfirm && (
          <section
            className="library-confirm"
            role="group"
            aria-label="Reload draft confirmation"
          >
            <p>Discard your local edits and load the latest saved draft?</p>
            <div className="library-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReloadConfirm(false)}
              >
                Keep editing
              </button>
              <button type="button" className="primary-button" onClick={reload}>
                Discard edits and reload
              </button>
            </div>
          </section>
        )}
      </form>
      {blocker.state === 'blocked' && (
        <section
          className="library-confirm"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="unsaved-heading"
        >
          <h2 id="unsaved-heading">Leave without saving?</h2>
          <p>Your changes to this draft will be lost.</p>
          <div className="library-actions">
            <button
              className="secondary-button"
              autoFocus
              onClick={() => blocker.reset()}
            >
              Keep editing
            </button>
            <button
              className="primary-button"
              onClick={() => blocker.proceed()}
            >
              Discard changes and leave
            </button>
          </div>
        </section>
      )}
    </>
  );
}
