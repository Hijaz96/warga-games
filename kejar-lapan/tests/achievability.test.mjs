import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, step } from '../js/sim.js';
import { botActions, clockBotActions } from './bot.mjs';
import { runPlan } from '../js/modes.js';
import { COSMETICS, isUnlocked, progressionAfterRun } from '../js/cosmetics.js';

function play(options, stopAt = Infinity) {
  const run = createRun(options);
  while (run.status === 'running' && run.t < 600 && run.distance < stopAt) step(run, clockBotActions(run));
  assert.ok(run.status !== 'running' || run.distance >= stopAt);
  return run;
}

test('all single-run distance rewards are reachable on unmodified endless courses', () => {
  const longestGoal = Math.max(...COSMETICS.filter((item) => item.metric === 'bestDistance').map((item) => item.target));
  let reached = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const run = play({ seed, role: 'pelajar' }, longestGoal);
    if (run.distance >= longestGoal) reached++;
  }
  assert.equal(reached, 30, `Only ${reached}/30 courses reached ${longestGoal} m; support pickups must keep the goal reachable`);
});

test('every item can be earned by real runs without cheats or changing physics', () => {
  let stats = progressionAfterRun({}, play({ seed: 19, role: 'pelajar' }));
  const arrival = play({ ...runPlan('destination', 'staf'), role: 'staf' });
  assert.equal(arrival.status, 'arrived');
  // Players can repeat this actual destination route. Reuse its completed result to audit
  // cumulative goals rather than rerunning identical simulation ticks hundreds of times.
  let repeats = 0;
  while (COSMETICS.some((item) => !isUnlocked(stats, item, false)) && repeats < 1000) {
    stats = progressionAfterRun(stats, arrival);
    repeats++;
  }
  const unreachable = COSMETICS.filter((item) => !isUnlocked(stats, item, false));
  assert.deepEqual(unreachable.map((item) => item.id), []);
  assert.ok(repeats > 0 && repeats < 1000);
});


test('the 12 km goal requires collecting real time pickups rather than bypassing the clock', () => {
  const run = play({ seed: 19, role: 'pelajar' }, 12000);
  assert.ok(run.distance >= 12000);
  assert.ok(run.picked.time > 0);
  const missed = createRun({ seed: 19, role: 'pelajar' });
  while (missed.status === 'running' && missed.t < 600) {
    for (const item of missed.course.items) if (item.kind === 'time') item.taken = true;
    step(missed, botActions(missed));
  }
  assert.equal(missed.status, 'late');
  assert.ok(missed.distance < 12000);
});
