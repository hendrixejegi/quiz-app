export function feedback(task) {
  return (
    task.error && (
      <p className="error-message" role="alert">
        {task.error}
      </p>
    )
  );
}
export function orgPath(id, suffix = '') {
  return `/organisations/${id}${suffix}`;
}
export function Confirm({ title, children, busy, onCancel, onConfirm }) {
  return (
    <section className="library-confirm" role="group" aria-label={title}>
      <h2>{title}</h2>
      <p>{children}</p>
      <div className="library-actions">
        <button
          autoFocus
          className="secondary-button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="primary-button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Please wait...' : 'Confirm'}
        </button>
      </div>
    </section>
  );
}
