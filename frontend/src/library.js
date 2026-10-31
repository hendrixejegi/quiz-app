// Restrict sign-in return destinations to this feature's own local routes.
export function libraryReturnPath(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/library') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/';
  try {
    const url = new URL(value, 'https://quizpop.invalid');
    return url.origin === 'https://quizpop.invalid' &&
      (url.pathname === '/library' || url.pathname.startsWith('/library/'))
      ? url.pathname + url.search + url.hash
      : '/';
  } catch {
    return '/';
  }
}
export function draftContent(quiz) {
  return {
    title: quiz.title,
    questions: quiz.questions.map((q) => ({
      ...q,
      choices: [...q.choices],
    })),
  };
}
export function quizTitle(title) {
  return title.trim() || 'Untitled quiz';
}

export function questionCountLabel(count) {
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}
