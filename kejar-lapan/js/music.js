// Stream rendered scores rather than synthesising music on the animation thread.
export const MUSIC_SECONDS = 90;
export const BOOST_MUSIC_RATE = 1.35;
export const MUSIC_TRACKS = Object.fromEntries([
  'civic', 'college', 'library', 'mosque', 'sports', 'health', 'engineering', 'faculty', 'plaza',
].map(id => [id, new URL(`../audio/music/${id}.mp3?v=2`, import.meta.url).href]));

export function createMusicPlayer(context, {
  createAudio = url => new Audio(url),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = id => clearTimeout(id),
  destination = context.destination,
} = {}) {
  const entries = new Map();
  let current = null;
  let pending = null;
  let generation = 0;
  let retryAt = 0;
  let playbackRate = 1;

  function setRate(boosted) {
    const rate = boosted ? BOOST_MUSIC_RATE : 1;
    if (rate === playbackRate) return;
    playbackRate = rate;
    for (const entry of entries.values()) entry.media.playbackRate = rate;
  }

  function silence(entry) {
    if (entry.timer != null) cancel(entry.timer);
    entry.timer = null;
    entry.media.onloadedmetadata = null;
    entry.media.pause();
    entry.gain.gain.cancelScheduledValues(context.currentTime);
    entry.gain.gain.setValueAtTime(0, context.currentTime);
  }

  function prune() {
    for (const [id, entry] of entries) {
      if (entries.size <= 2) break;
      if (entry === current || entry === pending?.entry || entry.timer != null) continue;
      silence(entry);
      entry.media.removeAttribute('src');
      entry.media.load();
      entry.source.disconnect();
      entry.gain.disconnect();
      entries.delete(id);
    }
  }

  function stop() {
    setRate(false);
    generation++;
    pending = null;
    current = null;
    retryAt = 0;
    for (const entry of entries.values()) silence(entry);
    prune();
  }

  function update(id, elapsed = 0, { boosted = false } = {}) {
    setRate(boosted);
    if (!MUSIC_TRACKS[id]) return stop();
    // The first play call stays inside the start/resume gesture while AudioContext.resume settles.
    if (context.state === 'closed') return;
    if ((current?.id === id && !pending) || pending?.entry.id === id) return;
    if (context.currentTime < retryAt) return;
    const serial = ++generation;
    if (pending) silence(pending.entry);
    if (current?.id === id) { pending = null; return; }
    let next = entries.get(id);
    if (!next) {
      const media = createAudio(MUSIC_TRACKS[id]);
      media.preload = 'auto';
      media.loop = true;
      media.preservesPitch = true;
      media.webkitPreservesPitch = true;
      media.playbackRate = playbackRate;
      const source = context.createMediaElementSource(media);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      source.connect(gain).connect(destination);
      next = { id, media, source, gain, timer: null };
      entries.set(id, next);
    }
    silence(next);
    // Keep each score at its own native tempo; never stretch it to match the previous area.
    const offset = ((elapsed % MUSIC_SECONDS) + MUSIC_SECONDS) % MUSIC_SECONDS;
    const seek = () => {
      try { next.media.currentTime = offset; } catch { /* metadata may still be loading */ }
    };
    seek();
    next.media.onloadedmetadata = () => { if (serial === generation) seek(); };
    pending = { entry: next, serial };
    // Keep the old music audible until the new stream is actually playing.
    let playback;
    try { playback = next.media.play(); } catch (error) { playback = Promise.reject(error); }
    Promise.resolve(playback).then(() => {
      if (serial !== generation) {
        if (next !== current && next !== pending?.entry) silence(next);
        return;
      }
      const previous = current;
      current = next;
      pending = null;
      const now = context.currentTime;
      next.gain.gain.setValueAtTime(0, now);
      next.gain.gain.linearRampToValueAtTime(0.5, now + 0.7);
      if (previous && previous !== next) {
        previous.gain.gain.cancelScheduledValues(now);
        previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
        previous.gain.gain.linearRampToValueAtTime(0, now + 0.7);
        previous.timer = schedule(() => { silence(previous); prune(); }, 750);
      }
      prune();
    }).catch(() => {
      if (serial !== generation) return;
      silence(next);
      pending = null;
      retryAt = context.currentTime + 2;
      prune();
    });
  }

  return { update, stop };
}
