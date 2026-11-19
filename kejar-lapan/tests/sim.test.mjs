import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step, nextCheckpoint, runSeconds } from '../js/sim.js';
import { checkpointAt, checkpointTime } from '../js/course.js';
import { CLOCK, LANES, STEP, OBSTACLES, JUMP_BUFFER, SHIELD } from '../js/config.js';
import { botActions } from './bot.mjs';

/** A run with an empty course except the obstacles given: [{ at, lane, type }]. */
function runWith(obstacles, opts = {}) {
  const s = createRun({ seed: 1 });
  s.course.obstacles = obstacles.map((o, i) => ({ id: 1000 + i, hit: false, ...o }));
  s.course.items = [];
  s.course.nextRowAt = Infinity; // lay nothing more
  Object.assign(s, opts);
  return s;
}

/** Steps until past distance `d` or the run ends; `actionsAt(s)` gives each step's actions. */
function runTo(s, d, actionsAt = () => []) {
  const events = [];
  while (s.status === 'running' && s.distance < d) {
    s.timeLeft = 1e6; // the clock isn't what these tests are about
    events.push(...step(s, actionsAt(s)));
  }
  return events;
}

test('running into a cone crashes', () => {
  const s = runWith([{ at: 30, lane: 1, type: 'cone' }]);
  runTo(s, 40);
  assert.equal(s.status, 'crashed');
});

test('jumping clears a cone, a pothole and a monkey', () => {
  for (const type of ['cone', 'pothole', 'monkey']) {
    const s = runWith([{ at: 30, lane: 1, type }]);
    let jumped = false;
    runTo(s, 40, (st) => {
      if (!jumped && st.distance > 30 - 0.15 * st.speed - OBSTACLES[type].len / 2) {
        jumped = true;
        return ['jump'];
      }
      return [];
    });
    assert.equal(s.status, 'running', type);
  }
});

test('jumping into a barrier crashes; sliding under it is safe', () => {
  const jumpy = runWith([{ at: 30, lane: 1, type: 'barrier' }]);
  runTo(jumpy, 40, (st) => (st.distance > 27 && !st.airborne && st.distance < 29 ? ['jump'] : []));
  assert.equal(jumpy.status, 'crashed');
  const slidy = runWith([{ at: 30, lane: 1, type: 'barrier' }]);
  runTo(slidy, 40, (st) => (st.distance > 27 && st.distance < 27.5 ? ['slide'] : []));
  assert.equal(slidy.status, 'running');
});

test('a bus blocks its lane, even mid-jump', () => {
  const s = runWith([{ at: 30, lane: 1, type: 'bus' }]);
  runTo(s, 40, (st) => (st.distance > 24 && !st.airborne ? ['jump'] : []));
  assert.equal(s.status, 'crashed');
});

test('changing lane goes around a bus', () => {
  const s = runWith([{ at: 30, lane: 1, type: 'bus' }]);
  let moved = false;
  runTo(s, 40, () => (moved ? [] : ((moved = true), ['left'])));
  assert.equal(s.status, 'running');
  assert.equal(s.x, LANES[0]);
});

test('a thin obstacle is still hit at boosted top speed (no tunnelling)', () => {
  // 60 m/s is 1 m a step; a barrier is only 0.5 m long.
  const s = runWith([{ at: 5000.4, lane: 1, type: 'barrier' }], { distance: 4990 });
  s.boostT = 0;
  const big = 1 / 15; // even a long step of 4 m
  while (s.status === 'running' && s.distance < 5010) {
    s.timeLeft = 1e6;
    s.speed = 60;
    step(s, [], big);
  }
  assert.equal(s.status, 'crashed');
});

test('a shield takes exactly one hit', () => {
  const s = runWith([
    { at: 30, lane: 1, type: 'cone' },
    { at: 60, lane: 1, type: 'cone' },
  ], { shield: true, shieldT: SHIELD.time });
  const events = runTo(s, 45);
  assert.equal(s.status, 'running');
  assert.equal(s.shield, false);
  assert.equal(s.shieldT, 0);
  assert.ok(events.some((e) => e.type === 'shieldBreak'));
  runTo(s, 70);
  assert.equal(s.status, 'crashed');
});

test('boosting smashes through obstacles', () => {
  const s = runWith([{ at: 30, lane: 1, type: 'bus' }], { boostT: 5 });
  const events = runTo(s, 40);
  assert.equal(s.status, 'running');
  assert.ok(events.some((e) => e.type === 'smash'));
});

test('a jump pressed just before landing happens on touchdown', () => {
  const s = runWith([]);
  step(s, ['jump']);
  let landedJump = false;
  let pressed = false;
  for (let i = 0; i < 120; i++) {
    // Press while still in the air, within the buffer of landing.
    const timeToLand = s.airborne && s.vy < 0 ? s.y / -s.vy : Infinity;
    const actions = !pressed && timeToLand < JUMP_BUFFER * 0.8 ? ((pressed = true), ['jump']) : [];
    const ev = step(s, actions);
    if (pressed && ev.some((e) => e.type === 'land') && ev.some((e) => e.type === 'jump')) landedJump = true;
  }
  assert.ok(pressed && landedJump);
});

test('sliding in the air drops fast', () => {
  const s = runWith([]);
  step(s, ['jump']);
  for (let i = 0; i < 10; i++) step(s);
  step(s, ['slide']);
  assert.ok(s.vy <= -26 + 1e-9);
  assert.ok(s.slideT > 0);
});

