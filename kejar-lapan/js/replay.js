// Sparse inputs replayed at the same fixed ticks as the live run. No wall-clock timing.
import { createRun, step } from './sim.js';

const ACTIONS = new Set(['left', 'right', 'jump', 'slide']);
export const MAX_REPLAY_TICKS = 60 * 60 * 5;

export function createRecording(run, plan) {
  return { key: plan.key, seed: run.seed, role: run.role, finishAt: run.finishAt, inputs: [], ticks: 0 };
}

export function recordTick(recording, actions) {
  if (recording.ticks >= MAX_REPLAY_TICKS) return;
  if (actions.length) recording.inputs.push([recording.ticks, [...actions]]);
  recording.ticks++;
}

export function validReplay(replay, plan) {
  if (!replay || replay.key !== plan.key || replay.seed !== plan.seed || replay.finishAt !== plan.finishAt ||
      !['pelajar', 'staf', 'alumni', 'awam'].includes(replay.role) ||
      !Number.isInteger(replay.ticks) || replay.ticks < 1 || replay.ticks > MAX_REPLAY_TICKS ||
      !Array.isArray(replay.inputs) || replay.inputs.length > replay.ticks ||
      !replay.result || !['arrived', 'crashed', 'late'].includes(replay.result.status) ||
      !['distance', 'score', 't'].every((k) => Number.isFinite(replay.result[k]) && replay.result[k] >= 0)) return false;
  let previous = -1;
  for (const input of replay.inputs) {
    if (!Array.isArray(input) || input.length !== 2) return false;
    const [tick, actions] = input;
    if (!Number.isInteger(tick) || tick <= previous || tick >= replay.ticks || !Array.isArray(actions) ||
        actions.length < 1 || actions.length > 32 || !actions.every((a) => ACTIONS.has(a))) return false;
    previous = tick;
  }
  return true;
}

export function createGhost(replay, plan) {
  if (!validReplay(replay, plan)) return null;
  return { run: createRun({ seed: replay.seed, role: replay.role, finishAt: replay.finishAt }), replay, tick: 0, cursor: 0 };
}

export function stepGhost(ghost) {
  if (!ghost || ghost.tick >= ghost.replay.ticks || ghost.run.status !== 'running') return;
  const input = ghost.replay.inputs[ghost.cursor];
  const actions = input?.[0] === ghost.tick ? ghost.replay.inputs[ghost.cursor++][1] : [];
  step(ghost.run, actions);
  ghost.tick++;
}

// Completed runs beat failures; faster finishes win. Otherwise, furthest distance wins.
export function betterRun(run, previous) {
  if (!previous) return true;
  const arrived = run.status === 'arrived';
  if (arrived !== (previous.status === 'arrived')) return arrived;
  if (arrived && run.t !== previous.t) return run.t < previous.t;
  if (!arrived && run.distance !== previous.distance) return run.distance > previous.distance;
  return run.score > previous.score;
}
