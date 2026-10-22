import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CATEGORIES, createDemoQuizPayload, shuffle } from './demoQuiz.js';

test('Fisher–Yates shuffle keeps every item and changes order with a deterministic random source', () => {
  const source = [1, 2, 3, 4, 5];
  const result = shuffle(source, () => 0);

  assert.deepEqual(source, [1, 2, 3, 4, 5]);
  assert.deepEqual([...result].sort(), source);
  assert.notDeepEqual(result, source);
});

test('the demo bank has 30 four-option questions split evenly across three categories', () => {
  assert.equal(DEMO_CATEGORIES.length, 3);
  assert.deepEqual(DEMO_CATEGORIES.map(({ questions }) => questions.length), [10, 10, 10]);
  assert.equal(new Set(DEMO_CATEGORIES.flatMap(({ questions }) => questions.map(({ id }) => id))).size, 30);

  for (const { questions } of DEMO_CATEGORIES) {
    for (const item of questions) {
      assert.equal(item.options.length, 4, `${item.id} must have four choices`);
      assert.equal(new Set(item.options).size, 4, `${item.id} must have distinct choices`);
      assert.ok(item.options.includes(item.answer), `${item.id} must include its correct answer`);
    }
  }
});

test('each category payload shuffles its ten questions and options while keeping correct answer indexes valid', () => {
  for (const category of DEMO_CATEGORIES) {
    const payload = createDemoQuizPayload(category.id, () => 0);
    const originalPrompts = category.questions.map(({ prompt }) => prompt);

    assert.equal(payload.title, `${category.name} — Demo Quiz`);
    assert.equal(payload.questions.length, 10);
    assert.deepEqual([...payload.questions.map(({ prompt }) => prompt)].sort(), [...originalPrompts].sort());
    assert.notDeepEqual(payload.questions.map(({ prompt }) => prompt), originalPrompts);

    for (const outputQuestion of payload.questions) {
      const original = category.questions.find(({ prompt }) => prompt === outputQuestion.prompt);
      assert.equal(outputQuestion.choices.length, 4);
      assert.deepEqual([...outputQuestion.choices].sort(), [...original.options].sort());
      assert.equal(outputQuestion.choices[outputQuestion.correct_choice_index], original.answer);
      assert.equal(outputQuestion.time_limit_seconds, 20);
    }
  }
});

test('unknown demo categories fail with a useful message', () => {
  assert.throws(() => createDemoQuizPayload('missing'), /Choose a demo quiz category/);
});
