import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game2048, BlockGame, MemoryGame, XoGame, moveBoard, winningLine } from '../shared/puzzle-engines.js';

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

test('XO detects a win and stops the round', () => {
  const game = new XoGame(1);
  game.board = [1, 1, 0, 2, 2, 0, 0, 0, 0];
  assert.equal(game.human(2), true);
  assert.deepEqual(winningLine(game.board), [0, 1, 2]);
  assert.equal(game.score, 100);
  assert.equal(game.over, true);
  assert.equal(game.human(6), false);
});
