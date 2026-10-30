import { Link } from 'react-router';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
export default function Header() {
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <nav className="topbar" aria-label="Main navigation">
      <Link className="brand" to="/" aria-label="QuizPop home">
        <img
          className="brand-mark"
          src="/quizpop-mark.svg"
          width="48"
          height="48"
          alt=""
        />
        <span>
          Quiz<span className="brand-pop">Pop</span>
        </span>
      </Link>
      <div className="topbar-tools">
        <Link
          className="topbar-account"
          to={user ? '/account/profile' : '/account/login'}
          aria-disabled={loading}
          onClick={(event) => {
            if (loading) event.preventDefault();
          }}
        >
          {loading ? 'Loading…' : user ? 'Account' : 'Sign in'}
        </Link>
        <button
          className="theme-toggle"
          type="button"
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          aria-pressed={theme === 'dark'}
          title={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
        </button>
        <span className="topbar-note">
          <span className="status-dot" /> LIVE QUIZ STUDIO
        </span>
      </div>
    </nav>
  );
}
