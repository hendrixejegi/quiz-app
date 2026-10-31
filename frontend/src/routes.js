import { replace } from 'react-router';
export function legacyJoinLoader({ request }) {
  const joinCode = new URL(request.url).searchParams.get('join');
  return joinCode ? replace(`/join/${encodeURIComponent(joinCode)}`) : null;
}
export function legacyLoginLoader({ request }) {
  const url = new URL(request.url);
  return replace(`/account/login${url.search}${url.hash}`);
}
export function createAppRoutes({
  Layout,
  HomePage,
  HostPage,
  ParticipantPage,
  LibraryPage,
  LibraryEditorPage,
  LibraryQuizPage,
  LibraryVersionPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
  ProfilePage,
  NotFoundPage,
  RouteErrorPage,
  RootErrorPage,
}) {
  return [
    {
      Component: Layout,
      ErrorBoundary: RootErrorPage,
      children: [
        {
          index: true,
          loader: legacyJoinLoader,
          Component: HomePage,
          ErrorBoundary: RouteErrorPage,
        },
        {
          path: 'join/:joinCode',
          Component: ParticipantPage,
          ErrorBoundary: RouteErrorPage,
        },
        {
          path: 'host/:eventId',
          Component: HostPage,
          ErrorBoundary: RouteErrorPage,
        },
        { path: 'login', loader: legacyLoginLoader },
        ...[
          ['library', LibraryPage],
          ['library/new', LibraryEditorPage],
          ['library/:quizId/edit', LibraryEditorPage],
          ['library/:quizId/versions/:versionNumber', LibraryVersionPage],
          ['library/:quizId', LibraryQuizPage],
        ].map(([path, Component]) => ({
          path,
          Component,
          ErrorBoundary: RouteErrorPage,
        })),
        ...[
          ['login', LoginPage],
          ['register', RegisterPage],
          ['forgot', ForgotPasswordPage],
          ['reset', ResetPasswordPage],
          ['verify', VerifyEmailPage],
          ['profile', ProfilePage],
        ].map(([path, Component]) => ({
          path: `account/${path}`,
          Component,
          ErrorBoundary: RouteErrorPage,
        })),
        { path: '*', Component: NotFoundPage },
      ],
    },
  ];
}
