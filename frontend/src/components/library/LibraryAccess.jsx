import {
  WorkspaceAccess,
  useLibraryScope,
} from '../../contexts/WorkspaceContext';
import { Link, Navigate, useLocation } from 'react-router';
import { useEffect } from 'react';
import { libraryReturnPath } from '../../library';
import { useAuth } from '../../contexts/AuthContext';
export default function LibraryAccess({ children, organisationAuthor = true }) {
  const { user, loading, error, refreshUser } = useAuth();
  const location = useLocation();
  const scope = useLibraryScope();
  useEffect(() => {
    if (!loading && !user)
      sessionStorage.setItem(
        'quizpop:auth-return',
        libraryReturnPath(location.pathname + location.search),
      );
  }, [loading, user?.id, location.pathname, location.search]);
  if (loading) return <p role="status">Loading your account...</p>;
  if (error)
    return (
      <section className="notice-card">
        <p role="alert">{error}</p>
        <button className="secondary-button" onClick={refreshUser}>
          Retry account loading
        </button>
      </section>
    );
  if (!user)
    return (
      <Navigate
        replace
        to={`/account/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  return (
    <WorkspaceAccess authors={organisationAuthor}>
      <div
        key={`${user.id}:${scope.organisationId || 'personal'}`}
        className="library-wrap"
      >
        {children}
      </div>
    </WorkspaceAccess>
  );
}
export function LibraryHeading({ title, description, children, back = true }) {
  const { base, organisation } = useLibraryScope();
  return (
    <header className="library-heading">
      <div>
        {back && (
          <Link to={base} className="back-link">
            {organisation ? 'Organisation library' : 'My quizzes'}
          </Link>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="library-actions">{children}</div>
    </header>
  );
}
export function ResourceState({ resource }) {
  if (resource.loading) return <p role="status">Loading your quizzes...</p>;
  if (resource.error)
    return (
      <section className="notice-card">
        <p role="alert">{resource.error}</p>
        <button className="secondary-button" onClick={resource.retry}>
          Try again
        </button>
      </section>
    );
  return null;
}
