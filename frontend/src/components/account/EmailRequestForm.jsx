import { EmailField, SubmitButton } from './AccountField';
export default function EmailRequestForm({ onSubmit, busy, children }) {
  return (
    <form onSubmit={onSubmit}>
      <EmailField />
      <SubmitButton busy={busy}>{children}</SubmitButton>
    </form>
  );
}
