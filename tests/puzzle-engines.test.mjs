import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game2048, BlockGame, MemoryGame, moveBoard, canMove, shapes, limitForLevel } from '../shared/puzzle-engines.js';

test('2048 merges equal tiles once and accumulates points', () => {
  const result = moveBoard([2, 2, 2, 2, ...Array(12).fill(0)], 'left');
  assert.deepEqual(result.board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(result.score, 8);
  const game = new Game2048(42);
  assert.equal(game.board.filter(Boolean).length, 2);
});

test('block game places a piece, clears a line and rejects overlap', () => {
  const game = new BlockGame(1);
  game.board.fill(0);
  game.board.splice(0, 7, ...Array(7).fill(1));
  game.tray = [[[0, 0]], undefined, undefined];
  assert.equal(game.place(0, 0, 7), true);
  assert.equal(game.lines, 1);
  assert.equal(game.score, 11);
  assert.equal(game.board.slice(0, 8).every(value => value === 0), true);
});

test('memory game matches pairs and advances after a full deck', () => {
  const game = new MemoryGame(1);
  for (let value = 0; value < 4; value++) {
    const cells = game.deck.flatMap((card, i) => card === value ? [i] : []);
    assert.equal(game.flip(cells[0]), true);
    assert.equal(game.flip(cells[1]), true);
  }
  assert.equal(game.highestCompleted, 1);
  assert.equal(game.level, 2);
  assert.equal(game.score, 450);
});

// The hub's arked_record limits (docs/arcade-integration.md) rest on these per-action bounds.
test('2048 ends when no tile can move, and a greedy player averages well under 50 points a move', () => {
  assert.equal(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), false);
  assert.equal(canMove([2, 2, 4, 8, ...Array(12).fill(16).map((v, i) => v * 2 ** (i % 4) + i * 1024)]), true);
  for (let seed = 1; seed <= 20; seed++) {
    const game = new Game2048(seed);
    while (!game.over) {
      if (game.won) game.continued = true;
      const best = ['left', 'down', 'right', 'up']
        .map(direction => ({ direction, ...moveBoard(game.board, direction) }))
        .filter(option => option.changed)
        .sort((a, b) => b.score - a.score)[0];
      if (!best) break;
      game.move(best.direction);
    }
    assert.ok(game.score / game.moves < 50, `seed ${seed}: ${game.score} in ${game.moves} moves`);
  }
});

test('a block placement scores at most 54 points and a full board ends the game', () => {
  // Full lines clear at once, so a placement can only complete lines through its own cells.
  // The T piece spans 3 columns and 2 rows: 4 cells plus at most 5 cleared lines.
  const tee = shapes.find(shape => shape.length === 4 && new Set(shape.map(([x]) => x)).size === 3);
  const game = new BlockGame(1);
  game.board.fill(0);
  for (let i = 0; i < 64; i++) if (Math.floor(i / 8) < 2 || i % 8 < 3) game.board[i] = 1;
  for (const [x, y] of tee) game.board[y * 8 + x] = 0;
  game.tray = [tee, undefined, undefined];
  assert.equal(game.place(0, 0, 0), true);
  assert.equal(game.lines, 5);
  assert.equal(game.score, 54);
  const full = new BlockGame(2);
  full.board.fill(1);
  assert.equal(full.canContinue(), false);
});

test('memory penalises misses and a perfect first level is worth 450', () => {
  const game = new MemoryGame(7);
  const pair = value => game.deck.flatMap((card, i) => card === value ? [i] : []);
  const [a] = pair(0), [b] = pair(1);
  game.flip(a); game.flip(b); game.settle();
  const [c, d] = pair(0);
  game.flip(c); game.flip(d);
  assert.equal(game.score, 100 - 10);
  assert.equal(limitForLevel(1), 32000);
  assert.equal(limitForLevel(9), 92000);
  const perfect = new MemoryGame(3);
  for (let value = 0; value < 4; value++) for (const i of perfect.deck.flatMap((card, j) => card === value ? [j] : [])) perfect.flip(i);
  assert.equal(perfect.score, 450);
});
