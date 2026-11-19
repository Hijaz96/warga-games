// Kejar Lapan: the run. A fixed-step simulation of the player, the course, the clock and the
// score. Pure: no DOM, no Three.js, so it is unit-tested and the same on every device.
import {
  LANES,
  LANE_SPEED,
  PLAYER_HALF_W,
  PLAYER_HALF_D,
  GRAVITY,
  JUMP_SPEED,
  JUMP_BUFFER,
  SLIDE_TIME,
  DROP_SPEED,
  BOOST,
  OBSTACLES,
  ITEMS,
  PICKUP,
  CLOCK,
  CHECKPOINT_POINTS,
  SERVER,
  STEP,
} from './config.js';
import {
  baseSpeed,
  createCourse,
  extendCourse,
  pruneCourse,
  checkpointAt,
  checkpointTime,
  landmarkFor,
} from './course.js';

/** How far ahead the course is laid (the view reaches about 170 m). */
export const LOOKAHEAD = 220;

export function createRun({ seed = 1, role = 'pelajar', finishAt = null } = {}) {
  const course = createCourse(seed);
  extendCourse(course, LOOKAHEAD);
  return {
    seed,
    role,
    finishAt,
    course,
    t: 0, // seconds run
    distance: 0,
    speed: baseSpeed(0),
    lane: 1, // the lane being moved to
    x: LANES[1],
    y: 0,
    vy: 0,
    airborne: false,
    slideT: 0,
    jumpBuffer: 0,
    boostT: 0,
    shield: false,
    timeLeft: CLOCK.start,
    bonus: 0, // points from items and checkpoints
    score: 0,
    checkpoints: 0,
    picked: { points: 0, boost: 0, shield: 0, time: 0 },
    status: 'running', // 'running' | 'crashed' | 'late' | 'arrived'
  };
}

export const sliding = (s) => s.slideT > 0;

function jump(s, events) {
  s.airborne = true;
  s.vy = JUMP_SPEED;
  s.slideT = 0;
  s.jumpBuffer = 0;
  events.push({ type: 'jump' });
}

function act(s, action, events) {
  if (action === 'left' || action === 'right') {
    const lane = Math.min(2, Math.max(0, s.lane + (action === 'left' ? -1 : 1)));
    if (lane !== s.lane) {
      s.lane = lane;
      events.push({ type: 'lane' });
    }
  } else if (action === 'jump') {
    if (!s.airborne) jump(s, events);
    else s.jumpBuffer = JUMP_BUFFER;
  } else if (action === 'slide') {
    if (s.airborne) s.vy = Math.min(s.vy, DROP_SPEED);
    if (!sliding(s)) events.push({ type: 'slide' });
    s.slideT = SLIDE_TIME;
    s.jumpBuffer = 0;
  }
}

/** Whether obstacle `o` stops the player as they are now. */
function blocks(s, o) {
  const spec = OBSTACLES[o.type];
  if (Math.abs(s.x - LANES[o.lane]) >= spec.w / 2 + PLAYER_HALF_W) return false;
  if (spec.clear === 'jump') return s.y < spec.clearY;
  if (spec.clear === 'slide') return !sliding(s);
  return true;
}

/**
 * Advances the run by `dt` (normally STEP) after applying `actions` ('left', 'right', 'jump',
 * 'slide'). Returns what happened, for sound, haptics and effects: { type: 'jump' | 'land' |
 * 'lane' | 'slide' | 'pickup' | 'smash' | 'shieldBreak' | 'checkpoint' | 'crash' | 'late', … }.
 */
