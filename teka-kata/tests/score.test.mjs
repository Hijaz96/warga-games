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

// arked_record caps teka-kata rounds (hub repo, supabase/arked.sql: arked_games): at most 6,000
// points, and 6,000 points a second. Every real round must pass, however fast: the best a phrase
// can score is solving it in 1 second with no mistakes. (A player once solved 15 letters in 7 s,
// 1,880 points, which an earlier 260-a-second limit wrongly refused.)
const MAX_POINTS = 6000;
const MAX_POINTS_PER_SEC = 6000;

test('every phrase scores within the server limits, even solved in 1 second', async () => {
  const { PHRASES } = await import('../js/phrases.js');
  const { createPuzzle } = await import('../js/game.js');
  const { mulberry32 } = await import('../../shared/rng.js');
  for (const p of PHRASES) {
    for (let seed = 1; seed <= 20; seed++) {
      const h = createPuzzle(p.text, mulberry32(seed)).hiddenCount;
      for (let seconds = 1; seconds <= h * 8; seconds++) {
        const best = computeScore(h, seconds, 0);
        assert.ok(best <= MAX_POINTS, `${p.id}: ${best} points`);
        assert.ok(best <= seconds * MAX_POINTS_PER_SEC, `${p.id}: ${best} points in ${seconds}s`);
      }
    }
  }
});

test('the reported round (15 letters, 7 s, no mistakes) passes', () => {
  const points = computeScore(15, 7, 0);
  assert.equal(points, 1880);
  assert.ok(points <= MAX_POINTS && points <= 7 * MAX_POINTS_PER_SEC);
});
