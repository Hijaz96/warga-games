// One shared, short room reverb for music and effects while the shield surrounds the runner.
export function createSoundSpace(context) {
  const input = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const dry = context.createGain();
  const room = context.createConvolver();
  const wet = context.createGain();
  const length = Math.ceil(context.sampleRate * 0.65);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  let seed = 3729;
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const time = i / context.sampleRate;
      data[i] = (seed / 4294967296 * 2 - 1) * Math.exp(-time * 8) * 0.12 * Math.min(1, time / 0.012);
    }
    for (const [time, level] of [[0.026, 0.65], [0.049, 0.45], [0.081, 0.3], [0.123, 0.18]]) {
      data[Math.min(length - 1, Math.round((time + channel * 0.003) * context.sampleRate))] += level;
    }
  }
  room.buffer = impulse;
  input.connect(filter);
  filter.connect(dry).connect(context.destination);
  // The convolver only receives input while shielded, so it costs nothing the rest of the time.
  room.connect(wet).connect(context.destination);
  let shielded = null;
  let roomLive = false;
  let roomTimer = null;

  function routeRoom(enabled, immediate) {
    clearTimeout(roomTimer);
    roomTimer = null;
    if (enabled) {
      if (!roomLive) filter.connect(room);
      roomLive = true;
      return;
    }
    if (!roomLive) return;
    const detach = () => { roomTimer = null; roomLive = false; filter.disconnect(room); };
    // Let the wet gain fade and the 0.65 s tail ring out before detaching.
    if (immediate) detach();
    else roomTimer = setTimeout(detach, 1200);
  }

  function setShield(active, immediate = false) {
    const enabled = !!active;
    if (enabled === shielded && !immediate) return;
    shielded = enabled;
    const now = context.currentTime;
    for (const [param, value] of [
      [filter.frequency, enabled ? 1400 : Math.min(18000, context.sampleRate * 0.45)],
      [dry.gain, enabled ? 0.55 : 1],
      [wet.gain, enabled ? 0.22 : 0],
    ]) {
      param.cancelScheduledValues(now);
      if (immediate) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, 0.1);
    }
    routeRoom(enabled, immediate);
  }

  setShield(false, true);
  return { input, setShield };
}