export function step(s, actions = [], dt = STEP) {
  const events = [];
  if (s.status !== 'running') return events;
  for (const a of actions) act(s, a, events);

  // Sideways, towards the chosen lane at a steady speed.
  const tx = LANES[s.lane];
  const dx = tx - s.x;
  s.x = Math.abs(dx) <= LANE_SPEED * dt ? tx : s.x + Math.sign(dx) * LANE_SPEED * dt;

  // Up and down.
  if (s.airborne) {
    s.vy += GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) {
      s.y = 0;
      s.vy = 0;
      s.airborne = false;
      events.push({ type: 'land' });
      if (s.jumpBuffer > 0) jump(s, events);
    }
  }
  s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  s.slideT = Math.max(0, s.slideT - dt);

  // Forward.
  const base = baseSpeed(s.distance);
  s.speed = s.boostT > 0 ? base * BOOST.factor : base;
  // Stop exactly at the finish or deadline, even when crossing during this tick.
  const remaining = s.finishAt == null ? Infinity : Math.max(0, s.finishAt - s.distance) / s.speed;
  dt = Math.min(dt, remaining, Math.max(0, s.timeLeft));
  const d0 = s.distance;
  const d1 = s.finishAt == null ? d0 + s.speed * dt : Math.min(s.finishAt, d0 + s.speed * dt);
  s.distance = d1;
  s.t += dt;
  s.boostT = Math.max(0, s.boostT - dt);
  extendCourse(s.course, d1 + LOOKAHEAD);
  pruneCourse(s.course, d1 - 30);

  // Obstacles: anything whose length overlaps the stretch covered this step (swept, so nothing is
  // skipped however fast the run is).
  for (const o of s.course.obstacles) {
    if (s.finishAt != null && o.at > s.finishAt) continue;
    if (o.hit) continue;
    const half = OBSTACLES[o.type].len / 2;
    if (o.at - half > d1 + PLAYER_HALF_D || o.at + half < d0 - PLAYER_HALF_D) continue;
    if (!blocks(s, o)) continue;
    o.hit = true;
    if (s.boostT > 0) {
      events.push({ type: 'smash', obstacle: o });
    } else if (s.shield) {
      s.shield = false;
      events.push({ type: 'shieldBreak', obstacle: o });
    } else {
      s.status = 'crashed';
      events.push({ type: 'crash', obstacle: o });
      return events;
    }
  }

  // Items.
  for (const it of s.course.items) {
    if (s.finishAt != null && it.at > s.finishAt) continue;
    if (it.taken) continue;
    if (it.at < d0 - PICKUP.halfD || it.at > d1 + PICKUP.halfD) continue;
    if (Math.abs(s.x - LANES[it.lane]) >= PICKUP.halfW || s.y >= PICKUP.maxY) continue;
    it.taken = true;
    s.picked[it.kind] += 1;
    s.bonus += ITEMS[it.kind].value;
    if (it.kind === 'boost') s.boostT = BOOST.time;
    else if (it.kind === 'shield') s.shield = true;
    else if (it.kind === 'time') s.timeLeft = Math.min(CLOCK.max, s.timeLeft + ITEMS.time.seconds);
    events.push({ type: 'pickup', item: it });
  }

  // Reaching the destination must happen before 8:00; the finish gives no extra time.
  const arrived = s.finishAt != null && d1 >= s.finishAt && s.timeLeft > dt;
  // Checkpoints.
  while (d1 >= checkpointAt(s.checkpoints)) {
    const k = s.checkpoints;
    const add = checkpointAt(k) === s.finishAt ? 0 : checkpointTime(k);
    s.timeLeft = Math.min(CLOCK.max, s.timeLeft + add);
    s.bonus += CHECKPOINT_POINTS;
    s.checkpoints += 1;
    events.push({ type: 'checkpoint', k, add, landmark: landmarkFor(k) });
  }

  s.score = Math.min(SERVER.maxPoints, Math.floor(s.distance) + s.bonus);

  // The clock.
  s.timeLeft -= dt;
  if (arrived) {
    s.status = 'arrived';
    events.push({ type: 'arrived' });
  } else if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    s.status = 'late';
    events.push({ type: 'late' });
  }
  return events;
}

/** The next checkpoint: where it is, its landmark and how far away. */
export function nextCheckpoint(s) {
  const at = checkpointAt(s.checkpoints);
  return { at, landmark: landmarkFor(s.checkpoints), metres: Math.max(0, at - s.distance) };
}

/** Whole seconds run, as sent to arked_record (at least 1). */
export const runSeconds = (s) => Math.max(1, Math.round(s.t));
