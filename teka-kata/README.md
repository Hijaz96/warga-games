# Teka Kata UiTM

A Bahasa Melayu cryptogram game about UiTM and Malaysia. Every letter is replaced by a unique
number; players decode the phrase with an on-screen keyboard (◀ ▶ jump between blanks).
Three mistakes ends the round. Faster solves with fewer mistakes score higher, and scores go to a
shared Supabase leaderboard (today / overall / per campus).

Plain HTML + CSS + ES modules — no build step, no dependencies. Part of the `warga-games` repo,
served at https://nullifye.github.io/warga-games/teka-kata/ and played from Arked Warga
(https://nullifye.github.io/arcade/). It imports the repo's `../shared/` modules (AppsWarga
bridge, shared profile store, dropdown, profile options, Supabase config, back-to-Arked link).

## Run locally

From the repo root (see the root README):

```bash
npm run serve   # then open http://localhost:8080/warga-games/teka-kata/
npm test        # every unit test in the repo (node --test, Node 18+)
```

ES modules need to be served over HTTP; opening `index.html` from the file system won't work.

## Leaderboard setup (Supabase)

The game plays fully offline. Until `../shared/config.js` is filled in, the leaderboard shows
“Papan markah belum dikonfigurasi”.

1. Create a new Supabase project (region **ap-southeast-1 / Singapore** is closest to Malaysia).
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and run it.
   It creates the `cg_scores` table and the `cg_submit`, `cg_top_total` and `cg_campus_rank` functions.
   The script is safe to re-run.
3. In **Project Settings → API**, copy the **Project URL** and the **publishable key**
   (`sb_publishable_…`; a legacy `anon` key also works) into [`shared/config.js`](../shared/config.js).
4. Commit and push.

The publishable key is meant to be public. The table has RLS on with no policies, so the browser can
only call the three `cg_*` functions. Scores are computed in the database from time and mistakes, and
the function rejects impossible times, a second daily entry per player, and submissions less than 10 s apart.
The timer still runs in the browser, so a determined cheater can fake their time. That's an
acceptable trade-off for a casual game.

## Deploy

Pushing the `warga-games` repo publishes it (GitHub Pages, branch `main`, root).

## Scoring

```
H      = blank letter cells at the start
score  = round_half_up((H*50 + max(0, H*8 - seconds)*10) * [100%, 70%, 40%][mistakes])
```

- Ranking is by score, then by time.
- `js/score.js` and `public.cg_compute_score` in the schema must stay identical. A unit test pins the formula.

## Editing content

- **Phrases:** [`js/phrases.js`](js/phrases.js). Each phrase is `{ id, cat, text, fact }`.
  - Never reuse or renumber an `id`, because ids are stored with scores.
  - Only A–Z are encrypted; digits and punctuation are shown as-is.
  - Adding or removing phrases reshuffles the daily-challenge order.
- **Campuses and user types:** [`shared/profile-options.js`](../shared/profile-options.js).
  - If you add a user type, also update the `user_type` check in the schema.

## How it works

| File | Role |
|---|---|
| `js/game.js` | Pure puzzle engine: cipher, reveal, guesses, blank navigation, daily phrase pick |
| `js/rng.js` | Seeded PRNG, so everyone gets the same daily puzzle (Malaysia time) |
| `js/board.js` | Puzzle grid + keyboard rendering and animations |
| `js/main.js` | Hash router (`#/`, `#/harian`, `#/bebas`, `#/keputusan`, `#/papan`), profile, results, leaderboard |
| `js/leaderboard.js` | Supabase RPC calls via `fetch` |

- **Daily progress:** stored in `localStorage`, so a reload resumes the same puzzle with the clock still running.
- **Player identity:** a random `playerId` is stored in `localStorage`. It is never shown on the leaderboard.
