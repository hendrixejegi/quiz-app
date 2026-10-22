import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, Copy, Moon, Plus, Radio, Sparkles, Sun, Users, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const THEME_KEY = 'quiz-aura-theme';
const blankQuestion = () => ({ prompt: '', choices: ['', '', '', ''], correct_choice_index: 0, time_limit_seconds: 20 });

function websocketUrl(path) {
  const url = new URL(API_URL, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}${path}`;
}

function getInitialTheme() {
  const theme = window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  return theme;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : 'Please check the quiz details and try again.';
    throw new Error(detail);
  }
  return body;
}

function useLocationState() {
  return useState(() => ({ path: window.location.pathname, search: new URLSearchParams(window.location.search) }));
}

function RankingList({ entries, currentName, showPoints = true }) {
  return <ol className="ranking-list">{entries.map((entry) => <li className={entry.display_name === currentName ? 'ranking-row ranking-self' : 'ranking-row'} key={`${entry.rank}-${entry.display_name}`}>
    <span className="ranking-place">{entry.rank}</span><span className="ranking-name">{entry.display_name}</span>{showPoints && <strong className="ranking-points">{entry.points} pts</strong>}
  </li>)}</ol>;
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [location, setLocation] = useLocationState();
  const [view, setView] = useState('create');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [event, setEvent] = useState(null);
  const [hostInfo, setHostInfo] = useState(null);
  const [hostConnection, setHostConnection] = useState('connecting');
  const [participant, setParticipant] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const [optimisticAnswer, setOptimisticAnswer] = useState(null);
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [joinMenuOpen, setJoinMenuOpen] = useState(false);
  const [participantJoinForm, setParticipantJoinForm] = useState({ join_code: '', name: '', display_name: '' });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [joinForm, setJoinForm] = useState({ name: '', display_name: '' });
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([blankQuestion()]);

  const joinCode = location.search.get('join');
  const hostEventId = location.path.startsWith('/host/') ? location.path.split('/')[2] : null;
  const hostToken = useMemo(() => window.location.hash.slice(1), [hostEventId, location.path]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    if (joinCode) {
      setView('join');
      const reconnectToken = sessionStorage.getItem(`quiz:${joinCode}:reconnect`);
      if (reconnectToken) {
        api(`/api/events/${encodeURIComponent(joinCode)}/state`, {
          headers: { Authorization: `Bearer ${reconnectToken}` },
        }).then((data) => {
          if (!alive) return;
          setEvent(data);
          setParticipant({
            participant_id: data.participant_id,
            display_name: data.display_name,
            reconnect_token: reconnectToken,
          });
          try {
            const progress = JSON.parse(sessionStorage.getItem(`quiz:${joinCode}:progress`) || '{}');
            setQuestionIndex(Number.isInteger(progress.questionIndex) ? progress.questionIndex : 0);
            setAnswers(progress.answers && typeof progress.answers === 'object' ? progress.answers : {});
          } catch {
            setQuestionIndex(0);
            setAnswers({});
          }
        }).catch((reason) => {
          if (!alive) return;
          if (reason.message === 'Invalid participant link') {
            sessionStorage.removeItem(`quiz:${joinCode}:reconnect`);
            sessionStorage.removeItem(`quiz:${joinCode}:progress`);
          }
          api(`/api/events/${encodeURIComponent(joinCode)}`)
            .then((data) => alive && setEvent(data))
            .catch((eventError) => alive && setError(eventError.message));
        });
      } else {
        api(`/api/events/${encodeURIComponent(joinCode)}`)
          .then((data) => alive && setEvent(data))
          .catch((reason) => alive && setError(reason.message));
      }
    } else if (hostEventId) {
      setView('host');
      api(`/api/host/${hostEventId}`, { headers: { Authorization: `Bearer ${hostToken}` } })
        .then((data) => alive && setHostInfo(data))
        .catch((reason) => alive && setError(reason.message));
    } else {
      setView('create');
    }
    return () => { alive = false; };
  }, [joinCode, hostEventId, hostToken]);

  useEffect(() => {
    if (!hostEventId || !hostToken) return undefined;

    let active = true;
    let retryTimer;
    let socket;
    setHostConnection('connecting');

    const connect = () => {
      if (!active) return;
      const currentSocket = new WebSocket(websocketUrl(`/api/host/${encodeURIComponent(hostEventId)}/ws`));
      socket = currentSocket;
      currentSocket.onopen = () => currentSocket.send(hostToken);
      currentSocket.onmessage = (eventMessage) => {
        let message;
        try {
          message = JSON.parse(eventMessage.data);
        } catch {
          return;
        }
        if (message.type === 'host_lobby') {
          setHostInfo(message.data);
          setHostConnection('connected');
        } else if (message.type === 'error') {
          setError(message.detail);
          currentSocket.close(4403, 'Invalid host link');
        }
      };
      currentSocket.onclose = (closeEvent) => {
        if (!active) return;
        if (closeEvent.code === 4403) {
          setHostConnection('offline');
          return;
        }
        setHostConnection('reconnecting');
        retryTimer = window.setTimeout(connect, 1500);
      };
      currentSocket.onerror = () => currentSocket.close();
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      socket?.close(1000, 'Host view closed');
    };
  }, [hostEventId, hostToken]);

  useEffect(() => {
    if (!joinCode || !participant?.reconnect_token) return undefined;
    let alive = true;
    const refreshParticipantState = () => api(`/api/events/${encodeURIComponent(joinCode)}/state`, {
      headers: { Authorization: `Bearer ${participant.reconnect_token}` },
    }).then((data) => alive && setEvent(data)).catch((reason) => alive && setError(reason.message));
    refreshParticipantState();
    const interval = window.setInterval(refreshParticipantState, 1000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [joinCode, participant?.reconnect_token]);

  useEffect(() => {
    if (!joinCode || participant) return undefined;
    const reconnectToken = sessionStorage.getItem(`quiz:${joinCode}:reconnect`);
    if (!reconnectToken) return undefined;
    let alive = true;
    api(`/api/events/${encodeURIComponent(joinCode)}/state`, {
      headers: { Authorization: `Bearer ${reconnectToken}` },
    }).then((data) => {
      if (!alive) return;
      setEvent(data);
      setParticipant({ reconnect_token: reconnectToken, display_name: data.participant_display_name });
    }).catch(() => {
      if (alive) sessionStorage.removeItem(`quiz:${joinCode}:reconnect`);
    });
    return () => { alive = false; };
  }, [joinCode, participant]);

  useEffect(() => {
    if (!event?.deadline_at) return undefined;
    const interval = window.setInterval(() => setClockTick(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [event?.deadline_at]);

  function navigate(path) {
    window.history.pushState({}, '', path);
    setLocation({ path: window.location.pathname, search: new URLSearchParams(window.location.search) });
    setError('');
  }

  function updateQuestion(questionIndex, updates) {
    setQuestions((items) => items.map((item, index) => index === questionIndex ? { ...item, ...updates } : item));
  }

  async function createQuiz(eventForm) {
    eventForm.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cleanedQuestions = questions.map((question) => {
        const filled = question.choices
          .map((text, originalIndex) => ({ text: text.trim(), originalIndex }))
          .filter(({ text }) => text);
        const correct_choice_index = filled.findIndex(({ originalIndex }) => originalIndex === question.correct_choice_index);
        if (filled.length < 2) throw new Error('Each question needs at least two answer choices.');
        if (correct_choice_index < 0) throw new Error('Choose a correct answer that has text.');
        return { ...question, choices: filled.map(({ text }) => text), correct_choice_index };
      });
      const payload = { title, questions: cleanedQuestions };
      const result = await api('/api/quizzes', { method: 'POST', body: JSON.stringify(payload) });
      setCreated({ ...result, participant_url: new URL(result.participant_url, window.location.origin).href });
      setView('created');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinQuiz(eventForm) {
    eventForm.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api(`/api/events/${encodeURIComponent(joinCode)}/participants`, {
        method: 'POST', body: JSON.stringify(joinForm),
      });
      sessionStorage.setItem(`quiz:${joinCode}:reconnect`, result.reconnect_token);
      sessionStorage.setItem(`quiz:${joinCode}:progress`, JSON.stringify({ questionIndex: 0, answers: {} }));
      setParticipant(result);
      setOptimisticAnswer(null);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode(eventForm) {
    eventForm.preventDefault();
    const code = participantJoinForm.join_code.trim().toUpperCase();
    setBusy(true);
    setError('');
    try {
      const eventInfo = await api(`/api/events/${encodeURIComponent(code)}`);
      const result = await api(`/api/events/${encodeURIComponent(code)}/participants`, {
        method: 'POST',
        body: JSON.stringify({ name: participantJoinForm.name, display_name: participantJoinForm.display_name }),
      });
      sessionStorage.setItem(`quiz:${code}:reconnect`, result.reconnect_token);
      sessionStorage.setItem(`quiz:${code}:progress`, JSON.stringify({ questionIndex: 0, answers: {} }));
      window.history.pushState({}, '', `/?join=${encodeURIComponent(code)}`);
      setLocation({ path: window.location.pathname, search: new URLSearchParams(window.location.search) });
      setEvent(eventInfo);
      setParticipant(result);
      setQuestionIndex(0);
      setAnswers({});
      setJoinMenuOpen(false);
      setView('join');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  function saveProgress(nextQuestionIndex, nextAnswers) {
    if (!joinCode) return;
    sessionStorage.setItem(`quiz:${joinCode}:progress`, JSON.stringify({
      questionIndex: nextQuestionIndex,
      answers: nextAnswers,
    }));
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); } catch { setError('Clipboard access is unavailable. Copy the link manually.'); }
  }

  async function startQuiz() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/host/${hostEventId}/start`, {
        method: 'POST', headers: { Authorization: `Bearer ${hostToken}` },
      });
      setHostInfo((current) => ({ ...current, state: 'active' }));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(choiceIndex) {
    const position = event?.current_question_position;
    if (position == null || event.answer_choice_index != null || answerSubmitting) return;
    setOptimisticAnswer({ position, choiceIndex });
    setAnswerSubmitting(true);
    setError('');
    try {
      await api(`/api/events/${encodeURIComponent(joinCode)}/answers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${participant.reconnect_token}` },
        body: JSON.stringify({ choice_index: choiceIndex }),
      });
      setEvent((current) => current?.current_question_position === position
        ? { ...current, answer_choice_index: choiceIndex }
        : current);
    } catch (reason) {
      setOptimisticAnswer(null);
      setError(reason.message);
    } finally {
      setAnswerSubmitting(false);
    }
  }

  const serverOffset = event?.server_time ? Date.parse(event.server_time) - Date.now() : 0;
  const remainingSeconds = event?.deadline_at
    ? Math.max(0, Math.ceil((Date.parse(event.deadline_at) - (clockTick + serverOffset)) / 1000))
    : 0;
  const activeQuestion = event?.current_question;
  const answeredChoice = event?.answer_choice_index ?? (
    optimisticAnswer && optimisticAnswer.position === event?.current_question_position
      ? optimisticAnswer.choiceIndex
      : null
  );

  return (
    <main className="page-shell">
      <nav className="topbar">
        <button className="brand" onClick={() => navigate('/')} aria-label="Quiz Aura home">
          <span className="brand-mark"><Sparkles size={17} /></span><span>quiz<span className="brand-light">aura</span></span>
        </button>
        <div className="topbar-tools">
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
          </button>
          <span className="topbar-note"><span className="status-dot" /> LIVE QUIZ STUDIO</span>
        </div>
      </nav>

      <section className="hero-wrap">
        {view === 'create' && <>
          <div className="eyebrow"><span className="eyebrow-line" />MAKE A MOMENT<span className="eyebrow-line" /></div>
          <h1>Bring your<br /><span className="gradient-text">people together.</span></h1>
          <p className="hero-copy">A little friendly competition goes a long way.<br className="desktop-break" /> Build a quiz and let the room light up.</p>
          <div className="home-join-action">
            <button className="secondary-button" type="button" onClick={() => { setJoinMenuOpen((open) => !open); setError(''); }} aria-expanded={joinMenuOpen} aria-controls="participant-entry-form">
              <Users size={16} /> Join a quiz
            </button>
          </div>
          {joinMenuOpen && <form id="participant-entry-form" className="join-card participant-entry-card" onSubmit={joinByCode}>
            <h2>Join with a code.</h2><p>Enter your details to join a quiz room.</p>
            <label className="field-label" htmlFor="participant-join-code">JOIN CODE</label>
            <input id="participant-join-code" className="text-input code-input" maxLength="8" autoComplete="off" placeholder="e.g. 9ULG0J8" value={participantJoinForm.join_code} onChange={(e) => setParticipantJoinForm({ ...participantJoinForm, join_code: e.target.value.toUpperCase() })} required />
            <label className="field-label" htmlFor="participant-entry-name">YOUR NAME</label>
            <input id="participant-entry-name" className="text-input" maxLength="80" autoComplete="name" placeholder="Your name" value={participantJoinForm.name} onChange={(e) => setParticipantJoinForm({ ...participantJoinForm, name: e.target.value })} required />
            <label className="field-label" htmlFor="participant-entry-display-name">DISPLAY NAME</label>
            <input id="participant-entry-display-name" className="text-input" maxLength="32" placeholder="How you’ll appear in the quiz" value={participantJoinForm.display_name} onChange={(e) => setParticipantJoinForm({ ...participantJoinForm, display_name: e.target.value })} required />
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="primary-button full-button" disabled={busy}>{busy ? 'Joining…' : <>Join quiz <ArrowRight size={17} /></>}</button>
          </form>}
          <div className="hero-stamp"><span>01</span><span className="stamp-rule" /> CREATE YOUR QUIZ</div>
          <form className="builder" onSubmit={createQuiz}>
            <div className="builder-heading"><div><span className="section-kicker">THE SETUP</span><h2>Your quiz, your rules.</h2></div><span className="step-count">01 <i>/</i> 03</span></div>
            <label className="field-label" htmlFor="quiz-title">QUIZ TITLE</label>
            <input id="quiz-title" className="text-input title-input" maxLength="100" placeholder="e.g. Friday night trivia" value={title} onChange={(e) => setTitle(e.target.value)} required />
            {questions.map((question, qi) => <article className="question-editor" key={qi}>
              <div className="question-editor-top"><span className="question-number">QUESTION {String(qi + 1).padStart(2, '0')}</span>{questions.length > 1 && <button type="button" className="icon-button" onClick={() => setQuestions((items) => items.filter((_, index) => index !== qi))} aria-label="Remove question"><X size={16} /></button>}</div>
              <textarea className="text-input prompt-input" placeholder="Write your question..." maxLength="500" value={question.prompt} onChange={(e) => updateQuestion(qi, { prompt: e.target.value })} required />
              <div className="choice-grid">{question.choices.map((choice, ci) => <label className={`choice-field ${question.correct_choice_index === ci ? 'correct' : ''}`} key={ci}>
                <span className="choice-letter">{String.fromCharCode(65 + ci)}</span><input aria-label={`Answer ${String.fromCharCode(65 + ci)}`} maxLength="200" placeholder={`Answer ${String.fromCharCode(65 + ci)}`} value={choice} onChange={(e) => updateQuestion(qi, { choices: question.choices.map((value, index) => index === ci ? e.target.value : value) })} />
                <button type="button" className="correct-toggle" aria-label={`Mark answer ${String.fromCharCode(65 + ci)} correct`} aria-pressed={question.correct_choice_index === ci} onClick={() => updateQuestion(qi, { correct_choice_index: ci })}>{question.correct_choice_index === ci && <Check size={13} />}</button>
              </label>)}</div>
              <div className="question-footer"><span><span className="mini-dot" /> Tap the ring to mark the correct answer</span><label className="timer-select">TIMER <select value={question.time_limit_seconds} onChange={(e) => updateQuestion(qi, { time_limit_seconds: Number(e.target.value) })}>{[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n}s</option>)}</select></label></div>
            </article>)}
            <div className="builder-actions"><button type="button" className="add-question" onClick={() => setQuestions((items) => [...items, blankQuestion()])} disabled={questions.length >= 20}><Plus size={16} /> Add another question <span>{questions.length}/20</span></button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Creating…' : <>Create quiz <ArrowRight size={17} /></>}</button></div>
            {error && <p className="error-message" role="alert">{error}</p>}
          </form>
        </>}

        {view === 'created' && created && <div className="result-panel">
          <div className="success-icon"><Check size={27} /></div><div className="eyebrow"><span className="eyebrow-line" />ROOM IS READY<span className="eyebrow-line" /></div>
          <h1>Let the game<br /><span className="gradient-text">find its people.</span></h1>
          <p className="hero-copy">Your quiz <strong>{created.title}</strong> is waiting in the lobby.</p>
          <div className="share-card"><span className="section-kicker">PARTICIPANT LINK</span><div className="share-value"><span>{created.participant_url}</span><button className="copy-button" onClick={() => copy(created.participant_url)}><Copy size={15} /> Copy</button></div><div className="join-code">JOIN CODE <strong>{created.join_code}</strong></div></div>
          <a className="primary-button host-button" href={created.host_url}>Open host lobby <ArrowRight size={17} /></a>
          <p className="private-note">Keep your host link private. Anyone with it can control this quiz.</p>
        </div>}

        {view === 'join' && <div className="join-wrap">
          <button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={15} /> Create a quiz</button>
          {error && !event ? <div className="notice-card error-message" role="alert">{error}</div> : event && !participant ? <>
            <div className="eyebrow"><span className="eyebrow-line" />{event.state === 'lobby' ? 'YOU’RE INVITED' : 'TEST IN PROGRESS'}<span className="eyebrow-line" /></div>
            <h1 className="join-title">{event.title}<br /><span className="gradient-text">{event.state === 'lobby' ? 'starts with you.' : 'join in.'}</span></h1>
            <div className="join-meta"><span><Users size={16} /> {event.participant_count} here</span><span className="meta-divider" /><span>ROOM {event.join_code}</span></div>
            <form className="join-card" onSubmit={joinQuiz}>
              <h2>{event.state === 'lobby' ? 'Save your seat.' : 'Join the test.'}</h2><p>Pick a name your friends will recognize.</p>
              <label className="field-label" htmlFor="player-name">YOUR NAME</label><input id="player-name" className="text-input" maxLength="80" autoComplete="name" placeholder="Your name" value={joinForm.name} onChange={(e) => setJoinForm({ ...joinForm, name: e.target.value })} required />
              <label className="field-label" htmlFor="display-name">DISPLAY NAME</label><input id="display-name" className="text-input" maxLength="32" placeholder="How you’ll appear on the leaderboard" value={joinForm.display_name} onChange={(e) => setJoinForm({ ...joinForm, display_name: e.target.value })} required />
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="primary-button full-button" disabled={busy}>{busy ? 'Joining…' : <>{event.state === 'lobby' ? 'Join the lobby' : 'Join the test'} <ArrowRight size={17} /></>}</button>
            </form>
          </> : participant && event.state === 'lobby' && <div className="lobby-card"><span className="lobby-orbit"><Radio size={26} /></span><div className="eyebrow"><span className="eyebrow-line" />YOU’RE IN<span className="eyebrow-line" /></div><h1 className="lobby-title">Stay close,<br /><span className="gradient-text">{participant.display_name}.</span></h1><p className="hero-copy">You’re in the lobby for <strong>{event.title}</strong>.<br />The host will start the game soon.</p><div className="waiting-status"><span className="pulse-dot" /> WAITING FOR THE HOST</div></div>}
          {participant && event.state === 'completed' && <div className="final-results"><div className="eyebrow"><span className="eyebrow-line" />QUIZ COMPLETE<span className="eyebrow-line" /></div><h1 className="lobby-title">The final<br /><span className="gradient-text">leaderboard.</span></h1><p className="hero-copy">You finished at rank <strong>#{event.leaderboard_self?.rank ?? '—'}</strong> with <strong>{event.leaderboard_self?.points ?? 0} points.</strong></p><section className="players-card final-ranking"><span className="section-kicker">FINAL STANDINGS</span><RankingList entries={event.leaderboard || []} currentName={participant.display_name} /></section><section className="answer-review"><span className="section-kicker">YOUR ANSWERS</span><h2>Question review</h2>{(event.answer_review || []).map((item) => <article className={`review-row outcome-${item.outcome}`} key={item.position}><div className="review-heading"><span>QUESTION {String(item.position + 1).padStart(2, '0')}</span><strong>{item.outcome.toUpperCase()}</strong></div><h3>{item.prompt}</h3><p>Your answer: <strong>{item.selected_answer ?? 'No answer'}</strong></p><p>Correct answer: <strong>{item.correct_answer}</strong></p></article>)}</section></div>}
          {participant && event.state === 'results' && activeQuestion && <div className="participant-live-layout"><div className="participant-test result-interval"><div className="eyebrow"><span className="eyebrow-line" />QUESTION RESULTS<span className="eyebrow-line" /></div><div className="test-progress">QUESTION {String(activeQuestion.position + 1).padStart(2, '0')} <span>OF {String(event.question_count).padStart(2, '0')}</span></div><h1 className="test-question">{activeQuestion.prompt}</h1><p className="answer-locked">Standings are updated. Next question starts in {event.results_remaining_seconds} seconds.</p></div><aside className="participant-leaderboard"><span className="section-kicker">LIVE RANKING</span><h2>Your standing</h2><RankingList entries={event.leaderboard_top3 || []} currentName={participant.display_name} /><div className="your-rank"><span>Your rank</span><strong>#{event.leaderboard_self?.rank ?? '—'}</strong><span>{event.leaderboard_self?.points ?? 0} points</span></div></aside></div>}
          {participant && event.state === 'active' && activeQuestion && <div className="participant-live-layout"><div className="participant-test"><div className="eyebrow"><span className="eyebrow-line" />{event.title}<span className="eyebrow-line" /></div><div className="test-progress">QUESTION {String(activeQuestion.position + 1).padStart(2, '0')} <span>OF {String(event.question_count).padStart(2, '0')}</span></div><div className={`timer-display ${remainingSeconds <= 5 ? 'timer-urgent' : ''}`} aria-live="polite"><strong>{remainingSeconds}</strong><span>SECONDS REMAINING</span></div><div className="timer-track" role="progressbar" aria-label="Question time remaining" aria-valuemin="0" aria-valuemax={activeQuestion.time_limit_seconds} aria-valuenow={Math.min(remainingSeconds, activeQuestion.time_limit_seconds)}><span style={{ width: `${Math.min(100, Math.max(0, remainingSeconds / activeQuestion.time_limit_seconds * 100))}%` }} /></div><h1 className="test-question">{activeQuestion.prompt}</h1><div className="test-choices">{activeQuestion.choices.map((choice, index) => <button key={index} className={`test-choice ${answeredChoice === index ? 'selected' : ''}`} aria-pressed={answeredChoice === index} disabled={answeredChoice != null || remainingSeconds === 0 || answerSubmitting || !event.can_answer_current_question} onClick={() => submitAnswer(index)}><span>{String.fromCharCode(65 + index)}</span>{choice}</button>)}</div>{!event.can_answer_current_question && <p className="answer-locked">You joined during this question. You can answer the next one.</p>}{answeredChoice != null && <p className="answer-locked">Answer locked in. Standings update when the question ends.</p>}{remainingSeconds === 0 && <p className="answer-locked">Time is up. Showing the standings…</p>}{error && <p className="error-message" role="alert">{error}</p>}</div><aside className="participant-leaderboard"><span className="section-kicker">LIVE RANKING</span><h2>Your standing</h2><RankingList entries={event.leaderboard_top3 || []} currentName={participant.display_name} /><div className="your-rank"><span>Your rank</span><strong>#{event.leaderboard_self?.rank ?? '—'}</strong><span>{event.leaderboard_self?.points ?? 0} points</span></div></aside></div>}
        </div>}

        {view === 'host' && <div className="host-wrap">
          {error && !hostInfo ? <div className="notice-card error-message" role="alert">{error}</div> : hostInfo && <>
            <div className="eyebrow"><span className="eyebrow-line" />HOST CONTROL<span className="eyebrow-line" /></div><h1 className="host-title">{hostInfo.title}<br /><span className="gradient-text">{hostInfo.state === 'lobby' ? 'lobby.' : hostInfo.state === 'completed' ? 'complete.' : 'live.'}</span></h1>
            <div className="host-stats"><div className="stat-card"><span className="section-kicker">IN THE ROOM</span><strong>{String(hostInfo.participant_count).padStart(2, '0')}</strong><span className="stat-caption">of 50 players</span></div><div className="stat-card"><span className="section-kicker">JOIN CODE</span><strong className="stat-code">{hostInfo.join_code}</strong><button className="copy-inline" onClick={() => copy(hostInfo.join_code)}><Copy size={14} /> Copy code</button></div></div>
            <div className="players-card"><div className="players-heading"><div><span className="section-kicker">THE CROWD</span><h2>Players in the room</h2></div><div className="host-indicators"><span className="event-state-pill">{hostInfo.state.toUpperCase()}</span><span className={`live-pill connection-${hostConnection}`}><span className="status-dot" />{hostConnection === 'connected' ? 'LIVE' : hostConnection.toUpperCase()}</span></div></div>
              {hostInfo.state === 'lobby' ? (hostInfo.participants.length ? <div className="player-list">{hostInfo.participants.map((player, index) => <div className="player-row" key={`${player.display_name}-${index}`}><span className="player-avatar">{player.display_name.slice(0, 1).toUpperCase()}</span><span>{player.display_name}</span><span className="player-private">{player.name}</span></div>)}</div> : <div className="empty-players"><Users size={22} /><p>Share the join code and your players will appear here.</p></div>) : <><div className="host-live-summary">{hostInfo.state === 'completed' ? 'Final standings' : hostInfo.state === 'results' ? 'Question results' : `Question ${Number(hostInfo.current_question_position ?? 0) + 1} of ${hostInfo.question_count}`}</div><RankingList entries={hostInfo.leaderboard || []} showPoints /></>}
              {hostInfo.state === 'lobby' ? <button className="primary-button start-quiz-button" onClick={startQuiz} disabled={busy || hostInfo.participant_count === 0}>{busy ? 'Starting…' : <>Start quiz <ArrowRight size={17} /></>}</button> : <p className="quiz-started">{hostInfo.state === 'completed' ? 'Quiz complete.' : 'Standings update live as answers come in.'}</p>}
              {error && <p className="error-message" role="alert">{error}</p>}
            </div><p className="private-note">New participants appear here as they join.</p>
          </>}
        </div>}
      </section>
      {view === 'create' && <footer className="page-footer"><span>BUILT FOR THE MOMENT BETWEEN “I KNOW THIS” AND “WAIT, WHAT?”</span><ArrowDown size={15} /></footer>}
      {view !== 'create' && <footer className="page-footer"><span>QUIZ AURA <i>·</i> GOOD QUESTIONS, BETTER COMPANY</span><span>POWERED BY CURIOSITY</span></footer>}
    </main>
  );
}
