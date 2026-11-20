import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createMusicPlayer, MUSIC_TRACKS, MUSIC_SECONDS, BOOST_MUSIC_RATE } from '../js/music.js';
import { CAMPUS_AREAS } from '../js/campus.js';
import { unlockAudio, setMuted, updateMusic, stopMusic } from '../js/audio.js';

const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function fixture() {
  const media = [];
  const timers = new Map();
  const nodes = [];
  const playbacks = [];
  const filters = [];
  const convolvers = [];
  const gains = [];
  const node = () => ({ connect(other) { return other; }, disconnect() { this.disconnected = true; } });
  const context = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: {},
    createMediaElementSource: () => { const source = node(); nodes.push(source); return source; },
    createGain: () => { const gain = { ...node(), gain: {
      value: 0, setValueAtTime(value) { this.value = value; },
      setTargetAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; }, cancelScheduledValues() {},
    } }; gains.push(gain); return gain; },
    createBiquadFilter: () => {
      const filter = { ...node(), Q: { value: 0 }, frequency: {
        value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, setTargetAtTime(value) { this.value = value; },
      } };
      filters.push(filter); return filter;
    },
    createConvolver: () => { const room = node(); convolvers.push(room); return room; },
    createBuffer: (channels, length, sampleRate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, duration: length / sampleRate, getChannelData: channel => data[channel] };
    },
  };
  const createAudio = url => {
    const audio = {
      src: url, paused: true, currentTime: 0, calls: 0, playback: playbacks.shift(),
      play() { this.calls++; this.paused = false; return this.playback ?? Promise.resolve(); },
      pause() { this.paused = true; },
      removeAttribute() { this.src = ''; }, load() {},
    };
    media.push(audio);
    return audio;
  };
  const player = createMusicPlayer(context, {
    createAudio,
    schedule(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    cancel(id) { timers.delete(id); },
  });
  const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); };
  return { player, context, media, timers, flush, nodes, createAudio, playbacks, filters, convolvers, gains };
}

test('all nine scenery types have distinct rendered music assets and 90-second scores', () => {
  const catalog = JSON.parse(readFileSync(new URL('../audio/music/catalog.json', import.meta.url)));
  assert.deepEqual(Object.keys(MUSIC_TRACKS).sort(), Object.keys(CAMPUS_AREAS).sort());
  assert.equal(catalog.length, 9);
  const hashes = new Set();
  const tempos = new Map();
  for (const track of catalog) {
    assert.equal(track.seconds, MUSIC_SECONDS);
    assert.ok(Number.isFinite(track.bpm) && track.bpm > 0);
    assert.ok(Math.abs(track.bars * Number.parseInt(track.meter) * 60 / track.bpm - MUSIC_SECONDS) < 1e-9,
      'each loop contains whole musical bars');
    tempos.set(track.id, track.bpm);
    assert.ok(track.title && track.style);
    const url = new URL(MUSIC_TRACKS[track.id]);
    assert.ok(statSync(url).size > 100000);
    hashes.add(createHash('sha256').update(readFileSync(url)).digest('hex'));
  }
  assert.equal(hashes.size, 9);
  assert.equal(new Set(tempos.values()).size, 9, 'every scenery has a different tempo');
  assert.ok(tempos.get('sports') >= 150);
  assert.ok(tempos.get('mosque') <= 70);
  assert.ok(tempos.get('library') <= 85);
  assert.equal(catalog.find(track => track.id === 'mosque').groove, 'free');
  assert.equal(catalog.find(track => track.id === 'plaza').meter, '3/4');
});

test('music follows gameplay time and stops old streams after crossfade', async () => {
  const { player, media, flush } = fixture();
  player.update('library', 101.25);
  await settle();
  assert.equal(media[0].loop, true);
  assert.equal(media[0].currentTime, 11.25);
  for (let i = 0; i < 120; i++) player.update('library', 102);
  assert.equal(media[0].calls, 1, 'frames do not restart the song');
  player.update('engineering', 103);
  assert.equal(media[0].paused, false, 'old song continues while the next one loads');
  await settle();
  assert.equal(media[1].currentTime, 13);
  flush();
  assert.equal(media[0].paused, true);
  assert.equal(media[1].paused, false);
  player.stop();
  assert.ok(media.every(audio => audio.paused));
  player.update('engineering', 104);
  await settle();
  assert.equal(media[1].currentTime, 14, 'resume follows gameplay time');
  player.stop();
});

