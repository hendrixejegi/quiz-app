import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useLibraryTask } from '../../hooks/useLibraryResource';
import { api } from '../../api';
export default function CopyToOrganisation({ quizId }) {
  const { organisations } = useWorkspace();
  const [destination, setDestination] = useState('');
  const navigate = useNavigate();
  const task = useLibraryTask();
  const eligible = organisations.filter(
    (org) => org.capabilities.author_quizzes,
  );
  if (!eligible.length) return null;
  return (
    <section className="library-panel">
      <h2>Copy to organisation</h2>
      <p>
        Copy this saved draft into a new organisation draft. Your personal quiz,
        versions and past games stay unchanged.
      </p>
      <label className="field-label" htmlFor="copy-destination">
        Destination workspace
      </label>
      <select
        id="copy-destination"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
      >
        <option value="">Choose an organisation</option>
        {eligible.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      <button
        className="secondary-button organisation-submit"
        disabled={!destination || task.busy}
        onClick={() =>
          task.run(
            (signal) =>
              api(
                `/api/organisations/${destination}/quizzes/copy-personal/${quizId}`,
                { method: 'POST', signal },
              ),
            (quiz) =>
              navigate(`/organisations/${destination}/library/${quiz.id}/edit`),
          )
        }
      >
        {task.busy ? 'Copying...' : 'Copy saved draft'}
      </button>
      {task.error && (
        <p className="error-message" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
