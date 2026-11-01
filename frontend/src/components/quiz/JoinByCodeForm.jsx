import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api';
import { useAsyncTask } from '../../hooks/useAsyncTask';
import ParticipantIdentityFields from './ParticipantIdentityFields';
export default function JoinByCodeForm({ embedded = false }) {
  const [value, setValue] = useState({
    join_code: '',
    name: '',
    display_name: '',
  });
  const { run, busy, error } = useAsyncTask();
  const navigate = useNavigate();
  function submit(event) {
    event.preventDefault();
    const code = value.join_code.trim().toUpperCase();
    run(
      (signal) =>
        api(`/api/events/${encodeURIComponent(code)}/participants`, {
          method: 'POST',
          signal,
          body: JSON.stringify({
            name: value.name,
            display_name: value.display_name,
          }),
        }),
      (result) => {
        sessionStorage.setItem(
          `quiz:${code}:reconnect`,
          result.reconnect_token,
        );
        if (result.account_id)
          sessionStorage.setItem(
            `quiz:${code}:reconnect:account`,
            result.account_id,
          );
        navigate(`/join/${encodeURIComponent(code)}`);
      },
    );
  }
  return (
    <form
      id="participant-entry-form"
      className={
        embedded
          ? 'participant-entry-card organisation-join'
          : 'join-card participant-entry-card'
      }
      onSubmit={submit}
    >
      {!embedded && (
        <>
          <h2>Join with a code.</h2>
          <p>Enter your details to join a quiz room.</p>
        </>
      )}
      <label className="field-label" htmlFor="participant-join-code">
        JOIN CODE
      </label>
      <input
        id="participant-join-code"
        className="text-input code-input"
        maxLength="8"
        autoComplete="off"
        placeholder="e.g. 9ULG0J8"
        value={value.join_code}
        onChange={(event) =>
          setValue({ ...value, join_code: event.target.value.toUpperCase() })
        }
        required
      />
      <ParticipantIdentityFields
        value={value}
        onChange={setValue}
        prefix="participant-entry"
        home
      />
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button full-button" disabled={busy}>
        {busy ? (
          'Joining…'
        ) : (
          <>
            Join quiz <ArrowRight size={17} />
          </>
        )}
      </button>
    </form>
  );
}
