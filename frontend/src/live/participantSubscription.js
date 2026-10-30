export function subscribeParticipant({
  joinCode,
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
  let token = storage.getItem(key);
  const emit = (value) => {
    if (active) onChange(value);
  };
  async function publicRoom() {
    try {
      const event = await request(
        `/api/events/${encodeURIComponent(joinCode)}`,
        { signal: lifetime.signal },
      );
      emit({ event, participant: null, error: '', loading: false });
    } catch (reason) {
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
      emit({
        event: { ...event, received_at: now() },
        participant: {
          display_name: event.participant_display_name,
          reconnect_token: token,
        },
        error: '',
        loading: false,
      });
    } catch (reason) {
      if (!active) return;
      if ([401, 403].includes(reason.status)) {
        storage.removeItem(key);
        token = null;
        await publicRoom();
        return;
      }
      emit({ error: reason.message, loading: false });
      if (reason.status === 404) return;
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
