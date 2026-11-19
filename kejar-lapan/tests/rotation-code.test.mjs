import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRotationCode } from '../js/rotation-code.js';
import { COSMETICS, equippedCosmetics, isUnlocked } from '../js/cosmetics.js';
const code = [-1, 1, 1, -1, -1, -1, 1];

test('exact rotation code unlocks only on the final press', () => {
  const input = createRotationCode();
  assert.deepEqual(code.map((direction, i) => input.press(direction, i * 500)), [false, false, false, false, false, false, true]);
  assert.equal(input.press(1, 4000), false);
});

test('wrong order, expired input and explicit reset cannot complete the code', () => {
  const wrong = createRotationCode();
  assert.equal([1, -1, 1, -1, 1, 1, -1].some((direction, i) => wrong.press(direction, i)), false);
  const expired = createRotationCode();
  assert.equal(code.some((direction, i) => expired.press(direction, i * 2000)), false);
  const reset = createRotationCode();
  code.slice(0, 4).forEach((direction, i) => reset.press(direction, i));
  reset.reset();
  assert.equal(code.slice(4).some((direction, i) => reset.press(direction, i + 4)), false);
});

test('a fresh complete code works after other rotations', () => {
  const input = createRotationCode();
  [1, 1, -1, 1].forEach((direction, i) => input.press(direction, i));
  assert.equal(code.map((direction, i) => input.press(direction, i + 10)).at(-1), true);
});

test('cheat access unlocks equipment without fabricating achievement totals', () => {
  const stats = Object.freeze({ played: 0, bestDistance: 0 });
  for (const item of COSMETICS) {
    assert.equal(isUnlocked(stats, item, false), false);
    assert.equal(isUnlocked(stats, item, true), true);
    assert.equal(equippedCosmetics(stats, { [item.slot]: item.id }, true)[item.slot].id, item.id);
  }
  assert.equal(stats.played, 0);
  assert.equal(stats.bestDistance, 0);
});
