// Kejar Lapan: input. Keyboard, swipes on the play area and the on-screen buttons all turn into
// the same actions ('left', 'right', 'jump', 'slide'), handed to `onAction`.

const KEYS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
};

/** A swipe is this many CSS pixels; one gesture gives one action. */
const SWIPE = 24;

/**
 * Wires input. `active()` says whether actions should be taken now (e.g. not while paused or in
 * a dialog); `onAction(action)` receives each one; `onOther(key)` gets P / Escape for pausing.
 */
export function initInput({ area, buttons, active, onAction, onPauseKey }) {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (document.body.dataset.screen !== 'game') return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      onPauseKey();
      return;
    }
    const action = KEYS[e.code];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat && active()) onAction(action);
  });

  let from = null;
  area.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    from = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  area.addEventListener('pointermove', (e) => {
    if (!from || e.pointerId !== from.id) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
    from = null; // one action per swipe
    if (!active()) return;
    if (Math.abs(dx) > Math.abs(dy)) onAction(dx > 0 ? 'right' : 'left');
    else onAction(dy < 0 ? 'jump' : 'slide');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) area.addEventListener(ev, () => (from = null));

  for (const b of buttons) {
    // pointerdown, not click: the move happens the moment the finger lands.
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (active()) onAction(b.dataset.action);
    });
    b.addEventListener('click', (e) => {
      if (e.detail === 0 && active()) onAction(b.dataset.action); // Enter / Space on a focused button
    });
  }
}
