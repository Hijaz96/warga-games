// Rules adapted from UiTM PlayZone's 2048, Block, progressive Memory and XO engines.
export function seededRandom(seed) {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

export function moveBoard(board, direction) {
  const next = Array(16).fill(0);
  let score = 0;
  const index = (line, offset) => direction === 'left' ? line * 4 + offset : direction === 'right' ? line * 4 + 3 - offset : direction === 'up' ? offset * 4 + line : (3 - offset) * 4 + line;
  for (let line = 0; line < 4; line++) {
    const values = Array.from({ length: 4 }, (_, offset) => board[index(line, offset)]).filter(Boolean);
    const merged = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) { const value = values[i] * 2; merged.push(value); score += value; i++; }
      else merged.push(values[i]);
    }
    for (let offset = 0; offset < 4; offset++) next[index(line, offset)] = merged[offset] ?? 0;
  }
  return { board: next, score, changed: next.some((value, i) => value !== board[i]) };
}
export const canMove = (board) => board.some((value, i) => value === 0 || (i % 4 < 3 && value === board[i + 1]) || (i < 12 && value === board[i + 4]));
function spawn(board, random) {
  const empty = board.flatMap((value, index) => value === 0 ? [index] : []);
  if (!empty.length) return [...board];
  const next = [...board], index = empty[Math.floor(random() * empty.length)];
  next[index] = random() < .9 ? 2 : 4;
  return next;
}
export class Game2048 {
  constructor(seed) { this.random = seededRandom(seed); this.score = 0; this.moves = 0; this.won = false; this.continued = false; this.over = false; this.board = spawn(spawn(Array(16).fill(0), this.random), this.random); }
  move(direction) {
    if (this.over || (this.won && !this.continued) || this.moves >= 10000) return false;
    const result = moveBoard(this.board, direction);
    if (!result.changed) return false;
    this.board = spawn(result.board, this.random); this.score += result.score; this.moves++;
    if (this.board.some(value => value >= 2048)) this.won = true;
    if (!canMove(this.board) || this.moves >= 10000) this.over = true;
    return true;
  }
}

export const shapes = [
  [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]],
];
export class BlockGame {
  constructor(seed) { this.random = seededRandom(seed); this.board = Array(64).fill(0); this.score = 0; this.lines = 0; this.over = false; this.placements = 0; this.refill(); }
  refill() { this.tray = Array.from({ length: 3 }, () => shapes[Math.floor(this.random() * shapes.length)].map(cell => [...cell])); }
  fits(shape, row, column) { return Boolean(shape?.length && Number.isInteger(row) && Number.isInteger(column) && shape.every(([x, y]) => row + y >= 0 && row + y < 8 && column + x >= 0 && column + x < 8 && !this.board[(row + y) * 8 + column + x])); }
  canContinue() { return this.tray.some(shape => shape && Array.from({ length: 64 }, (_, i) => i).some(i => this.fits(shape, Math.floor(i / 8), i % 8))); }
  place(piece, row, column) {
    const shape = this.tray[piece];
    if (this.over || !this.fits(shape, row, column)) return false;
    for (const [x, y] of shape) this.board[(row + y) * 8 + column + x] = 1;
    this.score += shape.length; this.tray[piece] = undefined; this.placements++;
    const rows = Array.from({ length: 8 }, (_, r) => r).filter(r => this.board.slice(r * 8, r * 8 + 8).every(Boolean));
    const columns = Array.from({ length: 8 }, (_, c) => c).filter(c => Array.from({ length: 8 }, (_, r) => this.board[r * 8 + c]).every(Boolean));
    this.lines += rows.length + columns.length; this.score += (rows.length + columns.length) * 10;
    this.board = this.board.map((value, i) => rows.includes(Math.floor(i / 8)) || columns.includes(i % 8) ? 0 : value);
    if (this.tray.every(item => !item)) this.refill();
    if (!this.canContinue() || this.placements >= 10000) this.over = true;
    return true;
  }
}

export const pairsForLevel = (level) => Math.min(12, level + 3);
export const limitForLevel = (level) => Math.max(25, pairsForLevel(level) * 8 - Math.floor((level - 1) / 4) * 2) * 1000;
export class MemoryGame {
  constructor(seed) { this.seed = seed; this.level = 1; this.score = 0; this.completedScore = 0; this.highestCompleted = 0; this.totalMoves = 0; this.over = false; this.enterLevel(); }
  enterLevel() {
    const pairs = pairsForLevel(this.level), random = seededRandom((this.seed + this.level) >>> 0);
    this.deck = Array.from({ length: pairs * 2 }, (_, i) => i % pairs);
    for (let i = this.deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }
    this.matched = Array(this.deck.length).fill(false); this.revealed = []; this.moves = 0; this.pairs = 0; this.timeLeft = limitForLevel(this.level);
  }
  flip(index) {
    if (this.over || !Number.isInteger(index) || index < 0 || index >= this.deck.length || this.revealed.length === 2 || this.matched[index] || this.revealed.includes(index)) return false;
    this.revealed.push(index);
    if (this.revealed.length === 2) {
      this.moves++; this.totalMoves++;
      const [a, b] = this.revealed;
      if (this.deck[a] === this.deck[b]) { this.matched[a] = this.matched[b] = true; this.revealed = []; this.pairs++; }
      this.score = this.completedScore + Math.max(0, this.pairs * 100 - Math.max(0, this.moves - this.pairs) * 10);
      if (this.pairs === pairsForLevel(this.level)) { this.highestCompleted = this.level; this.completedScore = this.score + this.level * 50; this.score = this.completedScore; this.level++; this.enterLevel(); }
    }
    return true;
  }
  settle() { if (this.revealed.length === 2) this.revealed = []; }
}

