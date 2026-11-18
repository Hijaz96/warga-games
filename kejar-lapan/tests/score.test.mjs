import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDistance, formatTime, formatClock } from '../js/score.js';
import { createRun, step } from '../js/sim.js';
import { SERVER, LANES, CLOCK, STEP } from '../js/config.js';
import { botActions } from './bot.mjs';

test('distance shows metres below a kilometre, then km', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(999), '999 m');
  assert.equal(formatDistance(999.9), '999 m');
  assert.equal(formatDistance(1000), '1.00 km');
  assert.equal(formatDistance(1250), '1.25 km');
  assert.equal(formatDistance(12400), '12.40 km');
});

test('the campus clock counts to 8:00', () => {
  assert.equal(formatClock(CLOCK.start), '07:55:00');
  assert.equal(formatClock(0), '08:00:00');
  assert.equal(formatClock(CLOCK.start / 5), '07:59:00');
});

test('formatTime', () => {
  assert.equal(formatTime(45), '0:45');
  assert.equal(formatTime(187), '3:07');
});

// arked_record (hub repo, supabase/arked.sql) refuses a round over max_points_per_sec. The fastest
// scoring possible: boosting all the time and taking every item on a hard stretch of course.
test('even a perfect boosted run scores under the server limit per second', () => {
  for (const seed of [1, 2, 3]) {
    const s = createRun({ seed });
    s.distance = 4000;
    s.course.nextRowAt = 4100;
    s.course.obstacles = [];
    s.course.items = [];
    s.checkpoints = 0; // every checkpoint up to here pays out at once: the worst case
    const startT = s.t;
    while (s.distance < 12000) {
      s.timeLeft = 1e6;
      s.boostT = 10;
      s.shield = true;
      // Teleport to the next item's lane: takes every item.
      const next = s.course.items.filter((i) => !i.taken && i.at >= s.distance).sort((a, b) => a.at - b.at)[0];
      if (next) {
        s.lane = next.lane;
        s.x = LANES[next.lane];
      }
      step(s);
    }
    const perSec = s.score / (s.t - startT);
    assert.ok(perSec < SERVER.maxPointsPerSec, `seed ${seed}: ${perSec.toFixed(0)} points a second`);
  }
});

test('a long, well-played run stays under the server maximum', () => {
  const s = createRun({ seed: 11 });
  let steps = 0;
  while (s.status === 'running' && steps < 60 * 60 * 30) {
    step(s, botActions(s));
    steps++;
  }
  assert.ok(s.score <= SERVER.maxPoints);
});
