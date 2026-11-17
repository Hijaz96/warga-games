import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, recordRound, topCampuses, topPlayers } from '../shared/leaderboard.js';
import { SUPABASE_URL } from '../shared/config.js';

function fakeFetch(reply = []) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ name: url.split('/rpc/')[1], body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, json: async () => reply };
  };
  f.calls = calls;
  return f;
}

const profile = { playerId: '11111111-1111-4111-8111-111111111111', nickname: 'Siti', userType: 'pelajar', campus: 'UiTM Arau' };

test('recordRound sends the round with the profile', async () => {
  const f = fakeFetch(null);
  await recordRound({ game: 'ular', profile, points: 150, seconds: 42 }, f);
  assert.equal(f.calls[0].name, 'arked_record');
  assert.deepEqual(f.calls[0].body, {
    p_player_id: profile.playerId, p_game: 'ular', p_points: 150, p_seconds: 42,
    p_nickname: 'Siti', p_user_type: 'pelajar', p_campus: 'UiTM Arau',
    p_daily: false, p_play_date: null,
  });
  await recordRound({ game: 'teka-kata', profile, points: 820, seconds: 95, daily: true, date: '2026-11-17' }, f);
  assert.equal(f.calls[1].body.p_daily, true);
  assert.equal(f.calls[1].body.p_play_date, '2026-11-17');
  assert.ok(f.calls[0].headers.apikey.startsWith('sb_publishable_'));
  assert.ok(SUPABASE_URL.startsWith('https://'));
});

test('boards: one day, all time, campuses', async () => {
  const f = fakeFetch([]);
  await topPlayers('ular', 'p1', '2026-11-17', f);
  await topPlayers('ular', null, null, f);
  await topCampuses('ular', f);
  assert.deepEqual(f.calls.map((c) => c.name), ['arked_top', 'arked_top', 'arked_campus_rank']);
  assert.deepEqual(f.calls[0].body, { p_game: 'ular', p_player_id: 'p1', p_play_date: '2026-11-17', p_limit: 50 });
  assert.deepEqual(f.calls[1].body, { p_game: 'ular', p_player_id: null, p_play_date: null, p_limit: 50 });
  assert.deepEqual(f.calls[2].body, { p_game: 'ular', p_limit: 50 });
});

test('server errors carry the message', async () => {
  const f = async () => ({ ok: false, status: 400, json: async () => ({ message: 'Markah tidak munasabah', code: '22023' }) });
  await assert.rejects(recordRound({ game: 'ular', profile, points: 1, seconds: 1 }, f), /munasabah/);
  await assert.rejects(topCampuses('ular', async () => { throw new TypeError('offline'); }), /Tiada sambungan/);
});

test('formatDuration', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(750), '12m 30s');
  assert.equal(formatDuration(3 * 3600 + 300), '3j 05m');
});
