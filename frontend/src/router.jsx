import { createBrowserRouter } from 'react-router';
import AppLayout from './layouts/AppLayout';
import HomePage from './pages/HomePage';
import HostPage from './pages/HostPage';
import ParticipantPage from './pages/ParticipantPage';
import LibraryPage from './pages/library/LibraryPage';
import LibraryEditorPage from './pages/library/LibraryEditorPage';
import LibraryQuizPage from './pages/library/LibraryQuizPage';
import LibraryVersionPage from './pages/library/LibraryVersionPage';
import LoginPage from './pages/account/LoginPage';
import RegisterPage from './pages/account/RegisterPage';
import ForgotPasswordPage from './pages/account/ForgotPasswordPage';
import ResetPasswordPage from './pages/account/ResetPasswordPage';
import VerifyEmailPage from './pages/account/VerifyEmailPage';
import ProfilePage from './pages/account/ProfilePage';
import {
  NotFoundPage,
  RootErrorPage,
  RouteErrorPage,
} from './pages/RoutePages';
import { createAppRoutes } from './routes';
export const router = createBrowserRouter(
  createAppRoutes({
    Layout: AppLayout,
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
    RootErrorPage,
    RouteErrorPage,
  }),
);
