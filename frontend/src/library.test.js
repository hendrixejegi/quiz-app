import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryReturnPath, draftContent, quizTitle } from './library.js';

test('library sign-in destinations remain local and preserve deep links', () => {
  assert.equal(
    libraryReturnPath('/library/quiz/versions/2?from=list'),
    '/library/quiz/versions/2?from=list',
  );
  for (const value of [
    null,
    '//evil.example/library',
    'https://evil.example',
    '/library-other',
    '/library/../../account/profile',
    '/library\\evil',
    '/library\n',
  ])
    assert.equal(libraryReturnPath(value), '/');
});
test('draft editor clones private content without changing saved choice slots', () => {
  const quiz = {
    title: 'Draft',
    questions: [
      {
        prompt: 'Q',
        choices: ['A', 'B'],
        correct_choice_index: 0,
        time_limit_seconds: 10,
      },
    ],
  };
  const draft = draftContent(quiz);
  assert.equal(draft.questions[0].choices.length, 2);
  draft.questions[0].choices[0] = 'Changed';
  assert.equal(quiz.questions[0].choices[0], 'A');
  assert.equal(quizTitle('  '), 'Untitled quiz');
});

test('organisation and member game authentication returns preserve private destinations without fragments', () => {
  for (const path of [
    '/organisations',
    '/organisations/team/library/quiz/edit',
    '/organisations/invitations/accept',
    '/join/ROOM',
  ])
    assert.equal(libraryReturnPath(path), path);
  assert.equal(
    libraryReturnPath('/organisations/invitations/accept#secret'),
    '/organisations/invitations/accept',
  );
});
