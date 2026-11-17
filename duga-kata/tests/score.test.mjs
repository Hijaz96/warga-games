import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, formatTime, GUESS_POINTS, PAR_SECONDS } from '../js/score.js';

test('fewer guesses score more', () => {
  for (let g = 1; g < GUESS_POINTS.length; g++) {
    assert.ok(computeScore(true, g, 300) > computeScore(true, g + 1, 300));
  }
});

test('faster wins score more, down to no bonus at par', () => {
  assert.equal(computeScore(true, 3, 0), 600 + PAR_SECONDS * 2);
  assert.equal(computeScore(true, 3, 60), 600 + 240);
  assert.equal(computeScore(true, 3, PAR_SECONDS), 600);
  assert.equal(computeScore(true, 3, 5000), 600);
});

test('a loss scores zero', () => {
  assert.equal(computeScore(false, 6, 30), 0);
  assert.equal(computeScore(true, 7, 30), 0);
});

// arked_record caps duga-kata rounds (hub repo, supabase/arked.sql: arked_games): at most 2,000
// points, and 1,400 points a second. The best possible round is a one-guess win in 1 second
// (the server counts at least 1 second).
test('the best possible round is within the server limits', () => {
  const best = computeScore(true, 1, 1);
  assert.equal(best, 1358);
  assert.ok(best <= 2000);
  assert.ok(best / 1 <= 1400);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
});
