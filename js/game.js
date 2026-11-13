// Cryptogram engine. Pure state + functions, no DOM, so it can be unit-tested with node --test.
import { shuffle, mulberry32, dayNumber } from './rng.js';

export const MAX_MISTAKES = 3;
/** Share of letter cells that start revealed (upper bound). The rest are blanks. */
export const REVEAL_RATIO = 0.3;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DAILY_SALT = 0x5eed1956;

export const isLetter = (ch) => ch >= 'A' && ch <= 'Z';
export const isBlank = (cell) => cell.letter && !cell.shown;

export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Picks which letters start revealed. Adds random letters while the revealed
 * cell count stays within `ratio` of all letter cells, so most cells stay blank.
 */
function chooseRevealed(chars, rng, ratio) {
  const counts = new Map();
  for (const ch of chars) if (isLetter(ch)) counts.set(ch, (counts.get(ch) || 0) + 1);
  const revealed = new Set();
  if (counts.size < 3) return revealed;

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const budget = Math.floor(total * ratio);
  let used = 0;
  for (const letter of shuffle([...counts.keys()], rng)) {
    const n = counts.get(letter);
    if (used + n <= budget) {
      revealed.add(letter);
      used += n;
    }
  }
  if (revealed.size === 0) {
    // Always give the player a foothold: reveal the rarest letter.
    const [rarest] = [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    revealed.add(rarest);
  }
  return revealed;
}

/**
 * Builds a puzzle. Every letter A–Z gets a unique number 1–26; the same letter
 * always shows the same number. Non-letters (spaces, digits, punctuation) are shown as-is.
 */
export function createPuzzle(text, rng, { revealRatio = REVEAL_RATIO } = {}) {
  const chars = [...normalize(text)];
  const numbers = shuffle(
    Array.from({ length: 26 }, (_, i) => i + 1),
    rng,
  );
  const cipher = {};
  [...ALPHABET].forEach((l, i) => {
    cipher[l] = numbers[i];
  });
  const revealed = chooseRevealed(chars, rng, revealRatio);

  const cells = chars.map((ch) =>
    isLetter(ch)
      ? { ch, letter: true, num: cipher[ch], given: revealed.has(ch), shown: revealed.has(ch) }
      : { ch, letter: false },
  );

  const words = [];
  let current = [];
  cells.forEach((c, i) => {
    if (c.ch === ' ') {
      if (current.length) words.push(current);
      current = [];
    } else {
      current.push(i);
    }
  });
  if (current.length) words.push(current);

  const state = {
    text: chars.join(''),
    cells,
    words,
    letters: [...new Set(chars.filter(isLetter))],
    cipher,
    mistakes: 0,
    hiddenCount: cells.filter(isBlank).length,
    status: 'playing',
    cursor: -1,
  };
  state.cursor = nextBlank(state, -1);
  return state;
}

/** True when the letter appears in the phrase and every occurrence is shown. */
export function letterDone(state, letter) {
  let present = false;
  for (const c of state.cells) {
    if (c.letter && c.ch === letter) {
      present = true;
      if (!c.shown) return false;
    }
  }
  return present;
}

export const isSolved = (state) => !state.cells.some(isBlank);

/** Index of the next blank after `from`, wrapping around; -1 when none are left. */
export function nextBlank(state, from) {
  const n = state.cells.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (isBlank(state.cells[i])) return i;
  }
  return -1;
}

/** Index of the previous blank before `from`, wrapping around; -1 when none are left. */
export function prevBlank(state, from) {
  const n = state.cells.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from - k) % n) + n) % n;
    if (isBlank(state.cells[i])) return i;
  }
  return -1;
}

/**
 * Applies a guess to the blank at `idx`. Mutates `state`.
 * Returns { result: 'correct' | 'wrong' | 'ignored', completed?: boolean }.
 */
export function guess(state, idx, letter) {
  if (state.status !== 'playing') return { result: 'ignored' };
  const cell = state.cells[idx];
  if (!cell || !isBlank(cell)) return { result: 'ignored' };
  const L = String(letter).toUpperCase();
  if (!isLetter(L) || L.length !== 1) return { result: 'ignored' };
  // A letter whose every occurrence is already solved can't be the answer; its key is disabled.
  if (letterDone(state, L)) return { result: 'ignored' };

  if (cell.ch !== L) {
    state.mistakes += 1;
    if (state.mistakes >= MAX_MISTAKES) state.status = 'lost';
    return { result: 'wrong' };
  }

  cell.shown = true;
  const completed = letterDone(state, L);
  if (isSolved(state)) {
    state.status = 'won';
    state.cursor = -1;
  } else {
    state.cursor = nextBlank(state, idx);
  }
  return { result: 'correct', completed };
}

/** Moves the cursor to the next (dir = 1) or previous (dir = -1) blank. */
export function moveCursor(state, dir) {
  if (state.status !== 'playing') return state.cursor;
  state.cursor = dir < 0 ? prevBlank(state, state.cursor) : nextBlank(state, state.cursor);
  return state.cursor;
}

export function selectCell(state, idx) {
  if (state.status !== 'playing' || !state.cells[idx] || !isBlank(state.cells[idx])) return false;
  state.cursor = idx;
  return true;
}

/** Indices the player has filled (not the ones revealed at the start). */
export function filledIndices(state) {
  const out = [];
  state.cells.forEach((c, i) => {
    if (c.letter && c.shown && !c.given) out.push(i);
  });
  return out;
}

/** Restores saved progress onto a freshly created (identically seeded) puzzle. */
export function applyProgress(state, filled = [], mistakes = 0) {
  for (const i of filled) {
    const c = state.cells[i];
    if (c?.letter) c.shown = true;
  }
  state.mistakes = Math.min(Math.max(0, mistakes | 0), MAX_MISTAKES);
  if (state.mistakes >= MAX_MISTAKES) state.status = 'lost';
  else if (isSolved(state)) state.status = 'won';
  state.cursor = state.status === 'playing' ? nextBlank(state, -1) : -1;
  return state;
}

/**
 * Index into the phrase list for a given day. A fixed shuffle of the list is walked
 * one step per day, so phrases don't repeat until the whole list has been used.
 */
export function dailyIndex(dateKey, count) {
  const order = shuffle(
    Array.from({ length: count }, (_, i) => i),
    mulberry32(DAILY_SALT),
  );
  return order[((dayNumber(dateKey) % count) + count) % count];
}
