import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api';
import { libraryReturnPath } from '../../library';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import AccountFrame from '../../components/account/AccountFrame';
import {
  EmailField,
  PasswordField,
  SubmitButton,
} from '../../components/account/AccountField';
export default function LoginPage() {
  const task = useAsyncTask();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    task.run(
      async (signal) => {
        await api('/api/auth/session/login', {
          method: 'POST',
          signal,
          body: new URLSearchParams({
            username: fields.get('email'),
            password: fields.get('password'),
          }),
        });
        return api('/api/auth/users/me', { signal });
      },
      (user) => {
        setUser(user);
        const target = libraryReturnPath(
          params.get('next') ||
            sessionStorage.getItem('quizpop:auth-return') ||
            (sessionStorage.getItem('quizpop:pending-invitation')
              ? '/organisations/invitations/accept'
              : null),
        );
        sessionStorage.removeItem('quizpop:auth-return');
        navigate(target);
      },
    );
  }
  const oauthError =
    params.get('error') === 'google'
      ? 'Google sign-in could not finish. If you already have an email account, sign in and link Google from Account.'
      : '';
  return (
    <AccountFrame
      title="Sign in"
      error={task.error || oauthError}
      googleAction="login"
    >
      <form onSubmit={submit}>
        <EmailField />
        <PasswordField login />
        <SubmitButton busy={task.busy}>Sign in</SubmitButton>
      </form>
    </AccountFrame>
  );
}
