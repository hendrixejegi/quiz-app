import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import AppLayout from '../layouts/AppLayout.jsx';

function RouteMessage({ title, children }) {
  return <>
    <section className="hero-wrap route-message">
      <h1>{title}</h1>
      <p className="hero-copy">{children}</p>
      <Link className="back-link" to="/"><ArrowLeft size={15} /> Back to QuizPop</Link>
    </section>
    <footer className="page-footer"><span>QUIZPOP · GOOD QUESTIONS, BETTER COMPANY</span></footer>
  </>;
}

export function LoginPage() {
  return <RouteMessage title="Admin sign-in">
    Admin sign-in is not available yet. You can still create or join a quiz from the home page.
  </RouteMessage>;
}

export function NotFoundPage() {
  return <RouteMessage title="Page not found">
    This page does not exist. Check your quiz link or return to the home page.
  </RouteMessage>;
}

export function RouteErrorPage() {
  // Never echo a route error: it may contain a private host URL or credential.
  return <RouteMessage title="Could not open this page">
    Please try opening the page again, or return to the home page.
  </RouteMessage>;
}

export function RootErrorPage() {
  return <AppLayout><RouteErrorPage /></AppLayout>;
}
