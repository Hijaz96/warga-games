import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordChunks, LINE_CELLS } from '../js/board.js';
import { createPuzzle } from '../js/game.js';
import { mulberry32 } from '../../shared/rng.js';
import { PHRASES } from '../js/phrases.js';

const chunksOf = (text) => {
  const s = createPuzzle(text, mulberry32(1));
  return s.words.map((w) =>
    wordChunks(s.cells, w).map((c) => s.cells.filter((_, i) => c.idxs.includes(i)).map((x) => x.ch).join('') + (c.cont ? '…' : '')),
  );
};

test('short words stay whole', () => {
  assert.deepEqual(chunksOf('Malaysia Boleh'), [['MALAYSIA'], ['BOLEH']]);
});

test('hyphenated words break after the hyphen', () => {
  assert.deepEqual(chunksOf('Kedaulatan undang-undang'), [['KEDAULATAN'], ['UNDANG-', 'UNDANG']]);
  assert.deepEqual(chunksOf('Sedikit-sedikit, lama-lama'), [['SEDIKIT-', 'SEDIKIT,'], ['LAMA-', 'LAMA']]);
});

test('a word longer than a line is cut evenly, with a continuation mark', () => {
  assert.deepEqual(chunksOf('Raja berperlembagaan'), [['RAJA'], ['BERPERLE…', 'MBAGAAN']]);
});

test('every piece of every phrase fits on one line', () => {
  for (const p of PHRASES) {
    const s = createPuzzle(p.text, mulberry32(1));
    for (const w of s.words) {
      const chunks = wordChunks(s.cells, w);
      // Every cell appears exactly once, in order.
      assert.deepEqual(chunks.flatMap((c) => c.idxs), w);
      for (const c of chunks) {
        assert.ok(c.idxs.length + (c.cont ? 1 : 0) <= LINE_CELLS, `${p.text}: piece too long`);
      }
    }
  }
});
