import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useAuth } from '../contexts/AuthContext';
export default function AppLayout({ children }) {
  const { pathname, key } = useLocation();
  const content = useRef(null);
  const { error, refreshUser } = useAuth();
  useEffect(() => {
    document.title = pathname.startsWith('/library')
      ? 'My quizzes · QuizPop'
      : pathname.startsWith('/account/')
        ? 'Account · QuizPop'
        : pathname.startsWith('/host/')
          ? 'Host room · QuizPop'
          : pathname.startsWith('/join/')
            ? 'Join quiz · QuizPop'
            : 'QuizPop — Live Quiz Competition';
    window.scrollTo(0, 0);
    content.current?.focus({ preventScroll: true });
  }, [pathname, key]);
  return (
    <main className="page-shell" ref={content} tabIndex={-1}>
      <Header />
      <section className="hero-wrap">
        {error && (
          <p className="error-message" role="alert">
            {error}{' '}
            <button className="back-link" onClick={refreshUser}>
              Retry
            </button>
          </p>
        )}
        {children ?? <Outlet />}
      </section>
      <Footer />
    </main>
  );
}
