-- Teka Kata UiTM: leaderboard schema.
-- Run in the Supabase SQL editor. Safe to re-run: the table and indexes are created if
-- missing, and every function is dropped and recreated, so the result is always the same.
--
-- Security model:
--   * RLS is on and there are NO table policies, so anon/authenticated can't read or write
--     cg_scores directly (player_id stays private).
--   * The browser can only call these SECURITY DEFINER functions:
--       cg_submit       validate a won round, compute its score server-side, insert it,
--                       and return the score and the player's rank
--       cg_top_total    players by cumulative points, play time and games:
--                       one day ("Hari Ini") or all time ("Keseluruhan")
--       cg_campus_rank  campuses by cumulative points, play time, games and players
--   * The game is client-trusted (elapsed seconds come from the browser), so the checks
--     below bound abuse; they can't fully prevent it.

-- ---------------------------------------------------------------- table

create table if not exists public.cg_scores (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  player_id     uuid        not null,
  nickname      text        not null check (char_length(nickname) between 1 and 20),
  user_type     text        not null check (user_type in ('pelajar', 'staf', 'alumni', 'awam')),
  campus        text        not null check (char_length(campus) between 1 and 60),
  mode          text        not null check (mode in ('daily', 'free')),
  play_date     date        not null,
  phrase_id     int         not null check (phrase_id between 1 and 9999),
  hidden_count  int         not null check (hidden_count between 1 and 200),
  seconds       int         not null check (seconds between 1 and 3600),
  mistakes      smallint    not null check (mistakes between 0 and 2),
  score         int         not null check (score >= 0)
);

alter table public.cg_scores enable row level security;
revoke all on table public.cg_scores from anon, authenticated;

-- ---------------------------------------------------------------- indexes
-- One per query that needs it. The all-time and campus boards aggregate the whole table,
-- which a sequential scan does best, so they get none.

-- One daily-challenge score per player per day (also the duplicate check in cg_submit).
create unique index if not exists cg_scores_daily_once
  on public.cg_scores (player_id, play_date) where mode = 'daily';
-- cg_submit's 10-second rate limit: this player's newest rows.
create index if not exists cg_scores_player_recent
  on public.cg_scores (player_id, created_at desc);
-- Hari Ini board and a daily game's rank: one day's rows.
create index if not exists cg_scores_play_date
  on public.cg_scores (play_date);
-- Indexes for the first, best-score boards; nothing uses them now.
drop index if exists public.cg_scores_daily_rank;
drop index if exists public.cg_scores_player_best;

-- ---------------------------------------------------------------- functions

drop function if exists public.cg_top(text, date, uuid, int);  -- first, best-score boards
drop function if exists public.cg_top_total(uuid, int);         -- first version, no date
drop function if exists public.cg_top_total(uuid, date, int);
drop function if exists public.cg_campus_rank(int);
drop function if exists public.cg_player_totals(date);

