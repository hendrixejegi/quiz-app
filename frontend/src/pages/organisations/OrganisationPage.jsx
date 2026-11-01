import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
} from '../../components/library/LibraryAccess';
import { useLibraryTask } from '../../hooks/useLibraryResource';
import { useWorkspace, WorkspaceAccess } from '../../contexts/WorkspaceContext';

import { api } from '../../api';

import JoinByCodeForm from '../../components/quiz/JoinByCodeForm';

import { Confirm, feedback, orgPath } from './OrganisationUI';
export default function OrganisationPage() {
  return (
    <LibraryAccess organisationAuthor={false}>
      <WorkspaceAccess>
        <OrganisationOverview />
      </WorkspaceAccess>
    </LibraryAccess>
  );
}
function OrganisationOverview() {
  const { organisation: org, refresh } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const task = useLibraryTask();
  const navigate = useNavigate();
  const { state } = useLocation();
  return (
    <>
      <LibraryHeading
        title={org.name}
        back={false}
        description={`Organisation workspace · Your role: ${org.role}`}
      >
        <Link className="secondary-button" to="/organisations">
          All organisations
        </Link>
      </LibraryHeading>
      {state?.notice && <p role="status">{state.notice}</p>}
      <nav className="organisation-nav" aria-label="Organisation navigation">
        {org.capabilities.author_quizzes && (
          <Link className="primary-button" to={orgPath(org.id, '/library')}>
            Shared quizzes
          </Link>
        )}
        {org.capabilities.manage_members && (
          <>
            <Link className="secondary-button" to={orgPath(org.id, '/members')}>
              Members
            </Link>
            <Link
              className="secondary-button"
              to={orgPath(org.id, '/invitations')}
            >
              Invitations
            </Link>
            <Link className="secondary-button" to={orgPath(org.id, '/audit')}>
              Audit history
            </Link>
          </>
        )}
        {org.role === 'owner' && (
          <Link className="secondary-button" to={orgPath(org.id, '/settings')}>
            Settings and ownership
          </Link>
        )}
      </nav>
      <section className="library-panel">
        <h2>Join your organisation's game</h2>
        <p>
          Use the join code shared by your host. Only active organisation
          members can play.
        </p>
        <JoinByCodeForm embedded />
      </section>
      <section className="library-panel">
        <h2>Membership</h2>
        {org.role === 'owner' ? (
          <p>
            Transfer ownership to an active member before leaving. Organisation
            deletion is not available.
          </p>
        ) : (
          <>
            <p>
              Leaving ends access to this workspace and its games. Organisation
              quizzes and existing scores remain with the organisation.
            </p>
            <button
              className="secondary-button"
              disabled={task.busy}
              onClick={() => setConfirm(true)}
            >
              Leave organisation
            </button>
          </>
        )}
      </section>
      {confirm && (
        <Confirm
          title="Leave this organisation?"
          busy={task.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            task.run(
              (signal) =>
                api(`/api/organisations/${org.id}/leave`, {
                  method: 'POST',
                  signal,
                }),
              () => {
                refresh();
                navigate('/organisations', {
                  replace: true,
                  state: { notice: 'You left the organisation.' },
                });
              },
            )
          }
        >
          You will lose access to its private content and live games.
        </Confirm>
      )}
      {feedback(task)}
    </>
  );
}
