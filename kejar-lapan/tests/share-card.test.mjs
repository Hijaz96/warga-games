import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultCardContent, avatarCardContent, shareResultImage } from '../js/share-card.js';

const result = { profile: { nickname: 'Aiman' }, role: 'pelajar', plan: { mode: 'daily', day: '2026-11-19', destination: { short: 'DATC' } }, reason: 'arrived', score: 1234, distance: 1900, seconds: 123, checkpoints: 4, timeLeft: 10 };

test('image card includes player identity and the completed run statistics', () => {
  const data = resultCardContent(result);
  assert.equal(data.nickname, 'Aiman');
  assert.equal(data.title, 'SAMPAI TEPAT MASA!');
  assert.equal(data.destination, 'DATC');
  assert.equal(data.distance, '1.90 km');
  assert.equal(data.time, '2:03');
  assert.equal(data.checkpoints, '4');
  assert.match(data.mode, /19-11-2026/);
  assert.equal(resultCardContent({ ...result, reason: 'crash' }).title, 'TERLANGGAR!');
  assert.equal(resultCardContent({ ...result, reason: 'late' }).title, 'DAH PUKUL 8:00!');
});

test('native image sharing sends the PNG without a text payload or a link', async () => {
  const file = new File(['png'], 'result.png', { type: 'image/png' });
  let payload;
  const outcome = await shareResultImage(file, {
    canShare: (data) => { assert.deepEqual(data, { files: [file] }); return true; },
    share: async (data) => { payload = data; },
  }, () => assert.fail('Must not download after a successful share'));
  assert.equal(outcome, 'shared');
  assert.deepEqual(payload, { files: [file], title: 'Kejar Lapan' });
});

test('unsupported or failed native file sharing downloads the PNG', async () => {
  const file = new File(['png'], 'result.png', { type: 'image/png' });
  for (const nav of [{}, { canShare: () => false, share: async () => assert.fail() }, { canShare: () => true, share: async () => { throw new Error('Unavailable'); } }]) {
    let downloaded;
    assert.equal(await shareResultImage(file, nav, (value) => { downloaded = value; }), 'downloaded');
    assert.strictEqual(downloaded, file);
  }
});

test('cancelling image sharing does not trigger a fallback download', async () => {
  const outcome = await shareResultImage({}, { canShare: () => true, share: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); } }, () => assert.fail('Cancelled share must not download'));
  assert.equal(outcome, 'cancelled');
});


test('avatar card uses current identity and personal totals without inventing a run outcome', () => {
  const card = avatarCardContent({ role: 'awam', profile: { nickname: 'Mira' }, stats: { best: 1234, bestDistance: 2600, totalSeconds: 1800, played: 150 } });
  assert.equal(card.nickname, 'Mira');
  assert.equal(card.title, 'GAYA KAMPUS SAYA');
  assert.equal(card.destination, 'Lawatan kampus pukul 8:00');
  assert.deepEqual(card.cells.map(([label]) => label), ['MARKAH TERBAIK', 'JARAK TERJAUH', 'MASA BERMAIN', 'PERMAINAN']);
  assert.equal(card.cells[1][1], '2.60 km');
  assert.equal(card.cells[2][1], '30:00');
  assert.equal(card.cells[3][1], '150');
  assert.equal(avatarCardContent({ role: 'pelajar' }).cells[3][1], '0');
});
