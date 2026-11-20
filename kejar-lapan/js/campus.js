// Shared area identity for course generation, roadside scenery and music.
import { CHECKPOINTS, LANDMARKS } from './config.js';

export const CAMPUS_AREAS = {
  civic: { label: 'Laluan Canselori', grass: 0xe5edcf, walk: 0xf5e7d3, fog: 0xdbeafe, jumpers: ['cone', 'cone', 'pothole'], blockers: ['car', 'bus'], slideChance: 0.3 },
  college: { label: 'Kawasan Kolej', grass: 0xd9f0c4, walk: 0xf5dbc9, fog: 0xe0eddf, jumpers: ['monkey', 'monkey', 'cone'], blockers: ['car', 'car', 'bus'], slideChance: 0.15 },
  library: { label: 'Laman PTAR', grass: 0xd8ead4, walk: 0xe6e0ce, fog: 0xe2edf0, jumpers: ['cone', 'pothole'], blockers: ['car'], slideChance: 0.65 },
  mosque: { label: 'Laman Masjid', grass: 0xcce5d4, walk: 0xfaf0d7, fog: 0xe1f0ed, jumpers: ['cone'], blockers: ['car'], slideChance: 0.4 },
  sports: { label: 'Kawasan Sukan', grass: 0xbce7bd, walk: 0xeac5aa, fog: 0xd9edfa, jumpers: ['cone', 'cone', 'pothole'], blockers: ['bus'], slideChance: 0.6 },
  health: { label: 'Laman Kesihatan', grass: 0xd0ebda, walk: 0xe1eeee, fog: 0xe1f2ef, jumpers: ['cone', 'cone', 'pothole'], blockers: ['car'], slideChance: 0.2 },
  engineering: { label: 'Zon Kejuruteraan', grass: 0xd9decb, walk: 0xd4dae0, fog: 0xe5e9ed, jumpers: ['cone', 'pothole', 'pothole'], blockers: ['bus', 'car'], slideChance: 0.5 },
  faculty: { label: 'Laluan Fakulti', grass: 0xd8e8c8, walk: 0xe0d9ed, fog: 0xe7e8f5, jumpers: ['cone', 'monkey', 'pothole'], blockers: ['car', 'bus'], slideChance: 0.45 },
  plaza: { label: 'Dataran Cendekia', grass: 0xe0e9ca, walk: 0xf5dfc5, fog: 0xe4edf5, jumpers: ['cone', 'monkey'], blockers: ['car'], slideChance: 0.35 },
};

const LANDMARK_AREAS = {
  gate: 'civic', canselori: 'civic', saas: 'civic', datc: 'civic',
  seroja: 'college', kolej: 'college', mawar: 'college',
  ptar: 'library', masjid: 'mosque', sukan: 'sports', stadium: 'sports',
  kesihatan: 'health', engineering: 'engineering', fakulti: 'faculty', cendekia: 'plaza',
};

/** The stretch approaching the next landmark; changes exactly when a checkpoint is passed. */
export function campusAt(distance) {
  const d = Math.max(0, distance);
  const a = CHECKPOINTS.grow / 2;
  const b = CHECKPOINTS.first - a;
  const passed = Math.floor(a ? (2 * d) / (Math.sqrt(b * b + 4 * a * d) + b) : d / b);
  const landmark = LANDMARKS[1 + passed % (LANDMARKS.length - 1)];
  const id = LANDMARK_AREAS[landmark.type];
  return { id, landmark, ...CAMPUS_AREAS[id] };
}
