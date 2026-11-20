// Version the course identity whenever generation, physics or tuning changes.
import { hashString, todayKL } from '../../shared/rng.js';
import { checkpointAt, landmarkFor } from './course.js';
import { LANDMARKS } from './config.js';

export const COURSE_VERSION = 'kl-6';
export const MODE_LABELS = { destination: 'Tepat Masa', daily: 'Cabaran Harian', endless: 'Tanpa Henti' };
const DESTINATIONS = { pelajar: 'fakulti', staf: 'saas', alumni: 'datc', awam: 'ptar' };

export function runPlan(mode, role, date = new Date()) {
  if (!Object.hasOwn(MODE_LABELS, mode)) mode = 'destination';
  if (mode === 'endless') return { mode, key: null, finishAt: null, destination: null };
  const day = mode === 'daily' ? todayKL(date) : null;
  const destinationType = mode === 'daily' ? 'datc' : (DESTINATIONS[role] ?? DESTINATIONS.pelajar);
  const checkpoint = LANDMARKS.findIndex((landmark) => landmark.type === destinationType) - 1;
  const key = `${COURSE_VERSION}:${mode}:${day ?? role}`;
  return {
    mode, key, day, seed: hashString(key),
    finishAt: checkpointAt(checkpoint),
    destination: landmarkFor(checkpoint),
  };
}
