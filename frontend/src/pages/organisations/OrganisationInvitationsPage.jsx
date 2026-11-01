import { useState } from 'react';
import { Link } from 'react-router';
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
import CopyButton from '../../components/common/CopyButton';

import { Confirm, feedback, orgPath } from './OrganisationUI';
export default function OrganisationInvitationsPage() {
  return (
    <LibraryAccess organisationAuthor={false}>
      <WorkspaceAccess managers>
        <Invitations />
      </WorkspaceAccess>
    </LibraryAccess>
  );
}
function Invitations() {
  const { organisation: org } = useWorkspace();
  const resource = useLibraryResource(
    `/api/organisations/${org.id}/invitations`,
  );
  const task = useLibraryTask();
  const [email, setEmail] = useState(''),
    [role, setRole] = useState('learner'),
    [url, setUrl] = useState(''),
    [action, setAction] = useState(null);
  function complete(result) {
    setUrl(result?.url || '');
    setAction(null);
    resource.retry();
  }
  return (
    <>
      <LibraryHeading title="Invitations" description={org.name}>
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
              api(`/api/organisations/${org.id}/invitations`, {
                method: 'POST',
                signal,
                body: JSON.stringify({ email, role }),
              }),
            complete,
          );
        }}
      >
        <h2>Invite by email</h2>
        <p>
          Copy the link and send it to this person yourself. They must sign in
          with the same verified email. Links expire after seven days.
        </p>
        <label className="field-label" htmlFor="invitation-email">
          Email
        </label>
        <input
          className="text-input"
          id="invitation-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="field-label" htmlFor="invitation-role">
          Role
        </label>
        <select
          id="invitation-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {(org.role === 'owner'
            ? ['learner', 'instructor', 'admin']
            : ['learner', 'instructor']
          ).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        {role === 'admin' && (
          <p>
            Admins manage members and all organisation quizzes. Only the owner
            can grant admin access.
          </p>
        )}
        <button
          className="primary-button organisation-submit"
          disabled={task.busy}
        >
          Create invitation
        </button>
      </form>
      {url && (
        <section className="library-panel">
          <h2>Copy this invitation</h2>
          <p>
            This secret link is shown only when issued. Regenerating it
            invalidates the previous link.
          </p>
          <output className="invitation-url">{url}</output>
          <CopyButton
            value={url}
            label="Copy invitation link"
            className="secondary-button"
          />
        </section>
      )}
      <ResourceState resource={resource} />
      {resource.data && (
        <div className="library-list">
          {resource.data.map((invite) => (
            <article className="library-row" key={invite.id}>
              <div>
                <h2>{invite.email}</h2>
                <p>
                  {invite.role} · {invite.status} · Expires{' '}
                  {new Date(invite.expires_at).toLocaleString()}
                </p>
              </div>
              {invite.status !== 'accepted' &&
                (org.role === 'owner' || invite.role !== 'admin') && (
                  <div className="library-actions">
                    <button
                      className="secondary-button"
                      disabled={task.busy}
                      onClick={() => setAction({ invite, type: 'regenerate' })}
                    >
                      Regenerate
                    </button>
                    {invite.status === 'pending' && (
                      <button
                        className="secondary-button"
                        disabled={task.busy}
                        onClick={() => setAction({ invite, type: 'revoke' })}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                )}
            </article>
          ))}
        </div>
      )}
      {action && (
        <Confirm
          title={
            action.type === 'regenerate'
              ? 'Replace invitation link?'
              : 'Revoke invitation?'
          }
          busy={task.busy}
          onCancel={() => setAction(null)}
          onConfirm={() =>
            task.run(
              (signal) =>
                api(
                  `/api/organisations/${org.id}/invitations/${action.invite.id}${action.type === 'regenerate' ? '/regenerate' : ''}`,
                  {
                    method: action.type === 'regenerate' ? 'POST' : 'DELETE',
                    signal,
                  },
                ),
              complete,
            )
          }
        >
          The previous link will no longer work.
        </Confirm>
      )}
      {feedback(task)}
    </>
  );
}
