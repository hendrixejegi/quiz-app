import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../api';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import AccountFrame from '../../components/account/AccountFrame';
import {
  PasswordField,
  SubmitButton,
} from '../../components/account/AccountField';
export default function ResetPasswordPage() {
  const task = useAsyncTask();
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState('');
  function submit(event) {
    event.preventDefault();
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    task.run(
      (signal) => {
        const token = params.get('token');
        if (!token)
          throw Error(
            'Open the reset link in your email, or request a new one.',
          );
        return api('/api/auth/reset-password', {
          method: 'POST',
          signal,
          body: JSON.stringify({ token, password: values.password }),
        });
      },
      () => {
        setParams({}, { replace: true });
        setMessage(
          'Password updated. All sessions have been revoked. Sign in with your new password.',
        );
      },
    );
  }
  return (
    <AccountFrame
      title="Choose a new password"
      error={task.error}
      message={message}
    >
      <form onSubmit={submit}>
        <PasswordField />
        <SubmitButton busy={task.busy}>Save password</SubmitButton>
      </form>
    </AccountFrame>
  );
}
