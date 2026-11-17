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

Teka Kata uses the same boards as every Arked Warga game (`shared/leaderboard.js`):
`arked_record` for each won round (`daily: true` for the Cabaran Harian), and `arked_top` /
`arked_campus_rank` for Hari Ini, Keseluruhan and Kampus. The SQL is in the hub repo
(`nullifye/arcade`, `supabase/arked.sql`).

The database allows one Cabaran Harian round per player per day, at most 10,000 points and 260
points a second per round, and one round every 10 s. The score is worked out in the browser
(`js/score.js`) and the timer runs there too, so a determined cheater could fake them; those
limits bound it. That's an acceptable trade-off for a casual game.

## Deploy

Pushing the `warga-games` repo publishes it (GitHub Pages, branch `main`, root).

## Scoring

```
H      = blank letter cells at the start
score  = round_half_up((H*50 + max(0, H*8 - seconds)*10) * [100%, 70%, 40%][mistakes])
```

- Boards rank by total points, then by less time.
- If the formula changes, check `teka-kata`'s limits in `arked.sql` (`max_points`, `max_points_per_sec`).

## Editing content

- **Phrases:** [`js/phrases.js`](js/phrases.js). Each phrase is `{ id, cat, text, fact }`.
  - Never reuse or renumber an `id`, because ids are stored with scores.
  - Only A–Z are encrypted; digits and punctuation are shown as-is.
  - Adding or removing phrases reshuffles the daily-challenge order.
- **Campuses and user types:** [`shared/profile-options.js`](../shared/profile-options.js).
  - If you add a user type, also update the `user_type` checks in `arked.sql`.

## How it works

| File | Role |
|---|---|
| `js/game.js` | Pure puzzle engine: cipher, reveal, guesses, blank navigation, daily phrase pick |
| `js/rng.js` | Seeded PRNG, so everyone gets the same daily puzzle (Malaysia time) |
| `js/board.js` | Puzzle grid + keyboard rendering and animations |
| `js/main.js` | Hash router (`#/`, `#/harian`, `#/bebas`, `#/keputusan`, `#/papan`), profile, results, leaderboard |

- **Daily progress:** stored in `localStorage`, so a reload resumes the same puzzle with the clock still running.
- **Player identity:** a random `playerId` is stored in `localStorage`. It is never shown on the leaderboard.
