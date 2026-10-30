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
    const controller = new AbortController();
    api('/api/auth/config', { signal: controller.signal })
      .then((config) => {
        if (!controller.signal.aborted) setGoogle(config.google);
      })
      .catch(() => {});
    return () => {
      request.current?.abort();
      controller.abort();
    };
  }, [refreshUser]);
  function updateUser(account) {
    request.current?.abort();
    setUser(account);
    setLoading(false);
    setError('');
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
