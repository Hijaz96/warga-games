// Kejar Lapan: showing numbers. The score itself is counted in sim.js (one point a metre, plus
// items and checkpoints) and capped by arked_record (hub repo, supabase/arked.sql: arked_games,
// max_points / max_points_per_sec); keep config.js SERVER in step with that row.
import { CLOCK } from './config.js';

/** Display a course's YYYY-MM-DD key as DD-MM-YYYY, without timezone conversion. */
export const formatDate = (day) => day.split('-').reverse().join('-');

/** "850 m" below a kilometre, then "1.25 km". */
export function formatDistance(metres) {
  const m = Math.max(0, Math.floor(metres));
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(2)} km`;
}

/** A run's length: "0:45", "3:07". */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The campus clock for `timeLeft` real seconds before 8:00: "07:55:00". */
export function formatClock(timeLeft) {
  const campus = Math.max(0, Math.ceil(8 * 3600 - timeLeft * CLOCK.scale));
  const h = Math.floor(campus / 3600);
  const m = Math.floor((campus % 3600) / 60);
  const s = campus % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** "1,250" in Malaysian style. */
export const formatPoints = (n) => Math.floor(n).toLocaleString('ms-MY');
