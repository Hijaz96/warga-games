// Activate touch buttons on release, then suppress only the browser's duplicate click.
// Existing click handlers and keyboard activation stay intact; swipes never become taps.
export function initTouchButtons(root = document, now = () => performance.now()) {
  let press = null;
  let activated = null;
  const buttonAt = (target) => target?.closest?.('button');
  root.addEventListener('pointerdown', (event) => {
    if (!['touch', 'pen'].includes(event.pointerType) || event.isPrimary === false) {
      press = null;
      if (event.pointerType === 'mouse') activated = null;
      return;
    }
    const button = buttonAt(event.target);
    press = button && !button.disabled && !button.matches('.pad-btn')
      ? { button, id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  }, true);
  root.addEventListener('pointermove', (event) => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) press = null;
  }, true);
  root.addEventListener('pointercancel', () => { press = null; }, true);
  root.addEventListener('scroll', () => { press = null; }, true);
  root.addEventListener('pointerup', (event) => {
    const tap = press;
    press = null;
    if (!tap || tap.id !== event.pointerId || tap.button.disabled || !tap.button.isConnected) return;
    const bounds = tap.button.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    activated = { button: tap.button, at: now(), x: event.clientX, y: event.clientY };
    event.preventDefault();
    // This runs synchronously in the trusted release gesture, preserving share/audio activation.
    tap.button.click();
  }, { capture: true, passive: false });
  root.addEventListener('click', (event) => {
    if (!activated || !event.isTrusted || (event.detail === 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    if (now() - activated.at > 800) return;
    if (buttonAt(event.target) !== activated.button && Math.hypot(event.clientX - activated.x, event.clientY - activated.y) > 24) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
