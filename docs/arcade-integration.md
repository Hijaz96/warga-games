# Adding the four games to Arked Warga

The games in this branch are static pages in `2048/`, `blok/`, `memori/` and `xo/`. They use Warga Games' shared AppsWarga bridge, profile, theme, progress key, and `arked_record` / `arked_top` / `arked_campus_rank` leaderboard functions. No PlayZone backend or Supabase functions are copied.

These game pages work locally without the hub. Online leaderboard writes require the four IDs to be present in the hub's `public.arked_games` table. The hub catalogue must also list the URLs before the games appear in Arked Warga. Those changes belong in `nullifye/arcade`, which is a separate repository.

## Supabase registration

Add these rows to the `insert into public.arked_games ... values` section of `supabase/arked.sql` in the hub repo, before its `on conflict` clause. The configured maximum is the existing database limit. Review the bounds with the hub maintainer before applying them to production.

```sql
  ('2048',   '2048',      100000, 10000),
  ('blok',   'Teka Blok', 100000, 10000),
  ('memori', 'Memori',    100000,  5000),
  ('xo',     'XO',           100,   100),
```

## Hub catalogue

Add four `live` entries to `js/games.js`, with IDs `2048`, `blok`, `memori`, `xo` and URLs ending in `/warga-games/2048/`, `/warga-games/blok/`, `/warga-games/memori/`, `/warga-games/xo/`. Give each an `icons/<id>.svg` asset in the hub repository. The hub's local dev server maps these URLs to local pages.

The pages call `recordRound` only when a round ends, always as a free round. Their daily board displays all free rounds played today, matching the other Warga Games. Player profile and AppsWarga user-type restrictions remain shared with the existing games.
