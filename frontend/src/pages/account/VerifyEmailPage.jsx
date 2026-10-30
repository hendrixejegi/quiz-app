import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../api';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import AccountFrame from '../../components/account/AccountFrame';
import EmailRequestForm from '../../components/account/EmailRequestForm';
import { SubmitButton } from '../../components/account/AccountField';
export default function VerifyEmailPage() {
  const task = useAsyncTask();
  const [params, setParams] = useSearchParams();
  const token = params.get('token');
  const [message, setMessage] = useState('');
  function submit(event) {
    event.preventDefault();
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    task.run(
      (signal) =>
        api(token ? '/api/auth/verify' : '/api/auth/request-verify-token', {
          method: 'POST',
          signal,
          body: JSON.stringify(token ? { token } : values),
        }),
      () => {
        setMessage(
          token
            ? 'Email verified. You can now sign in.'
            : 'If this address has an eligible account, an email is on its way. Check your inbox and spam folder.',
        );
        if (token) setParams({}, { replace: true });
      },
    );
  }
  return (
    <AccountFrame
      title="Verify your email"
      message={message}
      error={task.error}
    >
      {token ? (
        <form onSubmit={submit}>
          <SubmitButton busy={task.busy}>Verify email</SubmitButton>
        </form>
      ) : (
        <EmailRequestForm onSubmit={submit} busy={task.busy}>
          Send verification email
        </EmailRequestForm>
      )}
    </AccountFrame>
  );
}