-- Keep identical to computeScore() in js/score.js. Integer maths only.
create or replace function public.cg_compute_score(p_hidden int, p_seconds int, p_mistakes int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_mistakes between 0 and 2 then
    ((p_hidden * 50 + greatest(0, p_hidden * 8 - p_seconds) * 10)
      * (case p_mistakes when 0 then 100 when 1 then 70 else 40 end) + 50) / 100
  else 0 end;
$$;

-- Every player's totals over one day (p_play_date) or all time (null), ranked: points,
-- then less time, then who played first. Nickname, type and campus are from the player's
-- latest round in the range. One pass over the rows. Internal: shared by cg_top_total
-- (the boards) and cg_submit (the rank after a game) so both always agree.
create function public.cg_player_totals(p_play_date date)
returns table (
  rank           bigint,
  player_id      uuid,
  nickname       text,
  user_type      text,
  campus         text,
  total_score    bigint,
  total_seconds  bigint,
  games          bigint
)
language sql
stable
set search_path = ''
as $$
  select row_number() over (
           order by sum(s.score) desc, sum(s.seconds) asc, min(s.created_at) asc
         ),
         s.player_id,
         (array_agg(s.nickname  order by s.created_at desc))[1],
         (array_agg(s.user_type order by s.created_at desc))[1],
         (array_agg(s.campus    order by s.created_at desc))[1],
         sum(s.score)::bigint,
         sum(s.seconds)::bigint,
         count(*)
  from public.cg_scores s
  where p_play_date is null or s.play_date = p_play_date
  group by s.player_id;
$$;

create or replace function public.cg_submit(
  p_player_id  uuid,
  p_nickname   text,
  p_user_type  text,
  p_campus     text,
  p_mode       text,
  p_play_date  date,
  p_phrase_id  int,
  p_hidden     int,
  p_seconds    int,
  p_mistakes   int
)
returns table (score int, rank bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_score int;
begin
  if p_player_id is null or p_mode is null or p_mode not in ('daily', 'free') then
    raise exception 'Data permainan tidak sah' using errcode = '22023';
  end if;
  if p_play_date is null or p_play_date not between v_today - 1 and v_today + 1 then
    raise exception 'Tarikh permainan tidak sah' using errcode = '22023';
  end if;
  if p_hidden is null or p_seconds is null or p_mistakes is null
     or p_hidden not between 1 and 200 or p_mistakes not between 0 and 2 then
    raise exception 'Data permainan tidak sah' using errcode = '22023';
  end if;
  -- Nobody decodes a cryptogram faster than half a second per letter.
  if p_seconds < ceil(p_hidden / 2.0) then
    raise exception 'Masa tidak munasabah' using errcode = '22023';
  end if;
  -- Before the rate limit, so a retried submit gets "already recorded", not "too often".
  if p_mode = 'daily' and exists (
    select 1 from public.cg_scores s
    where s.player_id = p_player_id and s.mode = 'daily' and s.play_date = p_play_date
  ) then
    raise exception 'Markah Cabaran Harian sudah direkodkan' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.cg_scores s
    where s.player_id = p_player_id and s.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Terlalu kerap. Cuba sebentar lagi.' using errcode = '22023';
  end if;

  v_score := public.cg_compute_score(p_hidden, p_seconds, p_mistakes);

  insert into public.cg_scores
    (player_id, nickname, user_type, campus, mode, play_date, phrase_id,
     hidden_count, seconds, mistakes, score)
  values
    (p_player_id, btrim(p_nickname), p_user_type, btrim(p_campus), p_mode, p_play_date,
     p_phrase_id, p_hidden, p_seconds, p_mistakes, v_score);

  -- The player's place on the board this game counts towards: a daily game on today's
  -- (Hari Ini), a free game on all time (Keseluruhan).
  return query
    select v_score, t.rank
    from public.cg_player_totals(case when p_mode = 'daily' then p_play_date end) t
    where t.player_id = p_player_id;
end;
$$;

-- Hari Ini (p_play_date given) or Keseluruhan (null) board, top p_limit (1–100), plus the
-- caller's own row (p_player_id) when they're further down, so they can see where they
-- stand. player_id never leaves the database; is_me marks the caller's row.
create function public.cg_top_total(
  p_player_id  uuid default null,
  p_play_date  date default null,
  p_limit      int  default 50
)
returns table (
  rank           bigint,
  nickname       text,
  user_type      text,
  campus         text,
  total_score    bigint,
  total_seconds  bigint,
  games          bigint,
  is_me          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.rank, t.nickname, t.user_type, t.campus, t.total_score, t.total_seconds, t.games,
         coalesce(t.player_id = p_player_id, false)
  from public.cg_player_totals(p_play_date) t
  where t.rank <= least(greatest(coalesce(p_limit, 50), 1), 100)
     or t.player_id = p_player_id
  order by t.rank;
$$;

-- Kampus board: campuses by the cumulative points of every round played under them, with
-- play time, rounds and players. Ties go to less time. Top p_limit (1–100).
create function public.cg_campus_rank(p_limit int default 50)
returns table (
  rank           bigint,
  campus         text,
  players        bigint,
  total_score    bigint,
  total_seconds  bigint,
  games          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by sum(s.score) desc, sum(s.seconds) asc),
         s.campus,
         count(distinct s.player_id),
         sum(s.score)::bigint,
         sum(s.seconds)::bigint,
         count(*)
  from public.cg_scores s
  group by s.campus
  order by 1
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- ---------------------------------------------------------------- access
-- Functions are executable by everyone by default; only the three API functions stay so.

revoke all on function public.cg_compute_score(int, int, int) from public, anon, authenticated;
revoke all on function public.cg_player_totals(date) from public, anon, authenticated;
revoke all on function public.cg_submit(uuid, text, text, text, text, date, int, int, int, int) from public;
revoke all on function public.cg_top_total(uuid, date, int) from public;
revoke all on function public.cg_campus_rank(int) from public;
grant execute on function public.cg_submit(uuid, text, text, text, text, date, int, int, int, int) to anon, authenticated;
grant execute on function public.cg_top_total(uuid, date, int) to anon, authenticated;
grant execute on function public.cg_campus_rank(int) to anon, authenticated;
