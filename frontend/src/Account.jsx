import { useEffect, useState } from 'react';
import { api } from './api';

const titles = { login: 'Sign in', register: 'Create an account', forgot: 'Reset your password', reset: 'Choose a new password', verify: 'Verify your email', profile: 'Your account' };
export default function Account({ mode, user, onUser, navigate }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(new URLSearchParams(window.location.search).get('error') === 'google' ? 'Google sign-in could not finish. If you already have an email account, sign in and link Google from Account.' : '');
  const [google, setGoogle] = useState(false);
  useEffect(() => { api('/api/auth/config').then(config => setGoogle(config.google)).catch(() => {}); }, []);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const token = new URLSearchParams(window.location.search).get('token');
    try {
      if (mode === 'login') {
        await api('/api/auth/session/login', { method: 'POST', body: new URLSearchParams({ username: values.email, password: values.password }) });
        onUser(await api('/api/auth/users/me')); navigate('/');
      } else if (mode === 'register') {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify(values) });
        await api('/api/auth/request-verify-token', { method: 'POST', body: JSON.stringify({ email: values.email }) });
        setMessage('Account created. Check your email to verify it before signing in.');
      } else if (mode === 'forgot' || (mode === 'verify' && !token)) {
        await api(`/api/auth/${mode === 'forgot' ? 'forgot-password' : 'request-verify-token'}`, { method: 'POST', body: JSON.stringify(values) });
        setMessage('If this address has an eligible account, an email is on its way. Check your inbox and spam folder.');
      } else if (mode === 'reset') {
        if (!token) throw new Error('Open the reset link in your email, or request a new one.');
        await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: values.password }) });
        window.history.replaceState({}, '', '/account/reset');
        setMessage('Password updated. All sessions have been revoked. Sign in with your new password.');
      } else if (mode === 'verify') {
        await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });
        setMessage('Email verified. You can now sign in.');
        window.history.replaceState({}, '', '/account/verify');
      } else {
        const updated = await api('/api/auth/users/me', { method: 'PATCH', body: JSON.stringify({ display_name: values.display_name }) });
        onUser(updated); setMessage('Profile saved.');
      }
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  async function googleSignIn(link = false) {
    setBusy(true); setError('');
    try {
      const result = await api(`/api/auth/${link ? 'link/google' : 'google'}/authorize`);
      window.location.assign(result.authorization_url);
    } catch (reason) { setError(reason.message); setBusy(false); }
  }
  async function endSessions(all = false) {
    setBusy(true); setError('');
    try {
      await api(all ? '/api/auth/revoke-sessions' : '/api/auth/session/logout', { method: 'POST' });
      onUser(null); navigate('/account/login');
    } catch (reason) { setError(reason.message); setBusy(false); }
  }
  const token = new URLSearchParams(window.location.search).get('token');
  return <section className="account-layout">
    <aside className="account-context"><h2>A place for your quizzes.</h2><p>Sign in to create and host a quiz with your account.</p><p>Joining friends? You can still play as a guest.</p><button className="back-link" onClick={() => navigate('/')}>Back to QuizPop</button></aside>
    <div className="account-panel"><h1>{titles[mode] || titles.login}</h1>
      {mode === 'profile' && !user ? <p>Sign in to manage your account.</p> : <form onSubmit={submit} key={mode}>
        {mode === 'profile' && <p>{user.email} · Email verified</p>}
        {['register', 'profile'].includes(mode) && <label>Display name<input className="text-input" name="display_name" autoComplete="nickname" maxLength={80} defaultValue={user?.display_name || ''} required /></label>}
        {['login', 'register', 'forgot'].includes(mode) || (mode === 'verify' && !token) ? <label>Email<input className="text-input" name="email" type="email" autoComplete="email" required maxLength={320} /></label> : null}
        {['login', 'register', 'reset'].includes(mode) && <label>Password<input className="text-input" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} maxLength={128} required />{mode !== 'login' && <small>Use 12 to 128 characters.</small>}</label>}
        <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : ({ login: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Save password', verify: token ? 'Verify email' : 'Send verification email', profile: 'Save profile' })[mode]}</button>
      </form>}
      {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="account-message" role="status">{message}</p>}
      {google && ['login', 'register', 'profile'].includes(mode) && <button className="secondary-button" disabled={busy} onClick={() => googleSignIn(mode === 'profile')}>{mode === 'profile' ? 'Link Google account' : 'Continue with Google'}</button>}
      <div className="account-links">{mode !== 'login' && <a href="/account/login">Sign in</a>}{mode !== 'register' && <a href="/account/register">Create account</a>}{mode === 'login' && <><a href="/account/forgot">Forgot password?</a><a href="/account/verify">Resend verification email</a></>}</div>
      {mode === 'profile' && user && <div className="account-links"><button className="secondary-button" disabled={busy} onClick={() => endSessions()}>Sign out</button><button className="secondary-button" disabled={busy} onClick={() => endSessions(true)}>Sign out everywhere</button><a href="/account/forgot">Reset password</a></div>}
    </div>
  </section>;
}

