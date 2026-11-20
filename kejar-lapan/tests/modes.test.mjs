import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from '../js/modes.js';
import { createRun, step } from '../js/sim.js';
import { STEP } from '../js/config.js';
import { botActions } from './bot.mjs';

test('daily course is shared across roles and changes at midnight Malaysia time', () => {
  const before = new Date('2026-11-19T15:59:59Z');
  const after = new Date('2026-11-19T16:00:00Z');
  const a = runPlan('daily', 'pelajar', before);
  assert.deepEqual(a, runPlan('daily', 'staf', before));
  assert.equal(a.day, '2026-11-19');
  assert.equal(a.destination.short, 'DATC');
  const b = runPlan('daily', 'pelajar', after);
  assert.equal(b.day, '2026-11-20');
  assert.notEqual(a.seed, b.seed);
  assert.notEqual(a.key, b.key);
});

test('role destinations remain at their intended buildings when landmarks are reordered', () => {
  for (const [role, type] of Object.entries({ pelajar: 'fakulti', staf: 'saas', alumni: 'datc', awam: 'ptar' })) {
    assert.equal(runPlan('destination', role).destination.type, type, role);
  }
});

test('each destination and the daily route can be finished with the real clock', () => {
  for (const mode of ['destination', 'daily']) {
    for (const role of ['pelajar', 'staf', 'alumni', 'awam']) {
      const plan = runPlan(mode, role, new Date('2026-11-19T00:00:00Z'));
      const run = createRun({ ...plan, role });
      const events = [];
      while (run.status === 'running' && run.t < 180) events.push(...step(run, botActions(run)));
      assert.equal(run.status, 'arrived', `${mode}/${role} at ${run.distance}`);
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

test('endless mode retains no finish; unknown modes fall back to destination', () => {
  assert.equal(runPlan('endless', 'pelajar').finishAt, null);
  assert.equal(runPlan('endless', 'pelajar').key, null);
  assert.equal(runPlan('broken', 'pelajar').mode, 'destination');
});
