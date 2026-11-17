# Warga Games

The games of [Arked Warga](https://nullifye.github.io/arcade/), the game hub in UiTM's
AppsWarga app (hub repo: `nullifye/arcade`). Static site on GitHub Pages, no build step.

| Game | Path | Live |
|---|---|---|
| Teka Kata (cryptogram) | [`teka-kata/`](teka-kata/) | https://nullifye.github.io/warga-games/teka-kata/ |
| Ular (snake) | [`ular/`](ular/) | https://nullifye.github.io/warga-games/ular/ |

The site root redirects to the hub.

## Run locally

```sh
npm run serve   # http://localhost:8080/warga-games/ular/  (the hub at /arcade/ from ../arked)
npm test        # node --test: shared/, teka-kata/, ular/
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
