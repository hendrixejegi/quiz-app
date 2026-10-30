import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRouter, matchRoutes } from 'react-router';
import { createAppRoutes, legacyJoinLoader } from './routes.js';

const screens = Object.fromEntries([
  'Layout', 'QuizPage', 'LoginPage', 'NotFoundPage', 'RouteErrorPage', 'RootErrorPage',
].map((name) => [name, () => null]));

function waitForLocation(router, pathname) {
  return new Promise((resolve, reject) => {
    const ready = () => router.state.initialized && router.state.navigation.state === 'idle'
      && router.state.location.pathname === pathname;
    if (ready()) return resolve();
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('Navigation did not complete')); }, 2000);
    const unsubscribe = router.subscribe(() => {
      if (ready()) { clearTimeout(timer); unsubscribe(); resolve(); }
    });
  });
}

test('explicit routes match home, login, participant and host pages with params', () => {
  for (const [path, screen, params] of [
    ['/', 'QuizPage', {}],
    ['/login', 'LoginPage', {}],
    ['/join/ROOM123', 'QuizPage', { joinCode: 'ROOM123' }],
    ['/host/event-1', 'QuizPage', { eventId: 'event-1' }],
  ]) {
    const matches = matchRoutes(createAppRoutes(screens), path);
    assert.equal(matches[0].route.Component, screens.Layout);
    assert.equal(matches.at(-1).route.Component, screens[screen]);
    assert.deepEqual(matches.at(-1).params, params);
  }
});

test('unknown and incomplete URLs use the not-found route rather than the quiz builder', () => {
  for (const path of ['/missing', '/host', '/join', '/host/id/extra', '/login/extra']) {
    assert.equal(matchRoutes(createAppRoutes(screens), path).at(-1).route.Component, screens.NotFoundPage);
  }
});

test('legacy join links redirect to an encoded participant route', () => {
  const response = legacyJoinLoader({ request: new Request('http://localhost/?join=ROOM123') });
  assert.equal(response.headers.get('Location'), '/join/ROOM123');
  const encoded = legacyJoinLoader({ request: new Request('http://localhost/?join=a%2Fb%3Fc') });
  assert.equal(encoded.headers.get('Location'), '/join/a%2Fb%3Fc');
  assert.equal(legacyJoinLoader({ request: new Request('http://localhost/?unrelated=value') }), null);
});

test('legacy join redirect replaces history so Back returns to the preceding page', async (t) => {
  const router = createMemoryRouter(createAppRoutes(screens), {
    initialEntries: ['/login', '/?join=ROOM123'], initialIndex: 1,
  });
  t.after(() => router.dispose());
  await waitForLocation(router, '/join/ROOM123');
  assert.equal(router.state.historyAction, 'REPLACE');
  const back = waitForLocation(router, '/login');
  router.navigate(-1);
  await back;
});

test('Back and Forward restore routes and keep host credentials in the fragment', async (t) => {
  const router = createMemoryRouter(createAppRoutes(screens), { initialEntries: ['/login'] });
  t.after(() => router.dispose());
  await router.navigate('/host/event-1#private-host-token');
  assert.equal(router.state.location.hash, '#private-host-token');
  assert.equal(router.state.matches.at(-1).params.eventId, 'event-1');
  await router.navigate('/join/ROOM123');
  const back = waitForLocation(router, '/host/event-1');
  router.navigate(-1);
  await back;
  assert.equal(router.state.location.hash, '#private-host-token');
  const forward = waitForLocation(router, '/join/ROOM123');
  router.navigate(1);
  await forward;
  assert.equal(router.state.location.hash, '');
});
