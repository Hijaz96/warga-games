import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, formatTime } from '../js/score.js';

// Reference values computed by hand from the formula (see README, Scoring):
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

// arked_record caps teka-kata rounds (hub repo, supabase/arked.sql: arked_games). Any real
// round must pass: at most 10,000 points, and 260 points a second even at half a second a letter.
test('every phrase scores within the server limits', async () => {
  const { PHRASES } = await import('../js/phrases.js');
  const { createPuzzle } = await import('../js/game.js');
  const { mulberry32 } = await import('../../shared/rng.js');
  for (const p of PHRASES) {
    for (let seed = 1; seed <= 20; seed++) {
      const h = createPuzzle(p.text, mulberry32(seed)).hiddenCount;
      const fastest = Math.ceil(h / 2);
      const best = computeScore(h, fastest, 0);
      assert.ok(best <= 10000, `${p.id}: ${best} points`);
      assert.ok(best <= fastest * 260, `${p.id}: ${best} points in ${fastest}s`);
    }
  }
});
