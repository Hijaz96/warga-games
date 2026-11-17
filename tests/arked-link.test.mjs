import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameFromHub, hubUrl, shareUrl } from '../shared/arked-link.js';

test('the hub address is fixed on GitHub Pages, local on a dev server', () => {
  assert.equal(hubUrl({ hostname: 'nullifye.github.io', origin: 'https://nullifye.github.io' }), 'https://nullifye.github.io/arcade/');
  assert.equal(hubUrl({ hostname: 'localhost', origin: 'http://localhost:8080' }), 'http://localhost:8080/arcade/');
});

test('only a visit straight from the hub walks back through the history', () => {
  assert.equal(cameFromHub('https://nullifye.github.io/arcade/'), true);
  assert.equal(cameFromHub('https://nullifye.github.io/'), true); // cross-site: origin only
  assert.equal(cameFromHub('http://localhost:8080/arcade/'), true);
  assert.equal(cameFromHub(''), false);
  assert.equal(cameFromHub('https://nullifye.github.io/teka-kata/'), false);
  assert.equal(cameFromHub('https://evil.example/arcade/'), false);
});

test('shared links drop ?dari=arked and the screen', () => {
  assert.equal(shareUrl('https://nullifye.github.io/teka-kata/?dari=arked#/keputusan'), 'https://nullifye.github.io/teka-kata/');
  assert.equal(shareUrl('https://nullifye.github.io/teka-kata/#/keputusan'), 'https://nullifye.github.io/teka-kata/');
});
