import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from './AuthContext';
import { api } from '../api';

const WorkspaceContext = createContext(null);
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const candidate = pathname.match(/^\/organisations\/([^/]+)/)?.[1];
  const organisationId =
    candidate && !['new', 'invitations'].includes(candidate) ? candidate : null;
  const [organisations, setOrganisations] = useState([]);
  const [current, setCurrent] = useState(null);
  const [failure, setFailure] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true,
      pending = false,
      controller;
    setOrganisations([]);
    if (!user) return;
    async function refreshList() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      try {
        const rows = await api('/api/organisations', {
          signal: controller.signal,
        });
        if (active) setOrganisations(rows);
      } catch {
      } finally {
        pending = false;
      }
    }
    refreshList();
    window.addEventListener('focus', refreshList);
    window.addEventListener('quizpop:workspace-refresh', refreshList);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener('focus', refreshList);
      window.removeEventListener('quizpop:workspace-refresh', refreshList);
    };
  }, [user?.id, organisationId, attempt]);
  useEffect(() => {
    let active = true,
      controller;
    setCurrent(null);
    setFailure('');
    if (!user || !organisationId) return;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      try {
        const data = await api(
          `/api/organisations/${encodeURIComponent(organisationId)}`,
          { signal: controller.signal },
        );
        if (active) {
          setCurrent({ ...data, account: user.id });
          setOrganisations((rows) =>
            rows.map((row) => (row.id === data.id ? data : row)),
          );
          setFailure('');
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setCurrent(null);
          if ([401, 403, 404].includes(error.status))
            setOrganisations((rows) =>
              rows.filter((row) => row.id !== organisationId),
            );
          setFailure(
            [401, 403, 404].includes(error.status)
              ? 'Organisation access has ended or is unavailable.'
              : error.message,
          );
        }
      } finally {
        pending = false;
      }
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    window.addEventListener('quizpop:workspace-refresh', refresh);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('quizpop:workspace-refresh', refresh);
    };
  }, [organisationId, pathname, user?.id, attempt]);
  const organisation =
    current?.id === organisationId && current.account === user?.id
      ? current
      : null;
  const value = {
    organisationId,
    organisation,
    organisations,
    failure,
    refresh: () => setAttempt((n) => n + 1),
  };
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
export function useLibraryScope() {
  const workspace = useWorkspace();
  const id = workspace?.organisationId;
  return {
    ...workspace,
    base: id ? `/organisations/${id}/library` : '/library',
    apiBase: id ? `/api/organisations/${id}/quizzes` : '/api/library/quizzes',
  };
}
export function WorkspaceAccess({
  children,
  authors = false,
  managers = false,
  owner = false,
}) {
  const { user, loading } = useAuth();
  const { organisationId, organisation, failure } = useWorkspace();
  const location = useLocation();
  if (loading) return <p role="status">Loading account...</p>;
  if (!user)
    return (
      <Navigate
        replace
        to={`/account/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  if (failure)
    return <Navigate replace to="/organisations" state={{ notice: failure }} />;
  if (!organisationId) return children;
  if (!organisation)
    return <p role="status">Checking workspace permissions...</p>;
  if (
    (authors && !organisation.capabilities.author_quizzes) ||
    (managers && !organisation.capabilities.manage_members) ||
    (owner && organisation.role !== 'owner')
  )
    return (
      <Navigate
        replace
        to={`/organisations/${organisationId}`}
        state={{ notice: 'Your role cannot access that screen.' }}
      />
    );
  return (
    <div key={`${user.id}:${organisationId}:${organisation.role}`}>
      {children}
    </div>
  );
}
export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { organisationId, organisations, organisation } = useWorkspace();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!user) return null;
  if (/^\/(host|join)\//.test(pathname))
    return (
      <Link className="back-link" to="/organisations">
        Workspaces
      </Link>
    );
  return (
    <label className="workspace-switcher">
      <span>Workspace</span>
      <select
        aria-label="Workspace"
        value={organisationId || 'personal'}
        onChange={(event) =>
          navigate(
            event.target.value === 'personal'
              ? '/library'
              : `/organisations/${event.target.value}`,
          )
        }
      >
        <option value="personal">Personal</option>
        {organisationId &&
          !organisations.some((row) => row.id === organisationId) && (
            <option value={organisationId}>
              {organisation?.name || 'Organisation'}
            </option>
          )}
        {organisations.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} · {row.role}
          </option>
        ))}
      </select>
      <Link className="back-link" to="/organisations">
        Organisations
      </Link>
    </label>
  );
}
