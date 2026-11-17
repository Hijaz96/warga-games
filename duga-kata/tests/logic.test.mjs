import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreGuess,
  createRound,
  applyGuess,
  keyStates,
  isAllowed,
  dailyAnswer,
  puzzleNumber,
  randomAnswer,
  emojiGrid,
  MAX_GUESSES,
} from '../js/logic.js';
import { mulberry32 } from '../../shared/rng.js';

const C = 'correct';
const P = 'present';
const A = 'absent';

test('all letters right', () => {
  assert.deepEqual(scoreGuess('RUMAH', 'RUMAH'), [C, C, C, C, C]);
});

test('no letters in the word', () => {
  assert.deepEqual(scoreGuess('BUBUR', 'TELAN'), [A, A, A, A, A]);
});

test('right letters in the wrong places', () => {
  assert.deepEqual(scoreGuess('HUJAN', 'HUTAN'), [C, C, A, C, C]);
  assert.deepEqual(scoreGuess('MALAM', 'LAMPU'), [P, C, P, A, A]);
});

test('repeated letters are marked present only for spare copies', () => {
  // KAKAK has K×3, A×2; K and A in the right place first.
  assert.deepEqual(scoreGuess('AKKAA', 'KAKAK'), [P, P, C, C, A]);
  // Two A's guessed, one in the answer and already in place: the other is absent.
  assert.deepEqual(scoreGuess('SABAR', 'TAHUN'), [A, C, A, A, A]);
  assert.deepEqual(scoreGuess('AAAAA', 'BADAN'), [A, C, A, C, A]);
  // Two L's guessed, one in the answer: the one in place is correct, the other absent.
  assert.deepEqual(scoreGuess('LALAT', 'TELUK'), [A, A, C, A, P]);
  // Two A's guessed, one in the answer elsewhere: only the first is present.
  assert.deepEqual(scoreGuess('ABANG', 'TELAN'), [P, A, A, P, A]);
});

test('lower-case guesses are marked the same', () => {
  assert.deepEqual(scoreGuess('rumah', 'RUMAH'), [C, C, C, C, C]);
});

test('a round is won on the right word', () => {
  let s = createRound('RUMAH');
  s = applyGuess(s, 'HUTAN');
  assert.equal(s.status, 'playing');
  s = applyGuess(s, 'rumah');
  assert.equal(s.status, 'won');
  assert.deepEqual(s.guesses, ['HUTAN', 'RUMAH']);
  assert.equal(s.marks.length, 2);
  assert.throws(() => applyGuess(s, 'MAKAN'));
});

test('a round is lost after six wrong guesses', () => {
  let s = createRound('RUMAH');
  for (let i = 0; i < MAX_GUESSES; i++) {
    assert.equal(s.status, 'playing');
    s = applyGuess(s, 'MAKAN');
  }
  assert.equal(s.status, 'lost');
});

test('a correct last guess wins rather than loses', () => {
  let s = createRound('RUMAH');
  for (let i = 0; i < MAX_GUESSES - 1; i++) s = applyGuess(s, 'MAKAN');
  s = applyGuess(s, 'RUMAH');
  assert.equal(s.status, 'won');
});

test('applyGuess leaves the old state as it was', () => {
  const s = createRound('RUMAH');
  applyGuess(s, 'MAKAN');
  assert.deepEqual(s.guesses, []);
});

test('keyboard keys keep their best mark', () => {
  let s = createRound('RUMAH');
  s = applyGuess(s, 'MAKAN'); // M present, first A absent, K absent, second A correct, N absent
  s = applyGuess(s, 'MAMPU'); // first M absent, A present, second M correct, U present
  const k = keyStates(s);
  assert.equal(k.M, C);
  assert.equal(k.A, C, 'A was correct in MAKAN; present in MAMPU does not downgrade it');
  assert.equal(k.K, A);
  assert.equal(k.U, P);
  assert.equal(k.Z, undefined);
  // A later "absent" for a letter already found doesn't downgrade it.
  s = applyGuess(s, 'MASAM');
  assert.equal(keyStates(s).M, C);
});

test('only listed words are allowed', () => {
  assert.equal(isAllowed('RUMAH'), true);
  assert.equal(isAllowed('rumah'), true);
  assert.equal(isAllowed('TIDAK'), true); // a guess-only word
  assert.equal(isAllowed('AAAAA'), false);
  assert.equal(isAllowed('RUMA'), false);
});

test('the daily word is the same all day and changes the next day', () => {
  assert.equal(dailyAnswer('2026-11-18'), dailyAnswer('2026-11-18'));
  const days = Array.from({ length: 30 }, (_, i) => dailyAnswer(`2026-12-${String(i + 1).padStart(2, '0')}`));
  assert.equal(new Set(days).size, days.length, 'no repeats within a month');
});

test('the daily order uses every answer once before repeating', () => {
  const answers = ['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE'];
  const seen = new Set();
  for (let d = 1; d <= answers.length; d++) seen.add(dailyAnswer(`2027-01-0${d}`, answers));
  assert.equal(seen.size, answers.length);
});

test('puzzle numbers count from launch day', () => {
  assert.equal(puzzleNumber('2026-11-17'), 1);
  assert.equal(puzzleNumber('2026-12-17'), 31);
});

test('random answers avoid the word just played', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 50; i++) assert.notEqual(randomAnswer(rng, 'BBBBB', ['AAAAA', 'BBBBB']), 'BBBBB');
});

test('emoji grid has one row per guess', () => {
  let s = createRound('RUMAH');
  s = applyGuess(s, 'HUTAN');
  s = applyGuess(s, 'RUMAH');
  assert.equal(emojiGrid(s), '🟨🟩⬜🟩⬜\n🟩🟩🟩🟩🟩');
});