test('a checkpoint adds time and points; running out of time is late', () => {
  const s = createRun({ seed: 3 });
  s.course.obstacles = [];
  s.course.nextRowAt = Infinity;
  s.course.items = [];
  const at = checkpointAt(0);
  let before = null;
  while (s.distance < at - 1) {
    step(s);
    before = s.timeLeft;
  }
  const events = [];
  while (s.distance < at + 1) events.push(...step(s));
  const cp = events.find((e) => e.type === 'checkpoint');
  assert.ok(cp, 'checkpoint passed');
  assert.equal(cp.add, checkpointTime(0));
  assert.ok(s.timeLeft > before + checkpointTime(0) - 1);
  assert.equal(s.checkpoints, 1);
  assert.equal(nextCheckpoint(s).at, checkpointAt(1));

  s.timeLeft = 0.05;
  const end = [];
  for (let i = 0; i < 10; i++) end.push(...step(s));
  assert.equal(s.status, 'late');
  assert.ok(end.some((e) => e.type === 'late'));
  assert.equal(s.timeLeft, 0);
});

test('the clock never goes above its maximum', () => {
  const s = runWith([]);
  s.timeLeft = CLOCK.max - 1;
  s.course.items = [{ id: 1, at: 20, lane: 1, kind: 'time', taken: false }];
  while (s.distance < 25) step(s);
  assert.ok(s.timeLeft <= CLOCK.max);
});

test('score is a point a metre plus items and checkpoints', () => {
  const s = runWith([]);
  s.course.items = [{ id: 1, at: 20, lane: 1, kind: 'points', taken: false }];
  while (s.distance < 100) step(s);
  assert.equal(s.score, Math.floor(s.distance) + 25);
  assert.equal(s.picked.points, 1);
  assert.ok(runSeconds(s) >= 1);
});

test('the bot gets through 4 km of 30 different courses without crashing', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createRun({ seed });
    runTo(s, 4000, botActions);
    assert.equal(s.status, 'running', `seed ${seed} crashed at ${Math.round(s.distance)} m`);
  }
});

test('same seed, same run', () => {
  const a = createRun({ seed: 9 });
  const b = createRun({ seed: 9 });
  runTo(a, 1500, botActions);
  runTo(b, 1500, botActions);
  assert.equal(a.score, b.score);
  assert.equal(a.t, b.t);
});


test('a support clock gives +5 s only when its actual lane is reached', () => {
  const missed = runWith([], { distance: 19, timeLeft: 20 });
  missed.course.items = [{ id: 2000, lane: 0, at: 20, kind: 'time', taken: false, support: true }];
  step(missed);
  assert.equal(missed.picked.time, 0);
  assert.ok(missed.timeLeft < 20);
  assert.equal(missed.course.items[0].taken, false);
  const collected = runWith([], { distance: 19, timeLeft: 20, lane: 0, x: LANES[0] });
  collected.course.items = [{ id: 2000, lane: 0, at: 20, kind: 'time', taken: false, support: true }];
  step(collected);
  assert.equal(collected.picked.time, 1);
  assert.ok(Math.abs(collected.timeLeft - (25 - STEP)) < 1e-9);
  assert.equal(collected.course.items[0].taken, true);
  step(collected);
  assert.equal(collected.picked.time, 1);
});


test('shield pickup expires after ten active seconds and announces expiry only once', () => {
  const run = runWith([]);
  run.course.items = [{ id: 2000, lane: 1, at: 1, kind: 'shield', taken: false }];
  step(run);
  assert.equal(run.shieldT, SHIELD.time);
  assert.equal(run.shield, true);
  const events = [];
  for (let i = 0; i < SHIELD.time / STEP; i++) events.push(...step(run));
  assert.equal(run.shield, false);
  assert.equal(run.shieldT, 0);
  assert.equal(events.filter((event) => event.type === 'shieldExpire').length, 1);
  assert.equal(step(run).some((event) => event.type === 'shieldExpire'), false);
});

test('another shield refreshes the countdown instead of adding duration', () => {
  const run = runWith([], { shield: true, shieldT: 4 });
  run.course.items = [{ id: 2000, lane: 1, at: 1, kind: 'shield', taken: false }];
  step(run);
  assert.equal(run.shieldT, SHIELD.time);
  step(run);
  assert.ok(run.shieldT < SHIELD.time);
  assert.ok(run.shieldT > SHIELD.time - 0.1);
});

test('boost smashes keep the shield but its timer still expires normally', () => {
  const run = runWith([{ at: 10, lane: 1, type: 'cone' }], { boostT: 5, shield: true, shieldT: 2 });
  const events = [];
  while (run.distance < 20) events.push(...step(run));
  assert.equal(run.status, 'running');
  assert.equal(run.shield, true);
  assert.ok(run.shieldT < 2);
  assert.ok(events.some((event) => event.type === 'smash'));
  assert.equal(events.some((event) => event.type === 'shieldBreak'), false);
  while (run.shield) step(run);
  assert.ok(run.boostT > 0);
  assert.equal(run.shieldT, 0);
});

test('an expired shield cannot protect against the next obstacle', () => {
  const run = runWith([{ at: 30, lane: 1, type: 'cone' }], { shield: true, shieldT: 0.1 });
  while (run.status === 'running' && run.distance < 40) step(run);
  assert.equal(run.status, 'crashed');
  assert.equal(run.shield, false);
  assert.equal(run.shieldT, 0);
});
