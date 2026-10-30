import { useEffect, useState } from 'react';
export function remainingQuestionSeconds(event, now = Date.now()) {
  if (!event?.deadline_at) return 0;
  const offset =
    event.server_time && event.received_at
      ? Date.parse(event.server_time) - event.received_at
      : 0;
  return Math.max(
    0,
    Math.ceil((Date.parse(event.deadline_at) - (now + offset)) / 1000),
  );
}
export function useCountdown(event) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!event?.deadline_at) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [event?.deadline_at]);
  return remainingQuestionSeconds(event, now);
}
