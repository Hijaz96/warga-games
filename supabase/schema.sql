-- Teka Kata UiTM: leaderboard schema.
-- Run once in the Supabase SQL editor of a new project. Safe to re-run.
--
-- Security model:
--   * RLS is on and there are NO table policies, so anon/authenticated can't read
--     or write cg_scores directly (player_id stays private).
--   * All access goes through SECURITY DEFINER functions:
--       cg_submit       validate input, compute the score server-side, insert
--       cg_top          daily / all-time top lists (no player_id exposed)
--       cg_campus_rank  per-campus totals
--   * The game is client-trusted (elapsed seconds come from the browser), so the
--     checks below bound abuse; they can't fully prevent it.

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

-- One daily-challenge score per player per day.
create unique index if not exists cg_scores_daily_once
  on public.cg_scores (player_id, play_date) where mode = 'daily';
create index if not exists cg_scores_daily_rank
  on public.cg_scores (play_date, score desc, seconds) where mode = 'daily';
create index if not exists cg_scores_player_best
  on public.cg_scores (player_id, score desc, seconds);
create index if not exists cg_scores_player_recent
  on public.cg_scores (player_id, created_at desc);

alter table public.cg_scores enable row level security;
revoke all on table public.cg_scores from anon, authenticated;

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
  v_nick  text := btrim(p_nickname);
  v_score int;
begin
  if p_player_id is null then
    raise exception 'ID pemain tiada' using errcode = '22023';
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
  -- Checked before the rate limit so a retried submit gets "already recorded", not "too often".
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
    (p_player_id, v_nick, p_user_type, btrim(p_campus), p_mode, p_play_date, p_phrase_id,
     p_hidden, p_seconds, p_mistakes, v_score);

  if p_mode = 'daily' then
    return query
      select v_score,
             1 + count(*)
      from public.cg_scores s
      where s.mode = 'daily' and s.play_date = p_play_date
        and (s.score > v_score or (s.score = v_score and s.seconds < p_seconds));
  else
    -- All-time rank: players whose personal best beats this score.
    return query
      select v_score,
             1 + count(*)
      from (
        select s.player_id, max(s.score) as best
        from public.cg_scores s
        where s.player_id <> p_player_id
        group by s.player_id
      ) b
      where b.best > v_score;
  end if;
end;
$$;

create or replace function public.cg_top(
  p_board      text,                 -- 'daily' | 'alltime'
  p_play_date  date default null,
  p_player_id  uuid default null,
  p_limit      int  default 50
)
returns table (
  rank       bigint,
  nickname   text,
  user_type  text,
  campus     text,
  score      int,
  seconds    int,
  mistakes   smallint,
  is_me      boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with pool as (
    select s.*
    from public.cg_scores s
    where p_board = 'daily' and s.mode = 'daily' and s.play_date = p_play_date
    union all
    select b.*
    from (
      select distinct on (s.player_id) s.*
      from public.cg_scores s
      order by s.player_id, s.score desc, s.seconds asc, s.created_at asc
    ) b
    where p_board = 'alltime'
  )
  select row_number() over (order by p.score desc, p.seconds asc, p.created_at asc),
         p.nickname, p.user_type, p.campus, p.score, p.seconds, p.mistakes,
         coalesce(p.player_id = p_player_id, false)
  from pool p
  order by 1
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.cg_campus_rank(p_limit int default 50)
returns table (rank bigint, campus text, players bigint, total_score bigint, best_score int)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (s.player_id) s.player_id, s.campus, s.score
    from public.cg_scores s
    order by s.player_id, s.score desc, s.seconds asc
  )
  select row_number() over (order by sum(b.score) desc, count(*) desc),
         b.campus, count(*), sum(b.score), max(b.score)
  from best b
  group by b.campus
  order by 1
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Only the three API functions are callable from the browser.
revoke all on function public.cg_compute_score(int, int, int) from public, anon, authenticated;
revoke all on function public.cg_submit(uuid, text, text, text, text, date, int, int, int, int) from public;
revoke all on function public.cg_top(text, date, uuid, int) from public;
revoke all on function public.cg_campus_rank(int) from public;
grant execute on function public.cg_submit(uuid, text, text, text, text, date, int, int, int, int) to anon, authenticated;
grant execute on function public.cg_top(text, date, uuid, int) to anon, authenticated;
grant execute on function public.cg_campus_rank(int) to anon, authenticated;