test('pausing during loading cannot start music later; rapid switches clean up stale streams', async () => {
  const { player, media, flush, nodes } = fixture();
  player.update('civic', 0);
  player.stop();
  await settle();
  assert.ok(media.every(audio => audio.paused));
  player.update('college', 20);
  player.update('sports', 21);
  await settle();
  flush();
  assert.equal(media.filter(audio => !audio.paused).length, 1);
  assert.ok(new URL(media.find(audio => !audio.paused).src).pathname.endsWith('sports.mp3'));
  for (const id of Object.keys(MUSIC_TRACKS)) {
    player.update(id, 45);
    await settle();
    flush();
  }
  assert.ok(media.filter(audio => audio.src).length <= 2, 'only two media streams stay cached');
  assert.ok(nodes.filter(source => !source.disconnected).length <= 2);
  player.stop();
});

test('failed playback keeps the previous song and retries without flooding requests', async () => {
  const { player, media, context, playbacks } = fixture();
  player.update('civic', 0);
  await settle();
  playbacks.push(Promise.reject(new Error('NotAllowedError')));
  player.update('library', 2);
  await settle();
  assert.equal(media[1].paused, true);
  assert.equal(media[0].paused, false, 'a failed load does not interrupt the previous song');
  const attempts = media[1].calls;
  for (let i = 0; i < 100; i++) player.update('library', 3);
  assert.equal(media[1].calls, attempts);
  media[1].playback = Promise.resolve();
  context.currentTime = 3;
  player.update('library', 4);
  await settle();
  assert.equal(media[1].paused, false);
  player.stop();
});

test('boost speeds up the playing song and incoming scenery without restarting either track', async () => {
  const { player, media, flush } = fixture();
  player.update('college', 12);
  await settle();
  player.update('college', 13, { boosted: true });
  assert.equal(media[0].playbackRate, BOOST_MUSIC_RATE);
  assert.equal(media[0].preservesPitch, true);
  assert.equal(media[0].calls, 1);
  assert.equal(media[0].currentTime, 12);
  player.update('sports', 14, { boosted: true });
  await settle();
  assert.ok(media.every(audio => audio.playbackRate === BOOST_MUSIC_RATE));
  player.update('sports', 15, { boosted: false });
  assert.ok(media.every(audio => audio.playbackRate === 1));
  assert.equal(media[1].calls, 1);
  flush();
  player.update('sports', 16, { boosted: true });
  player.stop();
  assert.ok(media.every(audio => audio.paused && audio.playbackRate === 1));
});

test('the sound toggle stops music and prevents playback until unmuted', async () => {
  const { context, media, createAudio, filters, convolvers, gains } = fixture();
  const originalWindow = globalThis.window;
  const originalAudio = globalThis.Audio;
  globalThis.window = { AudioContext: function () { return context; } };
  globalThis.Audio = function (url) { return createAudio(url); };
  try {
    unlockAudio();
    updateMusic('civic', 0);
    await settle();
    assert.equal(media[0].paused, false);
    const normalCutoff = filters[0].frequency.value;
    assert.equal(convolvers.length, 1);
    assert.equal(convolvers[0].buffer.numberOfChannels, 2);
    assert.ok(convolvers[0].buffer.duration < 1, 'shield uses a short enclosed room');
    assert.ok(convolvers[0].buffer.getChannelData(0).every(Number.isFinite));
    updateMusic('civic', 1, { boosted: true, shielded: true });
    assert.equal(media[0].playbackRate, BOOST_MUSIC_RATE, 'both power-ups work together');
    assert.ok(filters[0].frequency.value < normalCutoff, 'shield softens the high frequencies');
    assert.ok(gains[2].gain.value > 0, 'shield adds the reverberant signal');
    updateMusic('civic', 2, { boosted: true, shielded: false });
    assert.equal(gains[2].gain.value, 0, 'shield removal restores dry audio');
    assert.equal(filters[0].frequency.value, normalCutoff);
    assert.equal(media[0].playbackRate, BOOST_MUSIC_RATE, 'removing shield keeps the boost');
    updateMusic('civic', 3, { boosted: true, shielded: true });
    setMuted(true);
    assert.ok(media.every(audio => audio.paused));
    assert.equal(gains[2].gain.value, 0, 'mute also silences any room tail');
    assert.equal(media[0].playbackRate, 1);
    updateMusic('sports', 10);
    assert.equal(media.length, 1);
    setMuted(false);
    updateMusic('sports', 10);
    await settle();
    assert.equal(media[1].paused, false);
    stopMusic();
    assert.ok(media.every(audio => audio.paused));
  } finally {
    globalThis.window = originalWindow;
    globalThis.Audio = originalAudio;
  }
});
