import { RouterProvider } from 'react-router';
import { router } from './router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { QuizDraftProvider } from './contexts/QuizDraftContext';
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QuizDraftProvider>
          <RouterProvider router={router} />
        </QuizDraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
