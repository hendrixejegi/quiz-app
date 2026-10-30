import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRouter, matchRoutes } from 'react-router';
import { createAppRoutes, legacyJoinLoader } from './routes.js';
const screens = Object.fromEntries(
  [
    'Layout',
    'HomePage',
    'HostPage',
    'ParticipantPage',
    'LoginPage',
    'RegisterPage',
    'ForgotPasswordPage',
    'ResetPasswordPage',
    'VerifyEmailPage',
    'ProfilePage',
    'NotFoundPage',
    'RouteErrorPage',
    'RootErrorPage',
  ].map((name) => [name, () => null]),
);
function waitForLocation(router, pathname) {
  return new Promise((resolve, reject) => {
    const ready = () =>
      router.state.initialized &&
      router.state.navigation.state === 'idle' &&
      router.state.location.pathname === pathname;
    if (ready()) return resolve();
    const timer = setTimeout(() => {
      unsubscribe();
      reject(Error('Navigation did not complete'));
    }, 2000);
    const unsubscribe = router.subscribe(() => {
      if (ready()) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}
test('mounted route table covers home, live rooms and every account screen', () => {
  for (const [url, name, params] of [
    ['/', 'HomePage', {}],
    ['/join/ROOM123', 'ParticipantPage', { joinCode: 'ROOM123' }],
    ['/host/event-1', 'HostPage', { eventId: 'event-1' }],
    ...[
      ['login', 'LoginPage'],
      ['register', 'RegisterPage'],
      ['forgot', 'ForgotPasswordPage'],
      ['reset', 'ResetPasswordPage'],
      ['verify', 'VerifyEmailPage'],
      ['profile', 'ProfilePage'],
    ].map(([path, name]) => [`/account/${path}`, name, {}]),
  ]) {
    const matches = matchRoutes(createAppRoutes(screens), url);
    assert.equal(matches[0].route.Component, screens.Layout);
    assert.equal(matches.at(-1).route.Component, screens[name]);
    assert.deepEqual(matches.at(-1).params, params);
  }
});
test('unknown, incomplete and extra-segment paths render not-found', () => {
  for (const url of [
    '/missing',
    '/host',
    '/join',
    '/host/id/extra',
    '/account',
    '/account/missing',
    '/account/login/extra',
  ])
    assert.equal(
      matchRoutes(createAppRoutes(screens), url).at(-1).route.Component,
      screens.NotFoundPage,
    );
});
test('legacy join links redirect with encoded room identifiers', () => {
  for (const [query, path] of [
    ['ROOM123', 'ROOM123'],
    ['a%2Fb%3Fc', 'a%2Fb%3Fc'],
  ])
    assert.equal(
      legacyJoinLoader({
        request: new Request(`http://localhost/?join=${query}`),
      }).headers.get('Location'),
      `/join/${path}`,
    );
  assert.equal(
    legacyJoinLoader({
      request: new Request('http://localhost/?unrelated=value'),
    }),
    null,
  );
});
test('legacy join redirect replaces its history entry', async (t) => {
  const router = createMemoryRouter(createAppRoutes(screens), {
    initialEntries: ['/account/login', '/?join=ROOM123'],
    initialIndex: 1,
  });
  t.after(() => router.dispose());
  await waitForLocation(router, '/join/ROOM123');
  assert.equal(router.state.historyAction, 'REPLACE');
  const back = waitForLocation(router, '/account/login');
  router.navigate(-1);
  await back;
});
test('legacy login redirects to the actual login page and preserves query parameters', async (t) => {
  const router = createMemoryRouter(createAppRoutes(screens), {
    initialEntries: ['/login?error=google'],
  });
  t.after(() => router.dispose());
  await waitForLocation(router, '/account/login');
  assert.equal(router.state.location.search, '?error=google');
  assert.equal(router.state.historyAction, 'REPLACE');
});
test('Back and Forward retain host secrets in fragments and email tokens in queries', async (t) => {
  const router = createMemoryRouter(createAppRoutes(screens), {
    initialEntries: ['/account/login'],
  });
  t.after(() => router.dispose());
  await router.navigate('/host/event-1#private-host-token');
  assert.equal(router.state.location.hash, '#private-host-token');
  await router.navigate('/account/verify?token=verification-token');
  assert.equal(router.state.location.search, '?token=verification-token');
  const back = waitForLocation(router, '/host/event-1');
  router.navigate(-1);
  await back;
  assert.equal(router.state.location.hash, '#private-host-token');
  const forward = waitForLocation(router, '/account/verify');
  router.navigate(1);
  await forward;
  assert.equal(router.state.location.search, '?token=verification-token');
  await router.navigate('/account/reset?token=recovery-token');
  assert.equal(router.state.location.search, '?token=recovery-token');
});
