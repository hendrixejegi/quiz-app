import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import {
  useLibraryResource,
  useLibraryTask,
} from '../../hooks/useLibraryResource';
import { useWorkspace, WorkspaceAccess } from '../../contexts/WorkspaceContext';

import { api } from '../../api';

import { Confirm, feedback, orgPath } from './OrganisationUI';
export default function OrganisationSettingsPage() {
  return (
    <LibraryAccess organisationAuthor={false}>
      <WorkspaceAccess owner>
        <Settings />
      </WorkspaceAccess>
    </LibraryAccess>
  );
}
function Settings() {
  const { organisation: org, refresh } = useWorkspace();
  const resource = useLibraryResource(`/api/organisations/${org.id}/members`);
  const task = useLibraryTask();
  const [name, setName] = useState(org.name),
    [target, setTarget] = useState(''),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState('');
  const navigate = useNavigate();
  return (
    <>
      <LibraryHeading title="Settings and ownership" description={org.name}>
        <Link className="secondary-button" to={orgPath(org.id)}>
          Organisation overview
        </Link>
      </LibraryHeading>
      <form
        className="library-panel"
        onSubmit={(e) => {
          e.preventDefault();
          task.run(
            (signal) =>
              api(`/api/organisations/${org.id}`, {
                method: 'PATCH',
                signal,
                body: JSON.stringify({ name }),
              }),
            () => {
              refresh();
              setMessage('Organisation name saved.');
            },
          );
        }}
      >
        <label className="field-label" htmlFor="rename-organisation">
          Organisation name
        </label>
        <input
          id="rename-organisation"
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
          Save name
        </button>
      </form>
      <section className="library-panel">
        <h2>Transfer ownership</h2>
        <p>
          The new owner must already be an active member. You will become an
          admin and may then leave.
        </p>
        <ResourceState resource={resource} />
        {resource.data && (
          <>
            <label className="field-label" htmlFor="new-owner">
              New owner
            </label>
            <select
              id="new-owner"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose an active member</option>
              {resource.data
                .filter((m) => m.active && m.role !== 'owner')
                .map((m) => (
                  <option key={m.id} value={m.user_id}>
                    {m.display_name || m.email} · {m.role}
                  </option>
                ))}
            </select>
            <button
              className="secondary-button organisation-submit"
              disabled={!target || task.busy}
              onClick={() => setConfirm(true)}
            >
              Transfer ownership
            </button>
          </>
        )}
      </section>
      {confirm && (
        <Confirm
          title="Transfer ownership?"
          busy={task.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            task.run(
              (signal) =>
                api(`/api/organisations/${org.id}/ownership`, {
                  method: 'POST',
                  signal,
                  body: JSON.stringify({ user_id: target }),
                }),
              () => {
                refresh();
                navigate(orgPath(org.id), {
                  replace: true,
                  state: {
                    notice: 'Ownership transferred. Your role is now admin.',
                  },
                });
              },
            )
          }
        >
          Only the new owner will be able to grant admin access or transfer
          ownership again.
        </Confirm>
      )}
      {message && <p role="status">{message}</p>}
      {feedback(task)}
    </>
  );
}
