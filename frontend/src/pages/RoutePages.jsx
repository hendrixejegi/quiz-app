import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import AppLayout from '../layouts/AppLayout';
function RouteMessage({ title, children }) {
  return (
    <div className="route-message">
      <h1>{title}</h1>
      <p className="hero-copy">{children}</p>
      <Link className="back-link" to="/">
        <ArrowLeft size={15} /> Back to QuizPop
      </Link>
    </div>
  );
}
export function NotFoundPage() {
  return (
    <RouteMessage title="Page not found">
      This page does not exist. Check your quiz link or return to the home page.
    </RouteMessage>
  );
}
export function RouteErrorPage() {
  return (
    <RouteMessage title="Could not open this page">
      Please try opening the page again, or return to the home page.
    </RouteMessage>
  );
}
// Never render raw route errors: they can contain private URLs and credentials.
export function RootErrorPage() {
  return (
    <AppLayout>
      <RouteErrorPage />
    </AppLayout>
  );
}
