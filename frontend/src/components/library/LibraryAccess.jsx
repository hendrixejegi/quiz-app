import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
export default function LibraryAccess({ children }) {
  const { user, loading, error, refreshUser } = useAuth();
  const location = useLocation();
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
    <div key={user.id} className="library-wrap">
      {children}
    </div>
  );
}
export function LibraryHeading({ title, description, children, back = true }) {
  return (
    <header className="library-heading">
      <div>
        {back && (
          <Link to="/library" className="back-link">
            My quizzes
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
