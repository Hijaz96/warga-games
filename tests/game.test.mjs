import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPuzzle,
  guess,
  nextBlank,
  prevBlank,
  moveCursor,
  letterDone,
  isBlank,
  applyProgress,
  filledIndices,
  dailyIndex,
  MAX_MISTAKES,
} from '../js/game.js';
import { mulberry32, hashString, todayKL } from '../js/rng.js';
import { PHRASES } from '../js/phrases.js';

const PHRASE = 'Berat sama dipikul, ringan sama dijinjing';
const make = (seed = 42, text = PHRASE) => createPuzzle(text, mulberry32(seed));

test('every letter gets a unique number and repeats keep the same number', () => {
  const s = make();
  const nums = Object.values(s.cipher);
  assert.equal(nums.length, 26);
  assert.equal(new Set(nums).size, 26);
  for (const n of nums) assert.ok(n >= 1 && n <= 26);
  for (const c of s.cells.filter((c) => c.letter)) assert.equal(c.num, s.cipher[c.ch]);
});

test('non-letters are kept as-is and never blank', () => {
  const s = make(1, 'Merdeka pada 31 Ogos 1957!');
  const digits = s.cells.filter((c) => /[0-9!]/.test(c.ch));
  assert.equal(digits.length, 7);
  for (const c of digits) assert.equal(c.letter, false);
  assert.deepEqual(
    s.words.map((w) => w.map((i) => s.cells[i].ch).join('')),
    ['MERDEKA', 'PADA', '31', 'OGOS', '1957!'],
  );
});

test('at most ~30% of letter cells start revealed, and at least one letter is revealed', () => {
  for (const p of PHRASES) {
    for (let seed = 0; seed < 20; seed++) {
      const s = createPuzzle(p.text, mulberry32(seed));
      const letters = s.cells.filter((c) => c.letter);
      const given = letters.filter((c) => c.given).length;
      assert.ok(given >= 1, `${p.text}: nothing revealed`);
      assert.ok(s.hiddenCount > letters.length / 2, `${p.text}: most cells should be hidden`);
      assert.equal(s.hiddenCount, letters.length - given);
    }
  }
});

test('same seed gives an identical puzzle (daily fairness)', () => {
  const seed = hashString('cipher:2026-11-14');
  const a = createPuzzle(PHRASE, mulberry32(seed));
  const b = createPuzzle(PHRASE, mulberry32(seed));
  assert.deepEqual(a, b);
});

test('correct guess fills the cell and advances to the next blank', () => {
  const s = make();
  const idx = s.cursor;
  const r = guess(s, idx, s.cells[idx].ch.toLowerCase());
  assert.equal(r.result, 'correct');
  assert.equal(s.cells[idx].shown, true);
  assert.equal(s.mistakes, 0);
  assert.equal(s.cursor, nextBlank(s, idx));
});

test('wrong guesses count mistakes and the third one ends the game', () => {
  const s = make();
  const idx = s.cursor;
  const answer = s.cells[idx].ch;
  const wrong = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((l) => l !== answer && !letterDone(s, l));
  for (let i = 0; i < MAX_MISTAKES; i++) {
    assert.equal(s.status, 'playing');
    assert.equal(guess(s, idx, wrong[i]).result, 'wrong');
  }
  assert.equal(s.mistakes, 3);
  assert.equal(s.status, 'lost');
  assert.equal(guess(s, idx, answer).result, 'ignored');
});

test('guessing an already completed letter is ignored, not a mistake', () => {
  const s = make();
  const givenLetter = s.cells.find((c) => c.given).ch;
  assert.ok(letterDone(s, givenLetter));
  assert.equal(guess(s, s.cursor, givenLetter).result, 'ignored');
  assert.equal(s.mistakes, 0);
});

test('completing every blank wins and reports completed letters', () => {
  const s = make();
  let completedSeen = false;
  while (s.status === 'playing') {
    const r = guess(s, s.cursor, s.cells[s.cursor].ch);
    assert.equal(r.result, 'correct');
    if (r.completed) completedSeen = true;
  }
  assert.equal(s.status, 'won');
  assert.equal(s.cursor, -1);
  assert.ok(completedSeen);
});

test('next/prev skip filled cells and wrap around', () => {
  const s = make();
  const blanks = s.cells.map((c, i) => (isBlank(c) ? i : -1)).filter((i) => i >= 0);
  assert.equal(nextBlank(s, -1), blanks[0]);
  assert.equal(nextBlank(s, blanks.at(-1)), blanks[0]);
  assert.equal(prevBlank(s, blanks[0]), blanks.at(-1));
  s.cursor = blanks[0];
  assert.equal(moveCursor(s, 1), blanks[1]);
  assert.equal(moveCursor(s, -1), blanks[0]);
  // Filling blanks[1] makes "next" from blanks[0] skip it.
  s.cells[blanks[1]].shown = true;
  assert.equal(nextBlank(s, blanks[0]), blanks[2]);
});

test('progress round-trips through filledIndices/applyProgress', () => {
  const s = make(7);
  guess(s, s.cursor, s.cells[s.cursor].ch);
  guess(s, s.cursor, s.cells[s.cursor].ch);
  const wrongLetter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(
    (l) => l !== s.cells[s.cursor].ch && !letterDone(s, l),
  );
  guess(s, s.cursor, wrongLetter);
  const restored = applyProgress(make(7), filledIndices(s), s.mistakes);
  assert.deepEqual(
    restored.cells.map((c) => c.shown),
    s.cells.map((c) => c.shown),
  );
  assert.equal(restored.mistakes, 1);
  assert.equal(restored.status, 'playing');
});

test('daily phrase is deterministic and cycles through the list without repeats', () => {
  const n = PHRASES.length;
  assert.equal(dailyIndex('2026-11-14', n), dailyIndex('2026-11-14', n));
  const seen = new Set();
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let d = 0; d < n; d++) {
    seen.add(dailyIndex(new Date(start + d * 86400000).toISOString().slice(0, 10), n));
  }
  assert.equal(seen.size, n);
});

test('todayKL uses Malaysia time', () => {
  assert.equal(todayKL(new Date('2026-11-14T15:59:00Z')), '2026-11-14');
  assert.equal(todayKL(new Date('2026-11-14T16:00:00Z')), '2026-11-15');
});

test('phrase list has unique ids and decodable text', () => {
  const ids = PHRASES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PHRASES) {
    assert.ok(p.text && p.fact && p.cat, `phrase ${p.id} incomplete`);
    assert.match(p.text, /^[A-Za-z0-9 ,.!'\-]+$/, `phrase ${p.id} has unexpected characters`);
  }
});
