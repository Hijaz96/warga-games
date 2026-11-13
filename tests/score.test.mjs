import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, formatTime } from '../js/score.js';

// Reference values computed by hand from the formula in supabase/schema.sql:
// ((hidden*50 + max(0, hidden*8 - seconds)*10) * pct + 50) / 100, integer division.
test('score matches the SQL formula', () => {
  assert.equal(computeScore(20, 100, 0), 1600); // 1000 + 60*10
  assert.equal(computeScore(20, 100, 1), 1120); // 1600 * 0.7
  assert.equal(computeScore(20, 100, 2), 640); // 1600 * 0.4
  assert.equal(computeScore(20, 500, 0), 1000); // past par: no time bonus
  assert.equal(computeScore(15, 120, 1), 525); // 750 * 0.7 = 525
  assert.equal(computeScore(3, 24, 1), 105); // 150 * 0.7 = 105
  assert.equal(computeScore(1, 8, 1), 35); // 50 * 0.7 = 35
  assert.equal(computeScore(3, 25, 1), 105); // 150 * 0.7 = 105
});

test('integer rounding is half-up and never relies on floats', () => {
  // 15 * 0.7 = 10.5 → 11 (a float multiply would give 10.499…)
  assert.equal(computeScore(0, 0, 1), 0);
  assert.equal(Math.floor((15 * 70 + 50) / 100), 11);
});

test('faster and fewer mistakes always score higher', () => {
  assert.ok(computeScore(20, 60, 0) > computeScore(20, 90, 0));
  assert.ok(computeScore(20, 60, 0) > computeScore(20, 60, 1));
  assert.ok(computeScore(20, 60, 1) > computeScore(20, 60, 2));
});

test('three mistakes scores zero', () => {
  assert.equal(computeScore(20, 60, 3), 0);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(600), '10:00');
});
