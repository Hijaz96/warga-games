// Supabase leaderboard over plain fetch (PostgREST RPC). No SDK needed.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers() {
  const h = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys don't.
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

async function rpc(name, body) {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${name}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Tiada sambungan ke pelayan.'), { code: 'network' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(data?.message || `Ralat pelayan (${res.status}).`), { code: data?.code });
  }
  return data;
}

/** Returns { score, rank }. Throws with code '23505' if today's daily score already exists. */
export async function submitScore(r) {
  const rows = await rpc('cg_submit', {
    p_player_id: r.playerId,
    p_nickname: r.nickname,
    p_user_type: r.userType,
    p_campus: r.campus,
    p_mode: r.mode,
    p_play_date: r.date,
    p_phrase_id: r.phraseId,
    p_hidden: r.hidden,
    p_seconds: r.seconds,
    p_mistakes: r.mistakes,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Player boards ranked by cumulative points, with total play time and games played:
 * one day's games (Hari Ini) or all time (Keseluruhan).
 * Rows: { rank, nickname, user_type, campus, total_score, total_seconds, games, is_me }.
 */
export const topDaily = (date, playerId) =>
  rpc('cg_top_total', { p_player_id: playerId ?? null, p_play_date: date });

export const topAllTime = (playerId) => rpc('cg_top_total', { p_player_id: playerId ?? null });

export const campusRanking = () => rpc('cg_campus_rank', {});
