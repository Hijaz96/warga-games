import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, MODE_LABELS, DAILY_FIRST_CHECKPOINT } from '../js/modes.js';
import { createRun, step } from '../js/sim.js';
import { STEP, LANDMARKS, ROLES } from '../js/config.js';
import { clockBotActions } from './bot.mjs';

test('daily goals stay fixed for each role and change course identity at midnight Malaysia time', () => {
  const before = new Date('2026-11-19T15:59:59Z');
  const after = new Date('2026-11-19T16:00:00Z');
  const a = runPlan('daily', 'pelajar', before);
  assert.deepEqual(a, runPlan('daily', 'pelajar', new Date('2026-11-18T16:00:00Z')));
  assert.equal(a.day, '2026-11-19');
  assert.notEqual(a.key, runPlan('daily', 'staf', before).key);
  const b = runPlan('daily', 'pelajar', after);
  assert.equal(b.day, '2026-11-20');
  assert.notEqual(a.seed, b.seed);
  assert.notEqual(a.key, b.key);
});

test('all roles get distinct, similar daily distances and every eligible landmark can be selected', () => {
  const seen = new Set();
  for (let day = 0; day < 120; day++) {
    const date = new Date(Date.UTC(2026, 10, 1 + day));
    const plans = Object.keys(ROLES).map(role => runPlan('daily', role, date));
    const distances = plans.map(plan => plan.finishAt);
    assert.equal(new Set(distances).size, 4);
    assert.ok(Math.max(...distances) <= 2.1 * Math.min(...distances), `${plans[0].day}: ${distances}`);
    for (const plan of plans) seen.add(plan.destination.type);
  }
  assert.deepEqual(seen, new Set(LANDMARKS.slice(DAILY_FIRST_CHECKPOINT + 1).map(landmark => landmark.type)));
});

test('daily routes for every role can be finished with actual clocks and pickups', () => {
  for (let day = 1; day <= 30; day++) {
    for (const role of ['pelajar', 'staf', 'alumni', 'awam']) {
      const plan = runPlan('daily', role, new Date(`2026-11-${String(day).padStart(2, '0')}T00:00:00Z`));
      const run = createRun({ ...plan, role });
      const events = [];
      while (run.status === 'running' && run.t < 600) events.push(...step(run, clockBotActions(run)));
      assert.equal(run.status, 'arrived', `${plan.day}/${role} at ${run.distance}`);
      assert.equal(run.distance, plan.finishAt);
      assert.ok(run.timeLeft > 0);
      assert.equal(events.filter((e) => e.type === 'arrived').length, 1);
      const frozen = structuredClone({ distance: run.distance, t: run.t, score: run.score });
      assert.deepEqual(step(run, ['jump']), []);
      assert.deepEqual({ distance: run.distance, t: run.t, score: run.score }, frozen);
    }
  }
});

function finishRun(opts = {}) {
  const run = createRun({ seed: 1, finishAt: 300 });
  run.course.obstacles = [];
  run.course.items = [];
  run.course.nextRowAt = Infinity;
  Object.assign(run, { distance: 299.9, timeLeft: 1, ...opts });
  return run;
}

test('finish stops at its exact distance, without awarding checkpoint time', () => {
  const run = finishRun();
  const events = step(run);
  assert.equal(run.status, 'arrived');
  assert.equal(run.distance, 300);
  assert.ok(run.t < STEP);
  assert.ok(run.timeLeft < 1);
  assert.equal(run.checkpoints, 1);
  assert.equal(run.score, 500);
  assert.ok(events.some((e) => e.type === 'arrived'));
});

test('timeout before the finish cannot turn into a win', () => {
  const run = finishRun({ timeLeft: 0.001 });
  step(run);
  assert.equal(run.status, 'late');
  assert.ok(run.distance < 300);
});

test('collision before the finish still loses; obstacles beyond it cannot collide', () => {
  const a = finishRun();
  a.course.obstacles = [{ id: 1, at: 299.9, lane: 1, type: 'barrier' }];
  step(a);
  assert.equal(a.status, 'crashed');
  const b = finishRun();
  b.course.obstacles = [{ id: 1, at: 300.1, lane: 1, type: 'bus' }];
  step(b);
  assert.equal(b.status, 'arrived');
});

test('only daily and endless remain; old destination settings fall back to daily', () => {
  assert.deepEqual(Object.keys(MODE_LABELS), ['daily', 'endless']);
  assert.equal(runPlan('endless', 'pelajar').finishAt, null);
  assert.equal(runPlan('endless', 'pelajar').key, null);
  assert.equal(runPlan('broken', 'pelajar').mode, 'daily');
  assert.equal(runPlan('destination', 'pelajar').mode, 'daily');
  const date = new Date('2026-11-20T00:00:00Z');
  assert.deepEqual(runPlan('daily', 'unknown', date), runPlan('daily', 'pelajar', date));
});
