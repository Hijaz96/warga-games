// Hidden wardrobe code: L, RR, LLL, R within ten seconds.
const CODE = 'LRRLLLR';
export function createRotationCode(windowMs = 10000) {
  let presses = [];
  return {
    reset() { presses = []; },
    press(direction, now) {
      if (direction !== -1 && direction !== 1) return false;
      presses = presses.filter((entry) => now >= entry.time && now - entry.time <= windowMs);
      presses.push({ key: direction === -1 ? 'L' : 'R', time: now });
      if (presses.length > CODE.length) presses.shift();
      if (presses.map((entry) => entry.key).join('') !== CODE) return false;
      presses = [];
      return true;
    },
  };
}
