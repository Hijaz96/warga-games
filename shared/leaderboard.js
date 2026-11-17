// Boards for any game in Arked Warga, from Supabase (arcade repo: supabase/arked.sql), over
// plain fetch: recording a round, and the Hari Ini / Keseluruhan / Kampus lists.
// (Teka Kata keeps its own cg_* boards in teka-kata/js/leaderboard.js.)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { userTypeLabel } from './profile-options.js';

export const boardsConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers() {
  const h = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys don't.
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

export async function rpc(name, body, fetchImpl = globalThis.fetch) {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${name}`;
  let res;
  try {
    res = await fetchImpl(url, {
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

/** Records one finished round for `game` with the player's profile. */
export const recordRound = ({ game, profile, points, seconds }, fetchImpl) =>
  rpc(
    'arked_record',
    {
      p_player_id: profile.playerId,
      p_game: game,
      p_points: points,
      p_seconds: seconds,
      p_nickname: profile.nickname,
      p_user_type: profile.userType,
      p_campus: profile.campus,
    },
    fetchImpl,
  );

/**
 * Players by total points for `game` (null = every game): one day (`date`, YYYY-MM-DD) or all
 * time (null). Top 50 plus the caller's own row. Rows: { rank, nickname, user_type, campus,
 * total_points, total_seconds, plays, is_me }.
 */
export const topPlayers = (game, playerId, date = null, fetchImpl) =>
  rpc('arked_top', { p_game: game, p_player_id: playerId ?? null, p_play_date: date, p_limit: 50 }, fetchImpl);

/** Campuses by total points for `game`. Rows: { rank, campus, players, total_points, total_seconds, plays }. */
export const topCampuses = (game, fetchImpl) => rpc('arked_campus_rank', { p_game: game, p_limit: 50 }, fetchImpl);

/** Total play time: "45s", "12m 30s", "3j 05m". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (hrs) return `${hrs}j ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

function h(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function rankCell(rank) {
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[rank];
  return h('span', `lb-rank${medal ? ' medal' : ''}`, medal ?? String(rank));
}

/** Hari Ini / Keseluruhan list (Teka Kata's look). Rounds played ("4x") only when `showPlays`. */
export function playersList(rows, { showPlays = false } = {}) {
  const ol = h('ol', 'lb-list');
  let prevRank = 0;
  for (const r of rows) {
    // Top 50 plus the player's own row further down: mark the jump in rank.
    if (Number(r.rank) > prevRank + 1) {
      const gap = h('li', 'lb-gap');
      gap.setAttribute('aria-hidden', 'true');
      gap.append(h('span', null, '⋯'));
      ol.append(gap);
    }
    prevRank = Number(r.rank);
    const li = h('li', `lb-row${r.is_me ? ' me' : ''}`);
    const who = h('div', 'lb-who');
    const name = h('div', 'lb-name');
    name.append(h('span', null, r.nickname), h('span', `badge badge-${r.user_type}`, userTypeLabel(r.user_type)));
    const meta = [`⏱ ${formatDuration(Number(r.total_seconds))}`];
    if (showPlays) meta.push(`${r.plays}x`);
    if (r.user_type !== 'awam') meta.push(r.campus); // Orang Awam: no campus
    who.append(name, h('div', 'lb-meta', meta.join(' · ')));
    li.append(rankCell(Number(r.rank)), who, h('span', 'lb-score', Number(r.total_points).toLocaleString('ms-MY')));
    ol.append(li);
  }
  return ol;
}

/** Kampus list; the player's own campus is highlighted. */
export function campusList(rows, myCampus) {
  const ol = h('ol', 'lb-list');
  for (const r of rows) {
    const li = h('li', `lb-row${r.campus === myCampus ? ' me' : ''}`);
    const who = h('div', 'lb-who');
    who.append(h('div', 'lb-name', r.campus), h('div', 'lb-meta', `⏱ ${formatDuration(Number(r.total_seconds))} · ${r.players} pemain`));
    li.append(rankCell(Number(r.rank)), who, h('span', 'lb-score', Number(r.total_points).toLocaleString('ms-MY')));
    ol.append(li);
  }
  return ol;
}
