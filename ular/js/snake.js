// Ular: the game rules, with no DOM, so they're unit-tested (tests/snake.test.mjs).
//
// The board is SIZE × SIZE cells; (0, 0) is the top-left. The snake is a list of cells,
// head first. Each step() moves it one cell in its direction. With walls on, leaving the
// board ends the game; with walls off, the snake comes back in on the other side.

export const SIZE = 20;
/** Points for each food: walls make it harder, so they're worth more. */
export const POINTS = { walls: 15, open: 10 };
export const MAX_TURNS_QUEUED = 2;

export const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Milliseconds between steps: 140 at first, 3 ms faster per food, never under 75. */
export const stepMs = (foods) => Math.max(75, 140 - foods * 3);

const same = (a, b) => a.x === b.x && a.y === b.y;

/** A new game: a 3-cell snake on the left of the middle row, heading right, and one food. */
export function createGame({ walls = true, size = SIZE, rng = Math.random } = {}) {
  const y = Math.floor(size / 2);
  const state = {
    size,
    walls,
    snake: [
      { x: 4, y },
      { x: 3, y },
      { x: 2, y },
    ],
    dir: 'right',
    queue: [],
    food: null,
    foods: 0,
    score: 0,
    status: 'playing', // 'playing' | 'dead' | 'won'
  };
  state.food = placeFood(state, rng);
  return state;
}

/**
 * Queues a turn. Ignored when it's the way the snake (after the turns already queued) is
 * already going, straight back into itself, or when MAX_TURNS_QUEUED turns are waiting.
 * Returns whether it was queued.
 */
export function turn(state, dir) {
  if (!DIRS[dir] || state.status !== 'playing') return false;
  const last = state.queue.at(-1) ?? state.dir;
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= MAX_TURNS_QUEUED) return false;
  state.queue.push(dir);
  return true;
}

/** A random free cell, or null when the snake fills the board. */
export function placeFood(state, rng = Math.random) {
  const taken = new Set(state.snake.map((c) => c.y * state.size + c.x));
  const free = [];
  for (let i = 0; i < state.size * state.size; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  return { x: i % state.size, y: Math.floor(i / state.size) };
}

/** Moves the snake one cell. Returns what happened: 'move', 'eat', 'dead' or 'won'. */
export function step(state, rng = Math.random) {
  if (state.status !== 'playing') return state.status;
  if (state.queue.length) state.dir = state.queue.shift();
  const [dx, dy] = DIRS[state.dir];
  const { size } = state;
  let x = state.snake[0].x + dx;
  let y = state.snake[0].y + dy;
  if (x < 0 || y < 0 || x >= size || y >= size) {
    if (state.walls) {
      state.status = 'dead';
      return 'dead';
    }
    x = (x + size) % size;
    y = (y + size) % size;
  }
  const head = { x, y };
  const eating = state.food != null && same(head, state.food);
  // The tail moves out of the way this step unless the snake grows.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if (body.some((c) => same(c, head))) {
    state.status = 'dead';
    return 'dead';
  }
  state.snake.unshift(head);
  if (!eating) {
    state.snake.pop();
    return 'move';
  }
  state.foods += 1;
  state.score += state.walls ? POINTS.walls : POINTS.open;
  state.food = placeFood(state, rng);
  if (!state.food) {
    state.status = 'won';
    return 'won';
  }
  return 'eat';
}
