export function subscribeParticipant({
  joinCode,
  accountId,
  request,
  storage,
  onChange,
  schedule = setTimeout,
  cancel = clearTimeout,
  now = Date.now,
}) {
  let active = true,
    timer;
  const lifetime = new AbortController();
  const key = `quiz:${joinCode}:reconnect`;
  const accountKey = `${key}:account`;
  const boundAccount = storage.getItem(accountKey);
  if (boundAccount && boundAccount !== accountId) {
    storage.removeItem(key);
    storage.removeItem(accountKey);
  }
  let token = storage.getItem(key);
  const emit = (value) => {
    if (active) onChange(value);
  };
  function terminal(event, error = '') {
    if (!active) return;
    storage.removeItem(key);
    storage.removeItem(accountKey);
    token = null;
    emit({
      event: event
        ? { title: event.title, join_code: event.join_code, state: 'closed' }
        : null,
      participant: null,
      error,
      loading: false,
    });
  }
  function organisationFailure(reason) {
    if (!String(reason.code || '').startsWith('ORG_')) return false;
    terminal(null, reason.message);
    emit({ access: reason.code });
    return true;
  }
  async function publicRoom() {
    try {
      const event = await request(
        `/api/events/${encodeURIComponent(joinCode)}`,
        { signal: lifetime.signal },
      );
      if (event.state === 'closed') terminal(event);
      else emit({ event, participant: null, error: '', loading: false });
    } catch (reason) {
      if (organisationFailure(reason)) return;
      if (reason.status === 404) {
        terminal(null, 'This event is unavailable.');
        return;
      }
      if (!lifetime.signal.aborted)
        emit({
          event: null,
          participant: null,
          error: reason.message,
          loading: false,
        });
    }
  }
  async function refresh() {
    if (!active) return;
    if (!token) {
      await publicRoom();
      return;
    }
    try {
      const event = await request(
        `/api/events/${encodeURIComponent(joinCode)}/state`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: lifetime.signal,
        },
      );
      if (event.state === 'closed') {
        terminal(event);
        return;
      }
      if (event.organisation_id && accountId)
        storage.setItem(accountKey, accountId);
      emit({
        event: { ...event, received_at: now() },
        participant: {
          display_name: event.participant_display_name,
          reconnect_token: token,
        },
        error: '',
        access: null,
        loading: false,
      });
    } catch (reason) {
      if (organisationFailure(reason)) return;
      if (!active) return;
      if ([401, 403].includes(reason.status)) {
        storage.removeItem(key);
        token = null;
        await publicRoom();
        return;
      }
      if (reason.status === 404) {
        terminal(null, 'This event is unavailable.');
        return;
      }
      emit({ error: reason.message, loading: false });
    }
    if (active && token) timer = schedule(refresh, 1000);
  }
  refresh();
  return () => {
    active = false;
    cancel(timer);
    lifetime.abort();
  };
}
