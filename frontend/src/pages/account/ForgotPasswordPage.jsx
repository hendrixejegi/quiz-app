import { useState } from 'react';
import { api } from '../../api';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import AccountFrame from '../../components/account/AccountFrame';
import EmailRequestForm from '../../components/account/EmailRequestForm';
export default function ForgotPasswordPage() {
  const task = useAsyncTask();
  const [message, setMessage] = useState('');
  function submit(event) {
    event.preventDefault();
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    task.run(
      (signal) =>
        api('/api/auth/forgot-password', {
          method: 'POST',
          signal,
          body: JSON.stringify(values),
        }),
      () =>
        setMessage(
          'If this address has an eligible account, an email is on its way. Check your inbox and spam folder.',
        ),
    );
  }
  return (
    <AccountFrame
      title="Reset your password"
      error={task.error}
      message={message}
    >
      <EmailRequestForm onSubmit={submit} busy={task.busy}>
        Send reset link
      </EmailRequestForm>
    </AccountFrame>
  );
}
