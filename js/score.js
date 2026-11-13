// Scoring. Must stay identical to public.cg_compute_score in supabase/schema.sql,
// which is the source of truth for the leaderboard. Integer maths only, so JS and SQL agree.

/** Score multiplier (percent) for 0, 1 and 2 mistakes. Three mistakes ends the game. */
export const MISTAKE_PCT = [100, 70, 40];
export const POINTS_PER_LETTER = 50;
export const PAR_SECONDS_PER_LETTER = 8;
export const POINTS_PER_SECOND_SAVED = 10;

export function computeScore(hidden, seconds, mistakes) {
  if (!(mistakes >= 0 && mistakes < MISTAKE_PCT.length)) return 0;
  const base = hidden * POINTS_PER_LETTER;
  const timeBonus = Math.max(0, hidden * PAR_SECONDS_PER_LETTER - seconds) * POINTS_PER_SECOND_SAVED;
  return Math.floor(((base + timeBonus) * MISTAKE_PCT[mistakes] + 50) / 100);
}

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
