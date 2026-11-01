import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import LibraryAccess from '../../components/library/LibraryAccess';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useLibraryTask } from '../../hooks/useLibraryResource';
import { api } from '../../api';
const KEY = 'quizpop:pending-invitation';
export default function InvitationAcceptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => sessionStorage.getItem(KEY) || '');
  useEffect(() => {
    if (location.hash) {
      const value = location.hash.slice(1);
      sessionStorage.setItem(KEY, value);
      setToken(value);
      navigate(location.pathname, { replace: true });
    }
  }, [location.hash, location.pathname]);
  if (location.hash) return <p role="status">Opening invitation...</p>;
  return (
    <LibraryAccess organisationAuthor={false}>
      <InvitationDetails
        token={token}
        clear={() => {
          sessionStorage.removeItem(KEY);
          setToken('');
        }}
      />
    </LibraryAccess>
  );
}
function InvitationDetails({ token, clear }) {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const task = useLibraryTask();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  useEffect(() => {
    setInfo(null);
    if (token)
      task.run(
        (signal) =>
          api('/api/organisations/invitations/preview', {
            method: 'POST',
            signal,
            body: JSON.stringify({ token }),
          }),
        setInfo,
      );
  }, [token, user.id]);
  if (!token)
    return (
      <section className="library-panel">
        <h1>Open your invitation link</h1>
        <p>Use the full link shared by an organisation manager.</p>
        <Link to="/organisations">Your organisations</Link>
      </section>
    );
  return (
    <section className="library-panel invitation-accept">
      <h1>Organisation invitation</h1>
      <p>Signed in as {user.email}.</p>
      {!info && !task.error && <p role="status">Checking invitation...</p>}
      {info && (
        <>
          <h2>{info.organisation.name}</h2>
          <p>
            Invited role: <strong>{info.role}</strong>. Expires{' '}
            {new Date(info.expires_at).toLocaleString()}.
          </p>
          <p>
            Accepting gives you access to this organisation. Your personal
            quizzes remain private.
          </p>
          <button
            className="primary-button"
            disabled={task.busy}
            onClick={() =>
              task.run(
                (signal) =>
                  api('/api/organisations/invitations/accept', {
                    method: 'POST',
                    signal,
                    body: JSON.stringify({ token }),
                  }),
                (org) => {
                  clear();
                  workspace.refresh();
                  navigate(`/organisations/${org.id}`, {
                    replace: true,
                    state: { notice: 'Organisation invitation accepted.' },
                  });
                },
              )
            }
          >
            {info.accepted ? 'Continue to organisation' : 'Accept invitation'}
          </button>
        </>
      )}
      {task.error && (
        <p className="error-message" role="alert">
          {task.error}
        </p>
      )}
      <div className="library-actions organisation-submit">
        <Link
          className="back-link"
          to="/account/profile"
          state={{ switchAccount: true }}
        >
          Switch account
        </Link>
        <button
          className="back-link"
          onClick={() => {
            clear();
            navigate('/organisations', { replace: true });
          }}
        >
          Dismiss invitation
        </button>
      </div>
    </section>
  );
}
