import { Check, Copy } from 'lucide-react';
import { useClipboard } from '../../hooks/useClipboard';
export default function CopyButton({
  value,
  className = 'copy-button',
  label = 'Copy',
  size = 15,
}) {
  const { copied, error, copy } = useClipboard();
  return (
    <>
      <button
        type="button"
        className={`${className}${copied ? ' copied' : ''}`}
        onClick={() => copy(value)}
        aria-live="polite"
      >
        {copied ? <Check size={size} /> : <Copy size={size} />}
        {copied ? 'Copied' : label}
      </button>
      {error && (
        <span className="error-message" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
