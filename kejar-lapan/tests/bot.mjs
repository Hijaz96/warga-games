// A test player: reads the course ahead and steers, jumps and slides like a sharp human would.
// Not a test file itself (node --test only runs *.test.mjs); used by sim and score tests.
import { OBSTACLES, PLAYER_HALF_D } from '../js/config.js';

const cost = (type) => (!type ? 0 : OBSTACLES[type].clear === 'none' ? Infinity : 1);

/** Actions for this step. `greedy`: steer for items too when the lane is free. */
export function botActions(s) {
  const actions = [];
  const ahead = s.course.obstacles
    .filter((o) => !o.hit && o.at + OBSTACLES[o.type].len / 2 >= s.distance - PLAYER_HALF_D)
    .sort((a, b) => a.at - b.at);
  if (!ahead.length) return actions;
  const rowAt = ahead[0].at;
  const row = [null, null, null];
  for (const o of ahead) if (o.at === rowAt) row[o.lane] = o.type;
  const rowStart = (lane) => rowAt - (row[lane] ? OBSTACLES[row[lane]].len / 2 : 0);
  const inRow = [0, 1, 2].some((l) => row[l] && rowStart(l) <= s.distance + PLAYER_HALF_D + 0.5);

  if (!inRow) {
    let best = s.lane;
    let bestCost = Infinity;
    for (const l of [0, 1, 2]) {
      const c = cost(row[l]) + 0.1 * Math.abs(l - s.lane);
      if (c < bestCost) [best, bestCost] = [l, c];
    }
    if (best !== s.lane) actions.push(best < s.lane ? 'left' : 'right');
  }

  const t = row[s.lane];
  if (t && OBSTACLES[t].clear !== 'none') {
    const timeTo = (rowStart(s.lane) - (s.distance + PLAYER_HALF_D)) / s.speed;
    if (OBSTACLES[t].clear === 'jump' && timeTo <= 0.2 && !s.airborne) actions.push('jump');
    if (OBSTACLES[t].clear === 'slide' && timeTo <= 0.12 && s.slideT <= 0.05) actions.push('slide');
  }
  return actions;
}


/** Skilled test player that deliberately steers for visible support clocks between rows. */
export function clockBotActions(s) {
  const clock = s.course.items.find((item) => item.support && !item.taken && item.at >= s.distance - 0.9);
  if (!clock) return botActions(s);
  const obstacleBefore = s.course.obstacles.some((obstacle) => !obstacle.hit && obstacle.at < clock.at &&
    obstacle.at + OBSTACLES[obstacle.type].len / 2 >= s.distance - PLAYER_HALF_D);
  if (obstacleBefore) return botActions(s);
  const actions = [];
  if (s.lane !== clock.lane) actions.push(s.lane > clock.lane ? 'left' : 'right');
  if (s.airborne && (clock.at - s.distance) / s.speed < 0.2) actions.push('slide');
  return actions;
}
