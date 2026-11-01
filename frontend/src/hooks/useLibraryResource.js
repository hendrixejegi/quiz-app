import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncTask } from './useAsyncTask';
export function useLibraryResource(path) {
  const { user, setUser } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: '' });
    api(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: '' });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        if (reason.status === 401) setUser(null);
        if ([403, 404].includes(reason.status))
          window.dispatchEvent(new Event('quizpop:workspace-refresh'));
        setState({ data: null, loading: false, error: reason.message });
      });
    return () => controller.abort();
  }, [path, attempt, user?.id]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
export function useLibraryTask() {
  const task = useAsyncTask();
  const { setUser } = useAuth();
  return {
    ...task,
    run: (operation, success) =>
      task.run(async (signal) => {
        try {
          return await operation(signal);
        } catch (reason) {
          if (!signal.aborted && reason.status === 401) setUser(null);
          throw reason;
        }
      }, success),
  };
}
