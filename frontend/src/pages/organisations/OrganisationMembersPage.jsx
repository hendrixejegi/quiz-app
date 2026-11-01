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
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api';

import { Confirm, feedback, orgPath } from './OrganisationUI';
export default function OrganisationMembersPage() {
  return (
    <LibraryAccess organisationAuthor={false}>
      <WorkspaceAccess managers>
        <Members />
      </WorkspaceAccess>
    </LibraryAccess>
  );
}
function Members() {
  const { organisation: org, refresh } = useWorkspace();
  const resource = useLibraryResource(`/api/organisations/${org.id}/members`);
  const task = useLibraryTask();
  const [action, setAction] = useState(null);
  const { user } = useAuth();
  function perform() {
    const { member, role } = action;
    task.run(
      (signal) =>
        api(`/api/organisations/${org.id}/members/${member.id}`, {
          method: role ? 'PATCH' : 'DELETE',
          signal,
          ...(role ? { body: JSON.stringify({ role }) } : {}),
        }),
      () => {
        setAction(null);
        resource.retry();
        refresh();
      },
    );
  }
  return (
    <>
      <LibraryHeading title="Members" description={org.name}>
        <Link className="secondary-button" to={orgPath(org.id)}>
          Organisation overview
        </Link>
      </LibraryHeading>
      <ResourceState resource={resource} />
      {resource.data && (
        <div className="library-list">
          {resource.data.map((member) => {
            const manageable =
              member.active &&
              member.role !== 'owner' &&
              (org.role === 'owner' || member.role !== 'admin');
            return (
              <article className="library-row" key={member.id}>
                <div>
                  <h2>{member.display_name || member.email}</h2>
                  <p>{member.email}</p>
                  <span>
                    {member.role} · {member.active ? 'Active' : 'Inactive'}
                    {member.user_id === user.id ? ' · You' : ''}
                  </span>
                </div>
                {manageable && (
                  <div className="library-actions">
                    <label>
                      Role
                      <select
                        aria-label={`Role for ${member.email}`}
                        disabled={task.busy}
                        value={member.role}
                        onChange={(e) =>
                          setAction({ member, role: e.target.value })
                        }
                      >
                        {(org.role === 'owner'
                          ? ['admin', 'instructor', 'learner']
                          : ['instructor', 'learner']
                        ).map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={task.busy}
                      onClick={() => setAction({ member })}
                    >
                      Remove<span className="sr-only"> {member.email}</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {action && (
        <Confirm
          title={action.role ? 'Change member role?' : 'Remove this member?'}
          busy={task.busy}
          onCancel={() => setAction(null)}
          onConfirm={perform}
        >
          {action.member.email}:{' '}
          {action.role
            ? `change role to ${action.role}. Permissions change immediately.`
            : 'organisation access ends immediately; existing content and scores are retained.'}
        </Confirm>
      )}
      {feedback(task)}
    </>
  );
}
