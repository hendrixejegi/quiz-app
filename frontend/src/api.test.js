import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError } from './api.js';
test('API errors expose HTTP status and account-friendly detail', async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: 'LOGIN_BAD_CREDENTIALS' }), {
      status: 401,
    });
  await assert.rejects(
    api('/api/auth/users/me'),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === 'Email or password is incorrect.',
  );
});
test('CSRF and mutation requests both receive credentials and the action abort signal', async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  const calls = [];
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(
        url.endsWith('/csrf') ? { token: 'csrf-token' } : { state: 'accepted' },
      ),
    );
  };
  await api('/api/events/ROOM/answers', {
    method: 'POST',
    body: '{"choice_index":0}',
    signal: controller.signal,
  });
  assert.equal(calls.length, 2);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'include');
    assert.equal(options.signal, controller.signal);
  }
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'csrf-token');
});
test('cancelling an action during CSRF preparation never sends the mutation', async (t) => {
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  let calls = 0;
  const controller = new AbortController();
  globalThis.fetch = async (url, { signal }) => {
    calls++;
    return await new Promise((resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      ),
    );
  };
  const request = api('/api/quizzes', {
    method: 'POST',
    body: '{}',
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(calls, 1);
});
