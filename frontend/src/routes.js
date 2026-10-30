import { replace } from 'react-router';

// Existing quiz links remain valid; replace avoids an extra Back-button stop.
export function legacyJoinLoader({ request }) {
  const joinCode = new URL(request.url).searchParams.get('join');
  return joinCode ? replace(`/join/${encodeURIComponent(joinCode)}`) : null;
}

// Keep the route table independent of the browser and screen implementations.
// Tests use the same table with createMemoryRouter.
export function createAppRoutes({ Layout, QuizPage, LoginPage, NotFoundPage, RouteErrorPage, RootErrorPage }) {
  return [{
    Component: Layout,
    ErrorBoundary: RootErrorPage,
    children: [
      { index: true, loader: legacyJoinLoader, Component: QuizPage, ErrorBoundary: RouteErrorPage },
      { path: 'join/:joinCode', Component: QuizPage, ErrorBoundary: RouteErrorPage },
      { path: 'host/:eventId', Component: QuizPage, ErrorBoundary: RouteErrorPage },
      { path: 'login', Component: LoginPage, ErrorBoundary: RouteErrorPage },
      { path: '*', Component: NotFoundPage },
    ],
  }];
}
