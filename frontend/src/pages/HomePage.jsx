import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Users } from 'lucide-react';
import { api } from '../api';
import { createDemoQuizPayload } from '../demoQuiz';
import { useAuth } from '../contexts/AuthContext';
import { useQuizDraft } from '../contexts/QuizDraftContext';
import { useAsyncTask } from '../hooks/useAsyncTask';
import DemoQuizzes from '../components/quiz/DemoQuizzes';
import QuizBuilder from '../components/quiz/QuizBuilder';
import CreationConfirmation from '../components/quiz/CreationConfirmation';
import JoinByCodeForm from '../components/quiz/JoinByCodeForm';
export default function HomePage() {
  const { key } = useLocation();
  return <HomeScreen key={key} />;
}
function HomeScreen() {
  const draft = useQuizDraft();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [created, setCreated] = useState(null);
  const [joinMenuOpen, setJoinMenuOpen] = useState(false);
  const [demoCreatingId, setDemoCreatingId] = useState(null);
  const task = useAsyncTask();
  const demoTask = useAsyncTask();
  function complete(result) {
    setCreated({
      ...result,
      participant_url: new URL(result.participant_url, window.location.origin)
        .href,
    });
  }
  function requireAccount() {
    if (loading) return false;
    if (!user) {
      navigate('/account/login');
      return false;
    }
    return true;
  }
  function createDemoQuiz(id) {
    if (!requireAccount() || demoTask.busy) return;
    setDemoCreatingId(id);
    demoTask.run(
      (signal) =>
        api('/api/quizzes', {
          method: 'POST',
          signal,
          body: JSON.stringify(createDemoQuizPayload(id)),
        }),
      complete,
    );
  }
  function createQuiz(event) {
    event.preventDefault();
    if (!requireAccount() || task.busy) return;
    task.run((signal) => {
      const questions = draft.questions.map((question) => {
        const filled = question.choices
          .map((text, originalIndex) => ({ text: text.trim(), originalIndex }))
          .filter(({ text }) => text);
        const correct_choice_index = filled.findIndex(
          ({ originalIndex }) =>
            originalIndex === question.correct_choice_index,
        );
        if (filled.length < 2)
          throw Error('Each question needs at least two answer choices.');
        if (correct_choice_index < 0)
          throw Error('Choose a correct answer that has text.');
        return {
          ...question,
          choices: filled.map(({ text }) => text),
          correct_choice_index,
        };
      });
      return api('/api/quizzes', {
        method: 'POST',
        signal,
        body: JSON.stringify({ title: draft.title, questions }),
      });
    }, complete);
  }
  if (created) return <CreationConfirmation created={created} />;
  return (
    <>
      <div className="eyebrow">
        <span className="eyebrow-line" />
        GOOD QUESTIONS. GREAT COMPANY.
        <span className="eyebrow-line" />
      </div>
      <h1>
        Make your
        <br />
        <span className="highlight-text">next quiz pop.</span>
      </h1>
      <p className="hero-copy">
        A little friendly competition goes a long way.
        <br className="desktop-break" /> Build a quiz and let the room light up.
      </p>
      <DemoQuizzes
        createDemoQuiz={createDemoQuiz}
        demoCreatingId={demoTask.busy ? demoCreatingId : null}
        demoError={demoTask.error}
      />
      <div className="home-join-action">
        <button
          className="secondary-button"
          type="button"
          onClick={() => setJoinMenuOpen((open) => !open)}
          aria-expanded={joinMenuOpen}
          aria-controls="participant-entry-form"
        >
          <Users size={16} /> Join a quiz
        </button>
      </div>
      {joinMenuOpen && <JoinByCodeForm />}
      <div className="hero-stamp">OR MAKE IT YOUR OWN</div>
      <QuizBuilder
        {...draft}
        createQuiz={createQuiz}
        busy={task.busy || loading}
        error={task.error}
      />
    </>
  );
}
