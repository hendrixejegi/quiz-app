// Transport lifecycle is separate from React so cleanup and authorization can be tested directly.
export function subscribeHost({
  eventId,
  token = '',
  request,
  openSocket,
  socketUrl,
  onChange,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let active = true,
    terminal = false,
    connected = false,
    polling = false,
    socket,
    pollTimer,
    retryTimer,
    revision = 0;
  const lifetime = new AbortController();
  let snapshot = { data: null, error: '', connection: 'connecting' };
  const emit = (updates) => {
    if (active) {
      snapshot = { ...snapshot, ...updates };
      onChange(snapshot);
    }
  };
  function stopTimers() {
    cancel(pollTimer);
    cancel(retryTimer);
  }
  function deny(
    message = 'Host access ended. Sign in as the quiz owner to continue.',
  ) {
    if (!active || terminal) return;
    terminal = true;
    connected = false;
    stopTimers();
    lifetime.abort();
    emit({ data: null, error: message, connection: 'offline' });
    socket?.close();
  }
  async function poll() {
    if (!active || terminal || connected || polling) return;
    polling = true;
    const version = revision;
    try {
      const data = await request(`/api/host/${encodeURIComponent(eventId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: lifetime.signal,
      });
      if (active && !terminal && revision === version)
        emit({ data, error: '' });
    } catch (reason) {
      if (!active || terminal) return;
      if ([401, 403, 404].includes(reason.status)) {
        deny(reason.message);
        return;
      }
      emit({ error: reason.message });
    } finally {
      polling = false;
      if (active && !terminal && !connected) pollTimer = schedule(poll, 1000);
    }
  }
  function connect() {
    if (!active || terminal) return;
    try {
      socket = openSocket(socketUrl);
    } catch {
      emit({ connection: 'reconnecting' });
      retryTimer = schedule(connect, 1500);
      return;
    }
    const current = socket;
    current.onopen = () => {
      if (!active || terminal) return;
      connected = true;
      cancel(pollTimer);
      emit({ connection: 'connected' });
      current.send(token);
    };
    current.onmessage = (event) => {
      if (!active || terminal) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'host_lobby') {
        revision++;
        emit({ data: message.data, error: '', connection: 'connected' });
      } else if (message.type === 'error') deny(message.detail);
    };
    current.onclose = (event) => {
      if (!active || terminal) return;
      connected = false;
      if ([4401, 4403].includes(event.code)) {
        deny();
        return;
      }
      emit({ connection: 'reconnecting' });
      cancel(pollTimer);
      poll();
      retryTimer = schedule(connect, 1500);
    };
    current.onerror = () => current.close();
  }
  poll();
  connect();
  return () => {
    active = false;
    stopTimers();
    lifetime.abort();
    if (socket) {
      socket.onclose = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
    }
  };
}
