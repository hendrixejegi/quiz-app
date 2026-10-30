import { useLocation } from 'react-router';
import { ArrowDown } from 'lucide-react';
export default function Footer() {
  const { pathname } = useLocation();
  return pathname === '/' ? (
    <footer className="page-footer">
      <span>BUILT FOR THE MOMENT BETWEEN “I KNOW THIS” AND “WAIT, WHAT?”</span>
      <ArrowDown size={15} />
    </footer>
  ) : (
    <footer className="page-footer">
      <span>
        QUIZPOP <i>·</i> GOOD QUESTIONS, BETTER COMPANY
      </span>
      <span>POWERED BY CURIOSITY</span>
    </footer>
  );
}
