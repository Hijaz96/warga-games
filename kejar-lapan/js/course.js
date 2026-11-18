// Kejar Lapan: the course. A seeded generator lays obstacle rows and items ahead of the player,
// always leaving a way through, and places the landmark checkpoints. Pure functions, no DOM.
import { mulberry32 } from '../../shared/rng.js';
import {
  SPEED,
  ROWS,
  TIERS,
  OBSTACLES,
  JUMPERS,
  BLOCKERS,
  ITEM_CHANCE,
  CLOCK,
  CHECKPOINTS,
  LANDMARKS,
} from './config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Running speed at a distance, before any boost. */
export const baseSpeed = (d) => Math.min(SPEED.max, SPEED.start + d * SPEED.perMetre);

/** Metres from a row at `d` to the next: a fixed time at the speed there, shorter as it gets harder. */
export function rowGap(d) {
  const time = ROWS.easyTime + (ROWS.hardTime - ROWS.easyTime) * clamp01(d / ROWS.hardAt);
  return Math.max(ROWS.minGap, baseSpeed(d) * time);
}

/** Difficulty tier (0–3) at a distance. */
export const tierAt = (d) => TIERS.filter((t) => d >= t).length - 1;

/** Distance of checkpoint `k` (0 = the first): gaps of first, first + grow, first + 2·grow… */
export const checkpointAt = (k) => (k + 1) * CHECKPOINTS.first + (CHECKPOINTS.grow * k * (k + 1)) / 2;

/** Seconds checkpoint `k` adds to the clock. */
export const checkpointTime = (k) => Math.max(CLOCK.cpMin, CLOCK.cpFirst - k);

/** The landmark at checkpoint `k`: every landmark after the gate, round and round. */
export const landmarkFor = (k) => LANDMARKS[1 + (k % (LANDMARKS.length - 1))];

/** Whether a lane with this obstacle (or none) can be got through without changing lane. */
export const passable = (type) => !type || OBSTACLES[type].clear !== 'none';

/**
 * One row of obstacles: [left, middle, right], each an obstacle type or null. Harder tiers fill
 * more lanes, but at least one lane is always passable (empty, or jumped / slid through).
 */
export function pattern(rng, tier) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const action = () => (rng() < 0.3 ? 'barrier' : pick(JUMPERS));
  const any = () => (rng() < 0.35 ? pick(BLOCKERS) : action());
  // Lanes in a random order: the first ones get obstacles.
  const lanes = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const cells = [null, null, null];
  const chances = [
    // one, two (one lane empty), three (one blocker + two to jump/slide), three to jump/slide
    [0.75, 1, 1, 1],
    [0.4, 0.85, 1, 1],
    [0.25, 0.65, 0.8, 1],
    [0.15, 0.55, 0.75, 1],
  ][tier];
  const r = rng();
  if (r < chances[0]) {
    cells[lanes[0]] = any();
  } else if (r < chances[1]) {
    cells[lanes[0]] = any();
    cells[lanes[1]] = any();
  } else if (r < chances[2]) {
    cells[lanes[0]] = pick(BLOCKERS);
    cells[lanes[1]] = action();
    cells[lanes[2]] = action();
  } else {
    cells[lanes[0]] = action();
    cells[lanes[1]] = action();
    cells[lanes[2]] = action();
  }
  if (!cells.some(passable)) cells[lanes[2]] = null; // never happens with the patterns above; kept as a guard
  return cells;
}

export function createCourse(seed) {
  return { rng: mulberry32(seed), nextRowAt: ROWS.first, nextId: 1, obstacles: [], items: [] };
}

/** Items in the gap whose middle is `mid`: a line of three points items, or one power-up. */
function placeItems(course, mid) {
  const { rng } = course;
  const add = (at, lane, kind) => course.items.push({ id: course.nextId++, at, lane, kind, taken: false });
  if (rng() < ITEM_CHANCE.line) {
    const lane = Math.floor(rng() * 3);
    for (const off of [-4, 0, 4]) add(mid + off, lane, 'points');
    return;
  }
  const x = rng();
  const lane = Math.floor(rng() * 3);
  if (x < ITEM_CHANCE.boost) add(mid, lane, 'boost');
  else if (x < ITEM_CHANCE.boost + ITEM_CHANCE.shield) add(mid, lane, 'shield');
  else if (x < ITEM_CHANCE.boost + ITEM_CHANCE.shield + ITEM_CHANCE.time) add(mid, lane, 'time');
}

/** Lays rows (and the items between them) up to distance `until`. */
export function extendCourse(course, until) {
  while (course.nextRowAt <= until) {
    const at = course.nextRowAt;
    pattern(course.rng, tierAt(at)).forEach((type, lane) => {
      if (type) course.obstacles.push({ id: course.nextId++, at, lane, type, hit: false });
    });
    const gap = rowGap(at);
    placeItems(course, at + gap / 2);
    course.nextRowAt = at + gap;
  }
}

/** Forgets obstacles and items already behind `behind`. */
export function pruneCourse(course, behind) {
  course.obstacles = course.obstacles.filter((o) => o.at + OBSTACLES[o.type].len / 2 >= behind);
  course.items = course.items.filter((i) => i.at >= behind);
}
