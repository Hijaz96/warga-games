import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseSpeed, createCourse, extendCourse, pattern, passable, checkpointAt, checkpointTime, landmarkFor, rowGap, tierAt } from '../js/course.js';
import { OBSTACLES, LANES, CHECKPOINTS, CLOCK, LANDMARKS, ROWS, LANE_SPEED, TIME_SUPPORT } from '../js/config.js';
import { mulberry32 } from '../../shared/rng.js';

function rowsOf(course) {
  const rows = new Map();
  for (const o of course.obstacles) {
    if (!rows.has(o.at)) rows.set(o.at, [null, null, null]);
    rows.get(o.at)[o.lane] = o.type;
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}

test('every row of 200 courses (3 km each) leaves a lane to get through', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const c = createCourse(seed);
    extendCourse(c, 3000);
    for (const [at, cells] of rowsOf(c)) {
      assert.ok(cells.some(passable), `seed ${seed}, row at ${at}: ${cells}`);
    }
  }
});

test('there is time to reach the open lane: rows are far enough apart to cross two lanes', () => {
  const crossTwo = (2 * (LANES[1] - LANES[0])) / LANE_SPEED;
  for (let d = 0; d < 8000; d += 50) {
    const gapTime = rowGap(d) / 40; // even at top speed
    assert.ok(gapTime > crossTwo + 0.3, `at ${d} m`);
  }
});

test('items never share road with an obstacle in the same lane', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const c = createCourse(seed);
    extendCourse(c, 3000);
    for (const it of c.items) {
      for (const o of c.obstacles) {
        if (o.lane !== it.lane) continue;
        assert.ok(Math.abs(o.at - it.at) > OBSTACLES[o.type].len / 2 + 1, `seed ${seed}: ${it.kind} at ${it.at} vs ${o.type} at ${o.at}`);
      }
    }
  }
});

test('the same seed gives the same course', () => {
  const a = createCourse(42);
  const b = createCourse(42);
  extendCourse(a, 2000);
  extendCourse(b, 2000);
  assert.deepEqual(a.obstacles, b.obstacles);
  assert.deepEqual(a.items, b.items);
  const c = createCourse(43);
  extendCourse(c, 2000);
  assert.notDeepEqual(a.obstacles, c.obstacles);
});

test('easy tiers use only easy patterns', () => {
  const rng = mulberry32(5);
  for (let i = 0; i < 500; i++) {
    const cells = pattern(rng, 0);
    assert.ok(cells.filter(Boolean).length <= 2);
  }
  assert.equal(tierAt(0), 0);
  assert.equal(tierAt(600), 1);
  assert.equal(tierAt(5000), 3);
});

test('rows come closer together in time as the run goes on', () => {
  const secondsBetween = (d) => rowGap(d) / baseSpeed(d);
  assert.ok(secondsBetween(0) > secondsBetween(2000));
  assert.ok(secondsBetween(2000) > secondsBetween(ROWS.hardAt));
  assert.ok(secondsBetween(ROWS.hardAt) >= ROWS.hardTime - 1e-9);
});

test('checkpoints spread out and give less time each, never below the minimum', () => {
  assert.equal(checkpointAt(0), CHECKPOINTS.first);
  assert.equal(checkpointAt(1) - checkpointAt(0), CHECKPOINTS.first + CHECKPOINTS.grow);
  assert.equal(checkpointTime(0), CLOCK.cpFirst);
  assert.equal(checkpointTime(100), CLOCK.cpMin);
  assert.equal(landmarkFor(0), LANDMARKS[1]);
  assert.equal(landmarkFor(LANDMARKS.length - 1), LANDMARKS[1]); // the gate is only at the start
});


test('one support clock appears every twelfth row in a seeded random lane', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const course = createCourse(seed);
    extendCourse(course, 15000);
    const clocks = course.items.filter((item) => item.support);
    assert.equal(clocks.length, Math.floor(course.rowsPlaced / TIME_SUPPORT.everyRows));
    assert.ok(clocks.every((item) => item.kind === 'time' && [0, 1, 2].includes(item.lane)));
    assert.ok(new Set(clocks.map((item) => item.lane)).size > 1);
    const positions = clocks.map((item) => item.at);
    assert.equal(new Set(positions).size, positions.length, 'never duplicate a support clock across lanes');
    assert.ok(positions.length > 20);
    const expected = rowsOf(course).filter((_, i) => (i + 1) % TIME_SUPPORT.everyRows === 0).map(([at]) => at + Math.max(rowGap(at), TIME_SUPPORT.minGap) / 2);
    assert.deepEqual(positions, expected);
  }
});
