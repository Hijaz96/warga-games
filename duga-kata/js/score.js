// Scoring. The score is sent to arked_record (hub repo, supabase/arked.sql), which caps it with
// duga-kata's max_points / max_points_per_sec; keep those in step if the formula changes.

/** Points for a win in 1, 2, … 6 guesses. */
export const GUESS_POINTS = [1000, 800, 600, 450, 300, 200];
/** Seconds under this earn a time bonus… */
export const PAR_SECONDS = 180;
/** …of this many points a second. */
export const POINTS_PER_SECOND_SAVED = 2;

/** A finished round's points: 0 for a loss. */
export function computeScore(won, guesses, seconds) {
  if (!won || !(guesses >= 1 && guesses <= GUESS_POINTS.length)) return 0;
  const bonus = Math.max(0, PAR_SECONDS - Math.max(0, Math.floor(seconds))) * POINTS_PER_SECOND_SAVED;
  return GUESS_POINTS[guesses - 1] + bonus;
}

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
