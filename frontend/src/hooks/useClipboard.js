import { useEffect, useRef, useState } from 'react';
export function useClipboard() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef({ active: true, timer: null });
  useEffect(() => {
    lifetime.current.active = true;
    return () => {
      lifetime.current.active = false;
      clearTimeout(lifetime.current.timer);
    };
  }, []);
  async function copy(value) {
    setError('');
    try {
      try {
        if (!navigator.clipboard?.writeText) throw Error();
        await navigator.clipboard.writeText(value);
      } catch {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        let success;
        try {
          field.select();
          success = document.execCommand('copy');
        } finally {
          field.remove();
        }
        if (!success)
          throw Error(
            'Clipboard access is unavailable. Copy the link manually.',
          );
      }
      if (!lifetime.current.active) return;
      setCopied(true);
      clearTimeout(lifetime.current.timer);
      lifetime.current.timer = setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      if (lifetime.current.active) setError(reason.message);
    }
  }
  return { copied, error, copy };
}
