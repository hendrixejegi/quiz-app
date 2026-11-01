import { useEffect } from 'react';
import { libraryReturnPath } from '../../library';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import AccountFrame from '../../components/account/AccountFrame';
import AccountField, {
  SubmitButton,
} from '../../components/account/AccountField';
export default function ProfilePage() {
  const { user, loading, setUser, signOut } = useAuth();
  const task = useAsyncTask();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState('');
  useEffect(() => {
    const pending =
      sessionStorage.getItem('quizpop:auth-return') ||
      (sessionStorage.getItem('quizpop:pending-invitation')
        ? '/organisations/invitations/accept'
        : null);
    if (user && !loading && pending && !location.state?.switchAccount) {
      sessionStorage.removeItem('quizpop:auth-return');
      const target = libraryReturnPath(pending);
      if (target !== '/') navigate(target, { replace: true });
    }
  }, [user?.id, loading]);
  function submit(event) {
    event.preventDefault();
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    task.run(
      (signal) =>
        api('/api/auth/users/me', {
          method: 'PATCH',
          signal,
          body: JSON.stringify(values),
        }),
      (updated) => {
        setUser(updated);
        setMessage('Profile saved.');
      },
    );
  }
  function logout(all) {
    task.run(
      (signal) => signOut(all, signal),
      () => navigate('/account/login'),
    );
  }
  return (
    <AccountFrame
      title="Your account"
      message={message}
      error={task.error}
      googleAction={user ? 'link' : undefined}
      footer={
        user && !loading ? (
          <div className="account-links">
            <button
              className="secondary-button"
              disabled={task.busy}
              onClick={() => logout(false)}
            >
              Sign out
            </button>
            <button
              className="secondary-button"
              disabled={task.busy}
              onClick={() => logout(true)}
            >
              Sign out everywhere
            </button>
            <Link to="/account/forgot">Reset password</Link>
          </div>
        ) : null
      }
    >
      {loading ? (
        <p role="status">Loading account…</p>
      ) : !user ? (
        <p>Sign in to manage your account.</p>
      ) : (
        <>
          <form onSubmit={submit} key={user.id}>
            <p>{user.email} · Email verified</p>
            <AccountField
              label="Display name"
              name="display_name"
              autoComplete="nickname"
              maxLength={80}
              defaultValue={user.display_name}
              required
            />
            <SubmitButton busy={task.busy}>Save profile</SubmitButton>
          </form>
        </>
      )}
    </AccountFrame>
  );
}
