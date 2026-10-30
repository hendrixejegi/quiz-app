import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeHost } from './live/hostSubscription.js';
import { subscribeParticipant } from './live/participantSubscription.js';
import { remainingQuestionSeconds } from './hooks/useCountdown.js';
function clock() {
  let counter = 0;
  const jobs = new Map();
  return {
    jobs,
    schedule: (fn, delay) => {
      const id = ++counter;
      jobs.set(id, { fn, delay });
      return id;
    },
    cancel: (id) => jobs.delete(id),
    async run(delay) {
      const entry = [...jobs].find(([, value]) => value.delay === delay);
      assert.ok(entry, `No job at ${delay}ms`);
      jobs.delete(entry[0]);
      await entry[1].fn();
    },
  };
}
function sockets() {
  const all = [];
  return {
    all,
    openSocket: () => {
      const socket = {
        sent: [],
        send(value) {
          this.sent.push(value);
        },
        close() {
          this.closed = true;
          this.onclose?.({ code: 1000 });
        },
      };
      all.push(socket);
      return socket;
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test('account-owned host sends empty handshake; socket snapshots replace HTTP polling', async () => {
  const timer = clock(),
    ws = sockets(),
    updates = [];
  let calls = 0;
  const stop = subscribeHost({
    eventId: 'owned',
    request: async () => {
      calls++;
      return { title: 'Initial' };
    },
    ...ws,
    ...timer,
    socketUrl: 'ws://test',
    onChange: (value) => updates.push(value),
  });
  await flush();
  ws.all[0].onopen();
  assert.deepEqual(ws.all[0].sent, ['']);
  assert.equal(timer.jobs.size, 0);
  ws.all[0].onmessage({
    data: JSON.stringify({ type: 'host_lobby', data: { title: 'Live' } }),
  });
  assert.equal(updates.at(-1).data.title, 'Live');
  assert.equal(calls, 1);
  stop();
  assert.equal(ws.all[0].closed, true);
  assert.equal(timer.jobs.size, 0);
});
test('legacy handshakes keep their token and disconnection enables polling and reconnect', async () => {
  const timer = clock(),
    ws = sockets();
  let calls = 0;
  const stop = subscribeHost({
    eventId: 'legacy',
    token: 'secret',
    request: async () => {
      calls++;
      return {};
    },
    ...ws,
    ...timer,
    onChange: () => {},
  });
  await flush();
  ws.all[0].onopen();
  assert.deepEqual(ws.all[0].sent, ['secret']);
  ws.all[0].onclose({ code: 1006 });
  await flush();
  assert.equal(calls, 2);
  await timer.run(1500);
  assert.equal(ws.all.length, 2);
  stop();
});
test('HTTP permission denial stops protected access and scheduled retries', async () => {
  const timer = clock(),
    ws = sockets(),
    updates = [];
  const stop = subscribeHost({
    eventId: 'denied',
    request: async () => {
      throw Object.assign(Error('Forbidden'), { status: 403 });
    },
    ...ws,
    ...timer,
    onChange: (value) => updates.push(value),
  });
  await flush();
  assert.equal(updates.at(-1).data, null);
  assert.equal(updates.at(-1).connection, 'offline');
  assert.equal(timer.jobs.size, 0);
  stop();
});
test('socket revocation clears private room data without restarting polling', async () => {
  const timer = clock(),
    ws = sockets(),
    updates = [];
  const stop = subscribeHost({
    eventId: 'owned',
    request: async () => ({ title: 'Private' }),
    ...ws,
    ...timer,
    onChange: (value) => updates.push(value),
  });
  await flush();
  ws.all[0].onopen();
  ws.all[0].onclose({ code: 4403 });
  assert.equal(updates.at(-1).data, null);
  assert.equal(timer.jobs.size, 0);
  stop();
});
test('unmount aborts pending host requests and ignores their late results', async () => {
  const timer = clock(),
    ws = sockets(),
    updates = [];
  let resolve, signal;
  const stop = subscribeHost({
    eventId: 'old',
    request: (_, { signal: value }) => {
      signal = value;
      return new Promise((done) => (resolve = done));
    },
    ...ws,
    ...timer,
    onChange: (value) => updates.push(value),
  });
  stop();
  resolve({ title: 'Old room' });
  await flush();
  assert.equal(signal.aborted, true);
  assert.equal(updates.length, 0);
  assert.equal(timer.jobs.size, 0);
});
test('late HTTP snapshots cannot overwrite a newer host socket snapshot', async () => {
  const timer = clock(),
    ws = sockets(),
    updates = [];
  let resolve;
  const stop = subscribeHost({
    eventId: 'owned',
    request: () => new Promise((done) => (resolve = done)),
    ...ws,
    ...timer,
    onChange: (value) => updates.push(value),
  });
  ws.all[0].onopen();
  ws.all[0].onmessage({
    data: JSON.stringify({ type: 'host_lobby', data: { title: 'New' } }),
  });
  resolve({ title: 'Old' });
  await flush();
  assert.equal(updates.at(-1).data.title, 'New');
  stop();
});
function storage(token) {
  const values = new Map(token ? [['quiz:ROOM:reconnect', token]] : []);
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
test('participant reconnect restores saved answer and stops polling on unmount', async () => {
  const timer = clock(),
    updates = [],
    store = storage('reconnect');
  let signal;
  const stop = subscribeParticipant({
    joinCode: 'ROOM',
    storage: store,
    request: async (_, { signal: value, headers }) => {
      signal = value;
      assert.equal(headers.Authorization, 'Bearer reconnect');
      return { participant_display_name: 'Ari', answer_choice_index: 1 };
    },
    ...timer,
    now: () => 123,
    onChange: (value) => updates.push(value),
  });
  await flush();
  assert.equal(updates.at(-1).event.answer_choice_index, 1);
  assert.equal(updates.at(-1).event.received_at, 123);
  assert.equal(timer.jobs.size, 1);
  stop();
  assert.equal(signal.aborted, true);
  assert.equal(timer.jobs.size, 0);
});
test('invalid reconnect tokens are cleared before restoring the public join form', async () => {
  const timer = clock(),
    store = storage('invalid'),
    updates = [];
  const paths = [];
  const stop = subscribeParticipant({
    joinCode: 'ROOM',
    storage: store,
    request: async (path) => {
      paths.push(path);
      if (path.endsWith('/state'))
        throw Object.assign(Error('Invalid participant link'), { status: 403 });
      return { title: 'Public' };
    },
    ...timer,
    onChange: (value) => updates.push(value),
  });
  await flush();
  assert.equal(store.getItem('quiz:ROOM:reconnect'), null);
  assert.equal(updates.at(-1).participant, null);
  assert.deepEqual(paths, ['/api/events/ROOM/state', '/api/events/ROOM']);
  assert.equal(timer.jobs.size, 0);
  stop();
});
test('leaving a participant room aborts and ignores the previous room response', async () => {
  const timer = clock(),
    updates = [];
  let resolve, signal;
  const stop = subscribeParticipant({
    joinCode: 'ROOM',
    storage: storage('token'),
    request: (_, { signal: value }) => {
      signal = value;
      return new Promise((done) => (resolve = done));
    },
    ...timer,
    onChange: (value) => updates.push(value),
  });
  stop();
  resolve({ participant_display_name: 'Old' });
  await flush();
  assert.equal(signal.aborted, true);
  assert.equal(updates.length, 0);
  assert.equal(timer.jobs.size, 0);
});
test('countdown advances between server snapshots with a stable clock offset', () => {
  const event = {
    deadline_at: '2026-01-01T00:00:20Z',
    server_time: '2026-01-01T00:00:00Z',
    received_at: 1000,
  };
  assert.equal(remainingQuestionSeconds(event, 1000), 20);
  assert.equal(remainingQuestionSeconds(event, 6000), 15);
  assert.equal(remainingQuestionSeconds(event, 22000), 0);
});

test('host fallback never overlaps a pending initial request or leaves duplicate poll timers', async () => {
  const timer = clock(),
    ws = sockets();
  let resolve,
    calls = 0;
  const stop = subscribeHost({
    eventId: 'slow',
    request: () => {
      calls++;
      return new Promise((done) => (resolve = done));
    },
    ...ws,
    ...timer,
    onChange: () => {},
  });
  ws.all[0].onclose({ code: 1006 });
  assert.equal(calls, 1);
  resolve({ title: 'Initial' });
  await flush();
  assert.equal(
    [...timer.jobs.values()].filter((job) => job.delay === 1000).length,
    1,
  );
  stop();
  assert.equal(timer.jobs.size, 0);
});
