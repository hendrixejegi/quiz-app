import { useEffect, useState } from 'react';
import { api, API_URL } from '../api';
import { subscribeHost } from '../live/hostSubscription';
import { useAsyncTask } from './useAsyncTask';
export function useHostRoom(eventId, token, user, loading) {
  const [snapshot, setSnapshot] = useState({
    data: null,
    error: '',
    connection: 'connecting',
  });
  const task = useAsyncTask();
  useEffect(() => {
    if (loading && !token) return;
    setSnapshot({ data: null, error: '', connection: 'connecting' });
    const url = new URL(API_URL, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/host/${encodeURIComponent(eventId)}/ws`;
    return subscribeHost({
      eventId,
      token,
      request: api,
      openSocket: (url) => new WebSocket(url),
      socketUrl: url.href,
      onChange: setSnapshot,
    });
  }, [eventId, token, user?.id, loading]);
  function start() {
    task.run(
      (signal) =>
        api(`/api/host/${encodeURIComponent(eventId)}/start`, {
          method: 'POST',
          signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      () =>
        setSnapshot((current) => ({
          ...current,
          data: current.data ? { ...current.data, state: 'active' } : null,
        })),
    );
  }
  return {
    ...snapshot,
    error: snapshot.error || task.error,
    busy: task.busy,
    start,
  };
}
