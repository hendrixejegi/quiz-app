import { createContext, useContext, useState } from 'react';
export const blankQuestion = () => ({
  prompt: '',
  choices: ['', '', '', ''],
  correct_choice_index: 0,
  time_limit_seconds: 20,
});
const QuizDraftContext = createContext(null);
export function QuizDraftProvider({ children }) {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([blankQuestion()]);
  function updateQuestion(index, updates) {
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...question, ...updates } : question,
      ),
    );
  }
  return (
    <QuizDraftContext.Provider
      value={{ title, setTitle, questions, setQuestions, updateQuestion }}
    >
      {children}
    </QuizDraftContext.Provider>
  );
}
export function useQuizDraft() {
  return useContext(QuizDraftContext);
}
