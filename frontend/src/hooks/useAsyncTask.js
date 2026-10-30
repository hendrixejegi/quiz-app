import { useEffect, useRef, useState } from 'react';
// Every page action has an abortable lifetime; its success handler only runs while mounted.
export function useAsyncTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function run(task, onSuccess) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await task(controller.signal);
      if (!controller.signal.aborted) onSuccess?.(result);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return { run, busy, error, setError };
}
