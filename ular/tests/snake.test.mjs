import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, placeFood, step, stepMs, turn, POINTS, SIZE } from '../js/snake.js';

const fixed = (v) => () => v;
const headOf = (s) => s.snake[0];

test('a new game: 3 cells heading right, food on a free cell', () => {
  const s = createGame({ rng: fixed(0) });
  assert.equal(s.snake.length, 3);
  assert.deepEqual(headOf(s), { x: 4, y: SIZE / 2 });
  assert.equal(s.dir, 'right');
  assert.ok(!s.snake.some((c) => c.x === s.food.x && c.y === s.food.y));
});

test('moving keeps the length', () => {
  const s = createGame({ rng: fixed(0) });
  s.food = { x: 0, y: 0 };
  assert.equal(step(s), 'move');
  assert.deepEqual(headOf(s), { x: 5, y: 10 });
  assert.equal(s.snake.length, 3);
});

test('eating grows the snake and scores by mode', () => {
  for (const walls of [true, false]) {
    const s = createGame({ walls, rng: fixed(0) });
    s.food = { x: 5, y: 10 };
    assert.equal(step(s, fixed(0)), 'eat');
    assert.equal(s.snake.length, 4);
    assert.equal(s.foods, 1);
    assert.equal(s.score, walls ? POINTS.walls : POINTS.open);
    assert.ok(!s.snake.some((c) => c.x === s.food.x && c.y === s.food.y));
  }
});

test('walls on: leaving the board ends the game', () => {
  const s = createGame({ walls: true });
  s.food = { x: 0, y: 0 };
  s.snake = [{ x: SIZE - 1, y: 5 }, { x: SIZE - 2, y: 5 }, { x: SIZE - 3, y: 5 }];
  assert.equal(step(s), 'dead');
  assert.equal(s.status, 'dead');
  assert.equal(step(s), 'dead'); // stays over
});

test('walls off: the snake wraps around every edge', () => {
  const s = createGame({ walls: false });
  s.food = { x: 10, y: 10 };
  s.snake = [{ x: SIZE - 1, y: 5 }, { x: SIZE - 2, y: 5 }, { x: SIZE - 3, y: 5 }];
  assert.equal(step(s), 'move');
  assert.deepEqual(headOf(s), { x: 0, y: 5 });
  s.snake = [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }];
  s.dir = 'up';
  step(s);
  assert.deepEqual(headOf(s), { x: 3, y: SIZE - 1 });
});

test('hitting itself ends the game', () => {
  const s = createGame();
  s.food = { x: 0, y: 0 };
  // A loop: head at (5,5) going down into (5,6), which is body.
  s.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
  s.dir = 'down';
  assert.equal(step(s), 'dead');
});

test('moving into the cell the tail is leaving is fine', () => {
  const s = createGame();
  s.food = { x: 0, y: 0 };
  s.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  s.dir = 'down';
  assert.equal(step(s), 'move');
});

test('turns: no reversing, no repeats, at most 2 queued, applied one per step', () => {
  const s = createGame();
  s.food = { x: 0, y: 0 };
  assert.equal(turn(s, 'left'), false); // straight back
  assert.equal(turn(s, 'right'), false); // already going right
  assert.equal(turn(s, 'up'), true);
  assert.equal(turn(s, 'down'), false); // reverse of the queued 'up'
  assert.equal(turn(s, 'left'), true);
  assert.equal(turn(s, 'down'), false); // queue full
  step(s);
  assert.equal(s.dir, 'up');
  step(s);
  assert.equal(s.dir, 'left');
  assert.equal(turn(s, 'nowhere'), false);
});

test('a quick up-then-left can make a U-turn without dying', () => {
  const s = createGame();
  s.food = { x: 0, y: 0 };
  turn(s, 'up');
  turn(s, 'left');
  assert.equal(step(s), 'move');
  assert.equal(step(s), 'move');
  assert.equal(s.status, 'playing');
});

test('food is never placed on the snake, and filling the board wins', () => {
  const s = createGame({ size: 2, rng: fixed(0.99) });
  s.snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  assert.deepEqual(placeFood(s, fixed(0.5)), { x: 0, y: 1 });
  s.food = { x: 0, y: 1 };
  s.dir = 'down';
  assert.equal(step(s), 'won');
  assert.equal(s.status, 'won');
  assert.equal(s.food, null);
});

test('speed goes up with each food, down to 75 ms', () => {
  assert.equal(stepMs(0), 140);
  assert.equal(stepMs(10), 110);
  assert.equal(stepMs(100), 75);
});

test('the server bound holds: a full board with walls stays within 6000 points', () => {
  assert.ok((SIZE * SIZE - 3) * POINTS.walls <= 6000);
});
