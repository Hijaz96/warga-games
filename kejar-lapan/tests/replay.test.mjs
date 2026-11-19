import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step } from '../js/sim.js';
import { runPlan } from '../js/modes.js';
import { createRecording, recordTick, createGhost, stepGhost, betterRun, validReplay, MAX_REPLAY_TICKS } from '../js/replay.js';
import { botActions } from './bot.mjs';

function recordedRun() {
  const plan = runPlan('daily', 'pelajar', new Date('2026-11-19T00:00:00Z'));
  const run = createRun({ ...plan, role: 'pelajar' });
  const recording = createRecording(run, plan);
  const states = [];
  while (run.status === 'running') {
    const actions = botActions(run);
    recordTick(recording, actions);
    step(run, actions);
    states.push({ x: run.x, y: run.y, slideT: run.slideT, distance: run.distance, score: run.score,
      status: run.status, timeLeft: run.timeLeft, boostT: run.boostT, shield: run.shield });
  }
  recording.result = { status: run.status, distance: run.distance, score: run.score, t: run.t };
  return { plan, recording, states };
}

test('persisted sparse inputs reproduce every tick including movement, pickups and finish', () => {
  const { plan, recording, states } = recordedRun();
  const persisted = JSON.parse(JSON.stringify(recording));
  const ghost = createGhost(persisted, plan);
  assert.ok(ghost);
  assert.ok(recording.inputs.length < recording.ticks / 4);
  for (const expected of states) {
    stepGhost(ghost);
    for (const [key, value] of Object.entries(expected)) assert.equal(ghost.run[key], value, key);
  }
  assert.equal(ghost.run.status, 'arrived');
  const ticks = ghost.tick;
  stepGhost(ghost);
  assert.equal(ghost.tick, ticks);
});

test('ghost replay does not mutate the live course or collect its items', () => {
  const { plan, recording } = recordedRun();
  const live = createRun(plan);
  const before = live.course.items.map((it) => ({ ...it }));
  const ghost = createGhost(recording, plan);
  for (let i = 0; i < 600; i++) stepGhost(ghost);
  assert.equal(live.distance, 0);
  assert.deepEqual(live.course.items, before);
});

test('old dates, incompatible courses and malformed local recordings are ignored', () => {
  const { plan, recording } = recordedRun();
  assert.equal(createGhost(recording, runPlan('daily', 'pelajar', new Date('2026-11-20T00:00:00Z'))), null);
  for (const patch of [
    { key: 'old-version' }, { seed: -1 }, { finishAt: 1 }, { role: 'unknown' },
    { ticks: MAX_REPLAY_TICKS + 1 }, { ticks: 0 }, { result: null },
    { inputs: [[0, ['fly']]] }, { inputs: [[-1, ['left']]] },
    { inputs: [[0, ['left']], [0, ['right']]] }, { inputs: [null] },
  ]) assert.equal(validReplay({ ...recording, ...patch }, plan), false, JSON.stringify(patch));
});

test('best replay prefers finishes, then faster finishes, then furthest failed attempt', () => {
  const arrived = { status: 'arrived', t: 70, score: 3000, distance: 1900 };
  const failed = { status: 'crashed', t: 69, score: 4000, distance: 1850 };
  assert.equal(betterRun(arrived, null), true);
  assert.equal(betterRun(arrived, failed), true);
  assert.equal(betterRun(failed, arrived), false);
  assert.equal(betterRun({ ...arrived, t: 69, score: 2800 }, arrived), true);
  assert.equal(betterRun({ ...arrived, t: 71, score: 5000 }, arrived), false);
  assert.equal(betterRun({ ...failed, distance: 1860, score: 2000 }, failed), true);
  assert.equal(betterRun(arrived, arrived), false);
});
