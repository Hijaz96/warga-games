// Renders the puzzle and the on-screen keyboard, and turns taps into handler calls.
import { letterDone } from './game.js';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '<ZXCVBNM>'];
const ARROW_LEFT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14M20 12H8m5-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_RIGHT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5v14M4 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cells per line at the fixed cell size: --cw in css/style.css is sized so 11 cells and their
 * 2px gaps exactly fill the board's width on every screen.
 */
export const LINE_CELLS = 11;

/**
 * Splits a word (cell indices) into pieces that each fit on one line, so cells can keep one
 * fixed size. Breaks after a hyphen first (UNDANG- | UNDANG); a piece still too long is cut
 * into even parts, each but the last flagged `cont` to show a continuation hyphen.
 * Short words come back as a single piece.
 */
export function wordChunks(cells, word) {
  const parts = [];
  let current = [];
  for (const i of word) {
    current.push(i);
    if (cells[i].ch === '-') {
      parts.push(current);
      current = [];
    }
  }
  if (current.length) parts.push(current);

  const out = [];
  for (const part of parts) {
    if (part.length <= LINE_CELLS) {
      out.push({ idxs: part, cont: false });
      continue;
    }
    // Leave room for the continuation hyphen on every piece but the last.
    const pieces = Math.ceil(part.length / (LINE_CELLS - 1));
    const size = Math.ceil(part.length / pieces);
    for (let s = 0; s < part.length; s += size) {
      out.push({ idxs: part.slice(s, s + size), cont: s + size < part.length });
    }
  }
  return out;
}

export class BoardView {
  /** handlers: { onLetter(letter), onMove(dir), onSelect(idx) } */
  constructor(boardEl, keyboardEl, handlers) {
    this.boardEl = boardEl;
    this.kbEl = keyboardEl;
    this.h = handlers;
    this.cells = []; // idx -> { root, ch }
    this.keys = new Map(); // letter -> button
    this.flashing = new Set();
    this.buildKeyboard();

    boardEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-idx]');
      if (b) this.h.onSelect(Number(b.dataset.idx));
    });
  }

  buildKeyboard() {
    for (const row of ROWS) {
      const r = el('div', 'kb-row');
      for (const k of row) {
        const btn = el('button', 'key');
        btn.type = 'button';
        if (k === '<' || k === '>') {
          btn.classList.add('key-nav');
          btn.dataset.nav = k === '<' ? '-1' : '1';
          btn.setAttribute('aria-label', k === '<' ? 'Petak kosong sebelumnya' : 'Petak kosong seterusnya');
          btn.innerHTML = k === '<' ? ARROW_LEFT : ARROW_RIGHT;
        } else {
          btn.dataset.key = k;
          btn.textContent = k;
          this.keys.set(k, btn);
        }
        r.append(btn);
      }
      this.kbEl.append(r);
    }
    this.kbEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.nav) this.h.onMove(Number(b.dataset.nav));
      else if (b.dataset.key) this.h.onLetter(b.dataset.key);
    });
  }

  mount(state) {
    this.state = state;
    this.flashing.clear();
    this.boardEl.classList.remove('win', 'lose');
    this.boardEl.replaceChildren();
    this.cells = [];
    let order = 0;
    // Cells have one fixed size. A word wraps between its pieces only when it can't fit on a
    // line (see wordChunks); the puzzle area scrolls when a phrase needs many lines.
    for (const word of state.words) {
      const w = el('div', 'word');
      for (const chunk of wordChunks(state.cells, word)) {
        const piece = el('div', 'chunk');
        for (const idx of chunk.idxs) {
          const c = state.cells[idx];
          let root;
          if (c.letter) {
            root = el('button', 'cell');
            root.type = 'button';
            root.dataset.idx = String(idx);
            const ch = el('span', 'ch');
            root.append(ch, el('span', 'num', String(c.num)));
            this.cells[idx] = { root, ch };
          } else {
            const punct = !/[0-9]/.test(c.ch);
            root = el('span', `cell static${punct ? ' punct' : ''}`);
            root.setAttribute('aria-hidden', 'true');
            root.append(el('span', 'ch', c.ch), el('span', 'num', ''));
          }
          root.style.setProperty('--i', String(order++));
          piece.append(root);
        }
        if (chunk.cont) {
          // The word carries on on the next line.
          const dash = el('span', 'cell static punct cont');
          dash.setAttribute('aria-hidden', 'true');
          dash.append(el('span', 'ch', '-'), el('span', 'num', ''));
          piece.append(dash);
        }
        w.append(piece);
      }
      this.boardEl.append(w);
    }
    this.update();
  }

  update() {
    const s = this.state;
    if (!s) return;
    const sel = s.cursor;
    const selNum = sel >= 0 ? s.cells[sel].num : null;
    const done = new Set(s.letters.filter((L) => letterDone(s, L)));

    s.cells.forEach((c, i) => {
      if (!c.letter) return;
      const { root, ch } = this.cells[i];
      root.classList.toggle('blank', !c.shown);
      root.classList.toggle('given', c.given);
      root.classList.toggle('filled', c.shown && !c.given);
      root.classList.toggle('selected', i === sel);
      root.classList.toggle('same', i !== sel && !c.shown && c.num === selNum);
      root.classList.toggle('done', done.has(c.ch));
      if (!this.flashing.has(i)) ch.textContent = c.shown ? c.ch : '';
      root.setAttribute('aria-label', c.shown ? `Huruf ${c.ch}` : `Petak nombor ${c.num}, kosong`);
      root.setAttribute('aria-current', i === sel ? 'true' : 'false');
      root.tabIndex = c.shown ? -1 : 0;
    });

    for (const [k, btn] of this.keys) {
      const off = done.has(k);
      btn.disabled = off;
      btn.classList.toggle('off', off);
    }

    if (sel >= 0) this.cells[sel].root.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Shows the wrong letter in red with a shake, then clears it. */
  flashWrong(idx, letter) {
    const cell = this.cells[idx];
    if (!cell) return;
    this.flashing.add(idx);
    cell.ch.textContent = letter;
    cell.root.classList.remove('wrong');
    void cell.root.offsetWidth; // restart the animation
    cell.root.classList.add('wrong');
    clearTimeout(cell.timer);
    cell.timer = setTimeout(() => {
      this.flashing.delete(idx);
      cell.root.classList.remove('wrong');
      this.update();
    }, 600);
  }

  pop(idx) {
    this.animate([idx], 'pop');
  }

  glowLetter(letter) {
    const idxs = [];
    this.state.cells.forEach((c, i) => c.letter && c.ch === letter && idxs.push(i));
    this.animate(idxs, 'glow');
  }

  animate(idxs, cls) {
    for (const i of idxs) {
      const root = this.cells[i]?.root;
      if (!root) continue;
      root.classList.remove(cls);
      void root.offsetWidth;
      root.classList.add(cls);
      root.addEventListener('animationend', () => root.classList.remove(cls), { once: true });
    }
  }

  async celebrate() {
    this.boardEl.classList.add('win');
    const n = this.state.cells.length;
    await wait(Math.min(1600, 500 + n * 22));
  }

  /** On a loss, shakes the board without revealing the remaining letters. */
  async fail() {
    this.boardEl.classList.add('lose');
    await wait(900);
  }
}
