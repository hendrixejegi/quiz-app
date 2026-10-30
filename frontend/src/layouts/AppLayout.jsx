import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Moon, Sun } from 'lucide-react';

// Preserve saved preferences from before the QuizPop rebrand.
const THEME_KEY = 'quiz-aura-theme';

function initialTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function AppLayout({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const { pathname, key } = useLocation();
  const content = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    document.title = pathname === '/login' ? 'Admin sign-in · QuizPop'
      : pathname.startsWith('/host/') ? 'Host room · QuizPop'
        : pathname.startsWith('/join/') ? 'Join quiz · QuizPop' : 'QuizPop';
    window.scrollTo(0, 0);
    content.current?.focus({ preventScroll: true });
  }, [pathname, key]);

  return <main className="page-shell" ref={content} tabIndex={-1}>
    <nav className="topbar" aria-label="Main navigation">
      <Link className="brand" to="/" aria-label="QuizPop home">
        <img className="brand-mark" src="/quizpop-mark.svg" width="48" height="48" alt="" />
        <span>Quiz<span className="brand-pop">Pop</span></span>
      </Link>
      <div className="topbar-tools">
        <button className="theme-toggle" type="button"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === 'dark'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
        </button>
        <span className="topbar-note"><span className="status-dot" /> LIVE QUIZ STUDIO</span>
      </div>
    </nav>
    {children ?? <Outlet />}
  </main>;
}
