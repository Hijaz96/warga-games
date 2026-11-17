import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS, GUESSES } from '../js/words.js';

test('every word is five letters A–Z', () => {
  for (const w of [...ANSWERS, ...GUESSES]) assert.match(w, /^[A-Z]{5}$/, w);
});

test('no word is listed twice', () => {
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  assert.equal(new Set(GUESSES).size, GUESSES.length);
  const both = GUESSES.filter((w) => ANSWERS.includes(w));
  assert.deepEqual(both, [], 'answers are not repeated in GUESSES');
});

test('there are enough answers for a year of daily words', () => {
  assert.ok(ANSWERS.length >= 300, `${ANSWERS.length} answers`);
});
