# Warga Games

The games of [Arked Warga](https://nullifye.github.io/arcade/), the game hub in UiTM's
AppsWarga app (hub repo: `nullifye/arcade`). Static site on GitHub Pages, no build step.

| Game | Path | Live |
|---|---|---|
| Teka Kata (cryptogram) | [`teka-kata/`](teka-kata/) | https://nullifye.github.io/warga-games/teka-kata/ |
| Ular (snake) | [`ular/`](ular/) | https://nullifye.github.io/warga-games/ular/ |
| Duga Kata (5-letter word guess) | [`duga-kata/`](duga-kata/) | https://nullifye.github.io/warga-games/duga-kata/ |
| Kejar Lapan (3D voxel runner) | [`kejar-lapan/`](kejar-lapan/) | https://nullifye.github.io/warga-games/kejar-lapan/ |

The site root redirects to the hub.

## Run locally

```sh
npm run serve   # http://localhost:8080/warga-games/ular/  (the hub at /arcade/ from ../arked)
npm test        # node --test: shared/, teka-kata/, ular/, duga-kata/, kejar-lapan/
```

## Shared code (`shared/`)

One copy for every game; games import it with `../../shared/…`.

| File | What |
|---|---|
| `appswarga.js` | AppsWarga bridge: theme, close button, `ready`, haptic, share, user-type lock |
| `shared-store.js` | Profile and progress shared with the hub, across hosts (AppsWarga bridge storage). Keep identical to the hub's copy |
| `arked-link.js` | `?dari=arked`: the ‹ back-to-Arked button, and share links without it |
| `profile.js` | The profile chip and dialog (shared `arked.profile`) |
| `leaderboard.js` | `arked_record` / `arked_top` / `arked_campus_rank` and the board lists |
| `rng.js` | Seeded PRNG, shuffle and Malaysia-time dates, for daily puzzles everyone shares |
| `base.css` | Tokens, buttons, header, top bar, leaderboard, dialogs, dropdown, toast |
| `select.js`, `profile-options.js`, `config.js`, `uuid.js`, `reload.js` | Dropdown, user types and campuses, Supabase settings, ids, fresh reload |

The hub keeps its own copies of `appswarga.js`, `select.js`, `profile-options.js`,
`config.js` and `shared-store.js`; change both when they change.

## Adding a game

1. Make a folder (e.g. `kuiz/`) with `index.html` linking `../shared/base.css`; see `ular/` for
   the profile chip, dialog, ‹ button and board markup.
2. In its script: `initFromArked()`, `initAppsWarga()`, `initProfile()`; write
   `arked.game.<id>` when a round starts; send each round with `recordRound()`; show boards
   with `topPlayers()` / `topCampuses()`.
3. Supabase (hub repo `supabase/arked.sql`): add the game to `arked_games` with its point bounds.
4. Hub: add it to `js/games.js` with `url: 'https://nullifye.github.io/warga-games/<folder>/'`.

## Ular

- 20×20 board; the snake speeds up from 140 ms to 75 ms a step as it eats.
- **Dinding** on: hitting the edge ends the game, 15 points a food. Off: the snake wraps
  around, 10 points a food. Hitting itself always ends it.
- **D-pad** on or off; swiping on the board and arrow keys / WASD always work.
- Pauses when the page is hidden or AppsWarga goes to the background.
- Rules in `ular/js/snake.js` (unit-tested); every round with points goes to `arked_record`.

## Duga Kata

- Guess a 5-letter Malay word in 6 tries. Each guess is marked tile by tile: **hijau** (right
  letter, right place), **kuning** (in the word, elsewhere), **kelabu** (not in the word).
  Repeated letters are marked only as often as the answer has them.
- **Cabaran Harian**: the same word for everyone, new at midnight Malaysia time (`dk.daily`
  resumes it after a reload; the clock keeps running). **Main Bebas**: random words, no limit.
- A guess must be in `duga-kata/js/words.js` (`ANSWERS` + `GUESSES`); a word not in the lists
  shakes the row and doesn't use a try. **The lists are a hand-written draft: have them reviewed
  before launch.** Changing `ANSWERS` reshuffles which word falls on which day.
- Score: 1,000 / 800 / 600 / 450 / 300 / 200 for a win in 1–6 guesses, plus 2 a second under
  3 minutes; a loss is 0 and still counts as a play. Every round goes to `arked_record`.
- Rules in `duga-kata/js/logic.js`, score in `score.js` (both unit-tested).

## Kejar Lapan

- A three-lane voxel runner through UiTM Shah Alam (Three.js 0.170.0, vendored in
  `kejar-lapan/vendor/` with its licence; no CDN, no build step).
- The campus clock runs from 07:55 to 8:00. Each landmark (Kolej Perindu, Menara SAAS, Masjid,
  PTAR, DATC, FSKM, Kejuruteraan, round and round) is a checkpoint that adds time: +16 s, one
  less each time, at least +8 s. Crash or reach 8:00 and the run ends.
- **Tepat Masa** (default): a repeatable route to the role's destination: Pelajar → FSKM
  (2.4 km), Staf → Menara SAAS (640 m), Alumni → DATC (1.9 km), Awam → PTAR (1.44 km).
  Arrive before 8:00 to win. The finish awards checkpoint points but no extra clock time.
- **Cabaran Harian**: everyone runs the same seeded 1.9 km route to DATC, regardless of role.
  A new route starts at midnight Malaysia time. **Tanpa Henti** keeps the random endless run.
- **Bayang rekod**: optional translucent replay of the best attempt on the same route, stored
  locally on this device. Completed runs rank by fastest finish, then score; unfinished runs
  rank by furthest distance, then score. Sparse inputs replay at fixed simulation ticks; pauses
  do not advance the ghost, which cannot collide with the player or take their items. Only the
  latest daily record and one record per destination role are retained. Course identities are
  versioned in `js/modes.js`; bump `COURSE_VERSION` after physics, tuning or generation changes.
  The existing leaderboards continue to aggregate scores from all modes.
- Lompat (jump) kon, lubang, monyet; tunduk (slide) under palang; go round bas and kereta.
  Swipe, arrow keys / WASD / Space, or the on-screen buttons (a setting).
- The character comes from the profile (Pelajar, Staf, Alumni, Awam) and can be switched; items
  only change look: points (+25), boost (5 s, smashes obstacles), shield (one hit), jam (+5 s).
- Score: a point a metre, plus items, plus 200 a checkpoint; every run with points goes to
  `arked_record` (at most 100,000 points and 300 a second). Distance shows in m, then km.
- `js/sim.js` (fixed 60 Hz steps, swept collision) and `js/course.js` (seeded rows that always
  leave a way through) are pure and unit-tested, including a bot that clears 4 km of 30 courses.
  `js/render.js` draws the sim's state with merged voxel models and pools, so memory stays flat.
- Tuning lives in `js/config.js`. `?debug` exposes `window.__kl` for browser tests.
