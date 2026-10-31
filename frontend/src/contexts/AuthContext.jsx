import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
const ACCOUNT_CHANGE_KEY = 'quizpop:account-change';
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [google, setGoogle] = useState(false);
  const request = useRef(null);
  const refreshUser = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const account = await api('/api/auth/users/me', {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setUser(account);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setUser(null);
        if (reason.status !== 401)
          setError('Could not load your account. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refreshUser();
    // Session cookies are shared across tabs. Recheck identity and unmount
    // private editors when another tab signs in or out; never store user data.
    const syncAccount = (event) => {
      if (event.key === ACCOUNT_CHANGE_KEY) refreshUser();
    };
    window.addEventListener('storage', syncAccount);
    const controller = new AbortController();
    api('/api/auth/config', { signal: controller.signal })
      .then((config) => {
        if (!controller.signal.aborted) setGoogle(config.google);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener('storage', syncAccount);
      request.current?.abort();
      controller.abort();
    };
  }, [refreshUser]);
  function updateUser(account) {
    request.current?.abort();
    setUser(account);
    setLoading(false);
    setError('');
    if (user?.id !== account?.id) {
      try {
        localStorage.setItem(
          ACCOUNT_CHANGE_KEY,
          `${Date.now()}:${Math.random()}`,
        );
      } catch {
        // Authentication still works if browser storage is unavailable.
      }
    }
  }
  async function signOut(all, signal) {
    await api(all ? '/api/auth/revoke-sessions' : '/api/auth/session/logout', {
      method: 'POST',
      signal,
    });
    if (!signal?.aborted) updateUser(null);
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        google,
        setUser: updateUser,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