const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const winningLine = (board) => lines.find(line => board[line[0]] && board[line[0]] === board[line[1]] && board[line[0]] === board[line[2]]);
export const winner = (board) => { const line = winningLine(board); return line ? board[line[0]] : board.every(Boolean) ? 'draw' : undefined; };
function minimax(board, mark, depth) {
  const outcome = winner(board);
  if (outcome !== undefined) return outcome === 2 ? 10 - depth : outcome === 1 ? depth - 10 : 0;
  const scores = [];
  for (let i = 0; i < 9; i++) if (!board[i]) { board[i] = mark; scores.push(minimax(board, mark === 1 ? 2 : 1, depth + 1)); board[i] = 0; }
  return mark === 2 ? Math.max(...scores) : Math.min(...scores);
}
export function bestMove(board) {
  let best = -Infinity, move;
  for (let i = 0; i < 9; i++) if (!board[i]) { const next = [...board]; next[i] = 2; const value = minimax(next, 1, 0); if (value > best) { best = value; move = i; } }
  return move;
}
function placeVanishing(board, marks, mark, index) { board[index] = mark; marks[mark].push(index); if (marks[mark].length > 3) board[marks[mark].shift()] = 0; }
export class XoGame {
  constructor(seed, difficulty = 'normal', mode = 'classic') { this.random = seededRandom(seed); this.difficulty = difficulty; this.mode = mode; this.board = Array(9).fill(0); this.marks = { 1: [], 2: [] }; this.seen = new Map(); this.seen.set(this.key(1), 1); this.moves = 0; this.score = 0; this.outcome = undefined; this.over = false; }
  key(next) { return `${this.board.join('')}:${next}:${this.marks[1].join(',')}:${this.marks[2].join(',')}`; }
  apply(mark, index) { if (this.mode === 'vanishing') placeVanishing(this.board, this.marks, mark, index); else this.board[index] = mark; this.moves++; }
  check(next) {
    const line = winningLine(this.board);
    this.outcome = line ? this.board[line[0]] : this.mode === 'classic' && this.board.every(Boolean) ? 'draw' : undefined;
    if (this.mode === 'vanishing' && !this.outcome) { const key = this.key(next), count = (this.seen.get(key) ?? 0) + 1; this.seen.set(key, count); if (count >= 3 || this.moves >= 100) this.outcome = 'draw'; }
    if (this.outcome) { this.score = this.outcome === 1 ? 100 : this.outcome === 'draw' ? 50 : 0; this.over = true; }
  }
  human(index) { if (this.over || this.pendingAi || !Number.isInteger(index) || this.board[index] !== 0) return false; this.apply(1, index); this.check(2); this.pendingAi = !this.over; return true; }
  ai() {
    if (this.over || !this.pendingAi) return false;
    const legal = this.board.flatMap((mark, i) => mark ? [] : [i]);
    const optimal = this.difficulty === 'hard' || (this.difficulty === 'normal' && this.random() < .7);
    let move;
    if (optimal) {
      if (this.mode === 'classic') move = bestMove(this.board);
      else {
        let best = -Infinity;
        for (const i of legal) { const board = [...this.board], marks = { 1: [...this.marks[1]], 2: [...this.marks[2]] }; placeVanishing(board, marks, 2, i); if (winningLine(board)?.every(cell => board[cell] === 2)) { move = i; break; } let threats = 0; for (let reply = 0; reply < 9; reply++) if (!board[reply]) { const after = [...board], ages = { 1: [...marks[1]], 2: [...marks[2]] }; placeVanishing(after, ages, 1, reply); if (winningLine(after)?.every(cell => after[cell] === 1)) threats++; } const value = -threats * 100 + (i === 4 ? 2 : [0, 2, 6, 8].includes(i) ? 1 : 0); if (value > best) { best = value; move = i; } }
      }
    }
    move ??= legal[Math.floor(this.random() * legal.length)];
    if (move === undefined) return false;
    this.apply(2, move); this.pendingAi = false; this.check(1); return true;
  }
}
