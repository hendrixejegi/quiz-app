import { useState } from 'react';
import { api } from '../../api';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import AccountFrame from '../../components/account/AccountFrame';
import AccountField, {
  EmailField,
  PasswordField,
  SubmitButton,
} from '../../components/account/AccountField';
export default function RegisterPage() {
  const task = useAsyncTask();
  const [message, setMessage] = useState('');
  function submit(event) {
    event.preventDefault();
    setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    task.run(
      async (signal) => {
        await api('/api/auth/register', {
          method: 'POST',
          signal,
          body: JSON.stringify(values),
        });
        if (!signal.aborted)
          setMessage('Account created. Verify your email before signing in.');
        await api('/api/auth/request-verify-token', {
          method: 'POST',
          signal,
          body: JSON.stringify({ email: values.email }),
        });
      },
      () =>
        setMessage(
          'Account created. Check your email to verify it before signing in.',
        ),
    );
  }
  return (
    <AccountFrame
      title="Create an account"
      error={task.error}
      message={message}
      googleAction="login"
    >
      <form onSubmit={submit}>
        <AccountField
          label="Display name"
          name="display_name"
          autoComplete="nickname"
          maxLength={80}
          required
        />
        <EmailField />
        <PasswordField />
        <SubmitButton busy={task.busy}>Create account</SubmitButton>
      </form>
    </AccountFrame>
  );
}
