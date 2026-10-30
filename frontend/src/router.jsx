import { createBrowserRouter, useLocation } from 'react-router';
import App from './App.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { LoginPage, NotFoundPage, RootErrorPage, RouteErrorPage } from './pages/RoutePages.jsx';
import { createAppRoutes } from './routes.js';

function QuizPage() {
  const location = useLocation();
  // Changing rooms or credentials must dispose the old socket, polling, and UI
  // state. Session-scoped reconnect credentials remain in sessionStorage.
  return <App key={location.key} />;
}

// Create one router outside React renders, ready for future auth loaders/actions.
export const router = createBrowserRouter(createAppRoutes({
  Layout: AppLayout, QuizPage, LoginPage, NotFoundPage, RouteErrorPage, RootErrorPage,
}));
