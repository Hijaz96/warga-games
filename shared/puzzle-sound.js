// Short synthesised sound effects for the puzzle games, in the style of Kejar Lapan's
// (kejar-lapan/js/audio.js): no audio files, so nothing extra to download.
let ctx = null;
let muted = false;

export const setPuzzleMuted = (m) => { muted = m; };

/** Creates or wakes the audio context; call from a tap or drag (browsers require one). */
export function unlockPuzzleSound() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx?.state === 'suspended') ctx.resume();
}

function tone(wave, notes, gain, length, delay = 0) {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  for (const [t, f, how] of notes) {
    if (how === 'ramp') osc.frequency.exponentialRampToValueAtTime(f, now + t);
    else osc.frequency.setValueAtTime(f, now + t);
  }
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + length);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + length + 0.02);
}

/**
 * pick: a piece is chosen · place: a piece lands · clear: lines clear (`lines`, `streak` raise
 * the arpeggio) · miss: a piece doesn't fit there · over: no room left.
 */
export function playPuzzle(name, { lines = 1, streak = 1 } = {}) {
  if (muted || !ctx || ctx.state !== 'running') return;
  if (name === 'pick') tone('sine', [[0, 520], [0.05, 640, 'ramp']], 0.06, 0.06);
  if (name === 'place') tone('triangle', [[0, 300], [0.07, 200, 'ramp']], 0.16, 0.09);
  if (name === 'miss') tone('square', [[0, 180], [0.1, 140, 'ramp']], 0.05, 0.12);
  if (name === 'clear') {
    // C–E–G–C… one more note per extra line, a little higher for each step of a streak.
    const lift = 1 + 0.06 * Math.min(8, Math.max(0, streak - 1));
    [523, 659, 784, 1047, 1319, 1568].slice(0, Math.min(6, 2 + lines))
      .forEach((f, i) => tone('square', [[0, f * lift]], 0.06, 0.16, i * 0.06));
  }
  if (name === 'over') tone('triangle', [[0, 392], [0.15, 330], [0.3, 262], [0.45, 196]], 0.16, 0.6);
}
