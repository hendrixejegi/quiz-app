import { useId } from 'react';
export default function AccountField({
  label,
  name,
  type = 'text',
  hint,
  ...props
}) {
  const id = useId();
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="text-input"
        name={name}
        type={type}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function PasswordField({ login = false }) {
  return (
    <AccountField
      label="Password"
      name="password"
      type="password"
      autoComplete={login ? 'current-password' : 'new-password'}
      minLength={login ? 1 : 12}
      maxLength={128}
      required
      hint={login ? undefined : 'Use 12 to 128 characters.'}
    />
  );
}
export function EmailField() {
  return (
    <AccountField
      label="Email"
      name="email"
      type="email"
      autoComplete="email"
      maxLength={320}
      required
    />
  );
}
export function SubmitButton({ busy, children }) {
  return (
    <button className="primary-button" disabled={busy}>
      {busy ? 'Please wait…' : children}
    </button>
  );
}
