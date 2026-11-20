// Kejar Lapan: short sound effects plus original, streamed campus music.
import { createMusicPlayer } from './music.js';
import { createSoundSpace } from './sound-space.js';

let ctx = null;
let muted = false;
let music = null;
let space = null;

export const setMuted = (m) => {
  muted = m;
  if (m) stopMusic();
};

/** Creates or wakes the audio context; call from a tap or key press (browsers require one). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      ctx = new AC();
      space = createSoundSpace(ctx);
      music = createMusicPlayer(ctx, { destination: space.input });
    }
  }
  if (ctx?.state === 'suspended') ctx.resume();
}

/** [wave, [[time, frequency]…], gain, length] for each sound; a frequency glides when ramped. */
const SOUNDS = {
  jump: ['sine', [[0, 220], [0.18, 560, 'ramp']], 0.16, 0.18],
  slide: ['triangle', [[0, 280], [0.22, 95, 'ramp']], 0.14, 0.22],
  lane: ['sine', [[0, 340], [0.06, 430, 'ramp']], 0.07, 0.06],
  points: ['sine', [[0, 680], [0.07, 920]], 0.13, 0.2],
  powerup: ['triangle', [[0, 440], [0.07, 554], [0.14, 659], [0.21, 880]], 0.18, 0.36],
  checkpoint: ['square', [[0, 523], [0.09, 659], [0.18, 784], [0.27, 1047]], 0.08, 0.42],
  shieldBreak: ['sawtooth', [[0, 340], [0.26, 110, 'ramp']], 0.18, 0.26],
  smash: ['square', [[0, 200], [0.12, 80, 'ramp']], 0.12, 0.14],
  crash: ['sawtooth', [[0, 145], [0.45, 38, 'ramp']], 0.26, 0.45],
  late: ['square', [[0, 880], [0.15, 880], [0.3, 660], [0.45, 440]], 0.1, 0.6],
  step: ['sine', [[0, 90], [0.035, 42, 'ramp']], 0.03, 0.035],
};

export function play(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const s = SOUNDS[name];
  if (!s) return;
  const [wave, notes, gain, length] = s;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  for (const [t, f, how] of notes) {
    if (how === 'ramp') osc.frequency.exponentialRampToValueAtTime(f, now + t);
    else osc.frequency.setValueAtTime(f, now + t);
  }
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + length);
  osc.connect(g).connect(space.input);
  osc.start(now);
  osc.stop(now + length + 0.02);
}

/** Call only during active gameplay. Loading and transitions never change the simulation. */
export function updateMusic(area, elapsed, { boosted = false, shielded = false } = {}) {
  if (muted) return;
  space?.setShield(shielded);
  music?.update(area, elapsed, { boosted });
}

export function stopMusic() {
  music?.stop();
  space?.setShield(false, true);
}
