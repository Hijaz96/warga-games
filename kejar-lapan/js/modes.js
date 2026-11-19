// Version the course identity whenever generation, physics or tuning changes.
import { hashString, todayKL } from '../../shared/rng.js';
import { checkpointAt, landmarkFor } from './course.js';

export const COURSE_VERSION = 'kl-4';
export const MODE_LABELS = { destination: 'Tepat Masa', daily: 'Cabaran Harian', endless: 'Tanpa Henti' };
const DESTINATIONS = { pelajar: 5, staf: 1, alumni: 4, awam: 3 };

export function runPlan(mode, role, date = new Date()) {
  if (!Object.hasOwn(MODE_LABELS, mode)) mode = 'destination';
  if (mode === 'endless') return { mode, key: null, finishAt: null, destination: null };
  const day = mode === 'daily' ? todayKL(date) : null;
  const checkpoint = mode === 'daily' ? 4 : (DESTINATIONS[role] ?? DESTINATIONS.pelajar);
  const key = `${COURSE_VERSION}:${mode}:${day ?? role}`;
  return {
    mode, key, day, seed: hashString(key),
    finishAt: checkpointAt(checkpoint),
    destination: landmarkFor(checkpoint),
  };
}
