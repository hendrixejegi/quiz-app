import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import {
  useLibraryResource,
  useLibraryTask,
} from '../../hooks/useLibraryResource';
import { useWorkspace } from '../../contexts/WorkspaceContext';

import { api } from '../../api';

import { feedback, orgPath } from './OrganisationUI';
export default function OrganisationsPage() {
  return (
    <LibraryAccess organisationAuthor={false}>
      <OrganisationList />
    </LibraryAccess>
  );
}
function OrganisationList() {
  const resource = useLibraryResource('/api/organisations');
  const task = useLibraryTask();
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { state } = useLocation();
  return (
    <>
      <LibraryHeading
        title="Organisations"
        back={false}
        description="Keep your personal quizzes private. Build and host together in a shared workspace."
      />
      {state?.notice && <p role="status">{state.notice}</p>}
      <ResourceState resource={resource} />
      {resource.data && (
        <section className="library-panel">
          <h2>Your workspaces</h2>
          {resource.data.length ? (
            <ul className="organisation-list">
              {resource.data.map((org) => (
                <li key={org.id}>
                  <Link className="library-title" to={orgPath(org.id)}>
                    {org.name}
                  </Link>
                  <span>{org.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              You do not belong to an organisation yet. Create one or accept an
              invitation.
            </p>
          )}
        </section>
      )}
      <form
        className="library-panel"
        onSubmit={(event) => {
          event.preventDefault();
          task.run(
            (signal) =>
              api('/api/organisations', {
                method: 'POST',
                signal,
                body: JSON.stringify({ name }),
              }),
            (org) => {
              workspace.refresh();
              navigate(orgPath(org.id));
            },
          );
        }}
      >
        <h2>Create an organisation</h2>
        <p>You will be its owner. You can invite people after creating it.</p>
        <label className="field-label" htmlFor="organisation-name">
          Organisation name
        </label>
        <input
          id="organisation-name"
          className="text-input"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="primary-button organisation-submit"
          disabled={task.busy}
        >
          Create organisation
        </button>
        {feedback(task)}
      </form>
    </>
  );
}
