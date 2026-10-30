import { Link, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import { api } from '../../api';
export default function AccountFrame({
  title,
  children,
  message,
  error,
  googleAction,
  footer,
}) {
  const { pathname } = useLocation();
  const mode = pathname.split('/').at(-1);
  const { google } = useAuth();
  const googleTask = useAsyncTask();
  function authorize() {
    googleTask.run(
      (signal) =>
        api(
          `/api/auth/${googleAction === 'link' ? 'link/google' : 'google'}/authorize`,
          { signal },
        ),
      (result) => window.location.assign(result.authorization_url),
    );
  }
  return (
    <section className="account-layout">
      <aside className="account-context">
        <h2>A place for your quizzes.</h2>
        <p>Sign in to create and host a quiz with your account.</p>
        <p>Joining friends? You can still play as a guest.</p>
        <Link className="back-link" to="/">
          Back to QuizPop
        </Link>
      </aside>
      <div className="account-panel">
        <h1>{title}</h1>
        {children}
        {(error || googleTask.error) && (
          <p className="error-message" role="alert">
            {error || googleTask.error}
          </p>
        )}
        {message && (
          <p className="account-message" role="status">
            {message}
          </p>
        )}
        {google && googleAction && (
          <button
            className="secondary-button"
            disabled={googleTask.busy}
            onClick={authorize}
          >
            {googleAction === 'link'
              ? 'Link Google account'
              : 'Continue with Google'}
          </button>
        )}
        <div className="account-links">
          {mode !== 'login' && <Link to="/account/login">Sign in</Link>}
          {mode !== 'register' && (
            <Link to="/account/register">Create account</Link>
          )}
          {mode === 'login' && (
            <>
              <Link to="/account/forgot">Forgot password?</Link>
              <Link to="/account/verify">Resend verification email</Link>
            </>
          )}
        </div>
        {footer}
      </div>
    </section>
  );
}
