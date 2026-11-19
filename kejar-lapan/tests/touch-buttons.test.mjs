import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initTouchButtons } from '../js/touch-buttons.js';

function setup() {
  const handlers = {};
  const root = { addEventListener(type, handler) { handlers[type] = handler; } };
  let clicks = 0;
  const button = { disabled: false, isConnected: true, matches: () => false, closest: () => button, getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 60 }), click() { clicks++; } };
  initTouchButtons(root, () => 100);
  const send = (type, patch = {}) => {
    const event = { target: button, pointerType: 'touch', pointerId: 1, clientX: 30, clientY: 30, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...patch };
    handlers[type](event);
    return event;
  };
  return { button, send, clicks: () => clicks };
}

test('one touch release activates immediately and suppresses its delayed native click', () => {
  const tap = setup();
  tap.send('pointerdown');
  assert.equal(tap.clicks(), 0);
  tap.send('pointerup');
  assert.equal(tap.clicks(), 1);
  assert.equal(tap.send('click', { isTrusted: true, detail: 1 }).stopped, true);
  assert.equal(tap.send('click', { isTrusted: false, detail: 0 }).stopped, undefined);
  assert.equal(tap.send('click', { isTrusted: true, detail: 0, pointerType: '' }).stopped, undefined);
});

test('scrolling, cancelled touches, release outside, disabled and game-pad controls do not trigger', () => {
  for (const cancel of ['pointermove', 'pointercancel', 'scroll']) {
    const tap = setup();tap.send('pointerdown');tap.send(cancel, { clientX: 65 });tap.send('pointerup');assert.equal(tap.clicks(), 0);
  }
  const outside = setup();outside.send('pointerdown');outside.send('pointerup', { clientX: 110 });assert.equal(outside.clicks(), 0);
  const disabled = setup();disabled.button.disabled = true;disabled.send('pointerdown');disabled.send('pointerup');assert.equal(disabled.clicks(), 0);
  const pad = setup();pad.button.matches = () => true;pad.send('pointerdown');pad.send('pointerup');assert.equal(pad.clicks(), 0);
});

test('rapid separate taps each activate once and mouse clicks remain native', () => {
  const tap = setup();
  for (let i = 0; i < 2; i++) { tap.send('pointerdown');tap.send('pointerup'); }
  assert.equal(tap.clicks(), 2);
  tap.send('pointerdown', { pointerType: 'mouse' });
  assert.equal(tap.send('click', { isTrusted: true, detail: 1, pointerType: 'mouse' }).stopped, undefined);
});
