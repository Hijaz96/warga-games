// Version the course identity whenever generation, physics or tuning changes.
import { hashString, todayKL, mulberry32, shuffle } from '../../shared/rng.js';
import { checkpointAt, landmarkFor } from './course.js';
import { LANDMARKS, ROLES } from './config.js';

export const COURSE_VERSION = 'kl-8';
export const MODE_LABELS = { daily: 'Cabaran Harian', endless: 'Larian Jauh' };
const ROLE_IDS = Object.keys(ROLES);
/** Daily goals start no earlier than PTAR; the two shortest checkpoints are too brief to race. */
export const DAILY_FIRST_CHECKPOINT = 3;

export function runPlan(mode, role, date = new Date()) {
  if (!Object.hasOwn(MODE_LABELS, mode)) mode = 'daily';
  if (mode === 'endless') return { mode, key: null, finishAt: null, destination: null };
  const day = todayKL(date);
  const roleIndex = Math.max(0, ROLE_IDS.indexOf(role));
  // Each day picks a window of neighbouring checkpoints, one per role, then shuffles who gets which.
  // Roles race similar distances on the same day while the length still varies from day to day.
  const rng = mulberry32(hashString(`${COURSE_VERSION}:goals:${day}`));
  const starts = LANDMARKS.length - DAILY_FIRST_CHECKPOINT - ROLE_IDS.length;
  const first = DAILY_FIRST_CHECKPOINT + Math.floor(rng() * starts);
  const goals = Array.from({ length: ROLE_IDS.length }, (_, index) => first + index);
  const checkpoint = shuffle(goals, rng)[roleIndex];
  const key = `${COURSE_VERSION}:daily:${day}:${ROLE_IDS[roleIndex]}`;
  return {
    mode, key, day, seed: hashString(key),
    finishAt: checkpointAt(checkpoint),
    destination: landmarkFor(checkpoint),
  };
}
