// Duga Kata rules: marking a guess, a round's state, the keyboard colours and the daily word.
// Pure functions, no DOM.
import { ANSWERS, GUESSES } from './words.js';
import { shuffle, mulberry32, dayNumber } from '../../shared/rng.js';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** Salt for the daily order; a different number gives a different order of words. */
const DAILY_SALT = 0xd09a4a7a;
/** The first day of Duga Kata: puzzle #1. Set it to the real launch day before going live. */
export const LAUNCH_DATE = '2026-11-17';

const ALLOWED = new Set([...ANSWERS, ...GUESSES]);

/** Whether `word` is in either word list (any case). */
export const isAllowed = (word) => ALLOWED.has(String(word).toUpperCase());

/**
 * Marks each letter of `guess` against `answer`: 'correct' (right place), 'present' (in the
 * word, elsewhere) or 'absent'. A letter guessed more often than the answer has it is marked
 * present only as many times as the answer has spare copies, right places first: answer KAKAK,
 * guess AKKAA gives present, present, correct, correct, absent.
 */
export function scoreGuess(guess, answer) {
  const g = guess.toUpperCase();
  const a = answer.toUpperCase();
  const marks = Array(a.length).fill('absent');
  const spare = {};
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) marks[i] = 'correct';
    else spare[a[i]] = (spare[a[i]] ?? 0) + 1;
  }
  for (let i = 0; i < a.length; i++) {
    if (marks[i] === 'correct') continue;
    if (spare[g[i]] > 0) {
      marks[i] = 'present';
      spare[g[i]] -= 1;
    }
  }
  return marks;
}

export function createRound(answer) {
  return { answer: answer.toUpperCase(), guesses: [], marks: [], status: 'playing' };
}

/** The round after `guess` (a new object; `state` is left as it is). */
export function applyGuess(state, guess) {
  if (state.status !== 'playing') throw new Error('Pusingan sudah tamat.');
  const g = guess.toUpperCase();
  const marks = scoreGuess(g, state.answer);
  const guesses = [...state.guesses, g];
  const status = g === state.answer ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing';
  return { ...state, guesses, marks: [...state.marks, marks], status };
}

const RANK = { absent: 1, present: 2, correct: 3 };

/** Each letter guessed so far with its best mark (correct over present over absent). */
export function keyStates(state) {
  const keys = {};
  state.guesses.forEach((g, row) => {
    [...g].forEach((ch, i) => {
      const m = state.marks[row][i];
      if (!keys[ch] || RANK[m] > RANK[keys[ch]]) keys[ch] = m;
    });
  });
  return keys;
}

/**
 * The answer for a day (YYYY-MM-DD, Malaysia). A fixed shuffle of ANSWERS is walked one word a
 * day, so no word repeats until the whole list has been used.
 */
export function dailyAnswer(dateKey, answers = ANSWERS) {
  const order = shuffle(
    answers.map((_, i) => i),
    mulberry32(DAILY_SALT),
  );
  const n = answers.length;
  return answers[order[((dayNumber(dateKey) % n) + n) % n]];
}

/** The puzzle number shown when sharing: #1 on LAUNCH_DATE. */
export const puzzleNumber = (dateKey) => dayNumber(dateKey) - dayNumber(LAUNCH_DATE) + 1;

/** A random answer for Main Bebas, never `avoid` (the word just played). */
export function randomAnswer(rng, avoid = null, answers = ANSWERS) {
  for (;;) {
    const w = answers[Math.floor(rng() * answers.length)];
    if (w !== avoid || answers.length < 2) return w;
  }
}

const EMOJI = { correct: '🟩', present: '🟨', absent: '⬜' };

/** The round as emoji rows, one per guess, for sharing (no letters). */
export const emojiGrid = (state) => state.marks.map((row) => row.map((m) => EMOJI[m]).join('')).join('\n');
