# Phase 2 — Apple Music resolver + per-visitor "Listen with" preference

**Status:** Plan only. No code yet. Captured 2026-05-18 after a writing-group user asked "is Spotify supported?" on "A Horse With No Name" — the friction PHASE-1B's deferred Apple Music swap was waiting for.

## Why now

We thought we had a Spotify-support problem. The actual problem is **ISRC fragmentation in old catalog**: a single song like "A Horse With No Name" has 15+ distinct ISRCs across remasters, comps, and re-releases. Odesli matches by ISRC; the one our iTunes-Search-based resolver happens to hand it may not bridge to *any* of Spotify's ISRCs for the same song. Fuzzy title+artist matching covers some of this but fails on suffixes like "(Remaster)", "(Live at Wembley)", featured-artist variants, accents, etc. For songs from before ~2000, the fuzzy fallback misses often enough that users notice.

We can't fix Odesli's matching. We *can* start the resolve from a cleaner ISRC. Apple Music's catalog graph is what Odesli aligns to most reliably, and our Apple Developer Program membership has been paid for since 2026-05-11 and unused. The PHASE-1B trigger we wrote down for the Apple swap was *"ISRC reliability becomes load-bearing"* — this is that.

This phase bundles two changes that share an axis:

1. **Resolver swap.** iTunes Search → Apple Music API. Same `MusicService` shape, better data.
2. **Per-visitor "Listen with" preference + per-song routing.** Stored as a long-lived cookie. Each "→ Listen" tap routes to the visitor's preferred service when available for that song; falls back to the Odesli redirector when not.

(2) was already shaping up — the mockup with the text-link "Listen with: Apple · Spotify · YouTube · Other" chip in the header was approved in concept. (1) is what makes (2) actually deliver, because without better ISRC matches a visitor's preferred service will be silently missing on half the old-catalog songs.

The Claude Desktop chat also proposed a third change — Spotify search fallback (search Spotify directly when Odesli's `linksByPlatform.spotify` is missing, inject the result). Originally held in reserve as Phase 2.1; later abandoned (2026-05-21) when Spotify's Feb 2026 dev-API changes locked Web API access behind a Premium subscription on the developer's account. The replacement is a much simpler service-side **search-URL fallback** that needs no credentials at all — see the Phase 2.1 section at the end of this doc. The same Apple Music swap still helps for songs Odesli can bridge; the search-URL approach catches the rest.

## Scope

- Apple Music API authenticated client (JWT/ES256), replacing iTunes Search as the resolver source.
- Schema: store Odesli's `linksByPlatform` per song so per-platform direct URLs are available without re-fetching.
- Backfill: re-resolve every existing song so the new column populates.
- Visitor preference cookie + header chip UI + per-song href routing.
- Audit pass: verify "A Horse With No Name" and a sample of other old-catalog songs now resolve with a Spotify link.

## Out of scope (deliberately)

- **Spotify Search API fallback.** Reconsidered and dropped 2026-05-21 — Spotify gates Web API access behind Premium on the developer's account. Replaced by service-side search-URL fallback (see Phase 2.1 section).
- **Country-aware Odesli queries** (`userCountry` from Cloudflare's edge headers). Worth doing eventually for international viewers; not load-bearing for the writing group.
- **Per-song platform pills** as a UI element. The cookie+fallback covers 95% of the felt need with zero new visual texture per row. Revisit only if users start asking "which services does this song have?" rather than "is Spotify supported?".
- **Apple Music API for richer metadata** (explicit flags, high-res artwork, accurate release year for OG mosaic). Real but separate; v1.x feature.

## Architectural shape

```
┌────────────────────┐         ┌──────────────────────┐
│ Editor "add song"  │ search  │  Apple Music API     │
│ (free-text +       │────────▶│  /v1/catalog/.../    │
│  Search picker)    │         │  search?term=...     │
└────────┬───────────┘         └──────────┬───────────┘
         │ song row inserted with         │ canonical metadata
         │ source_url = music.apple.com/… │ + ISRC
         │                                ▼
         │                       ┌────────────────────┐
         └──────────────────────▶│  Odesli /links?    │
                                 │  url=apple-url     │
                                 └────────┬───────────┘
                                          │ pageUrl + linksByPlatform
                                          ▼
                                 ┌────────────────────┐
                                 │  songs row:        │
                                 │  songlink_url ←    │
                                 │  links_by_         │
                                 │  platform ←        │
                                 └────────────────────┘
```

Net of the change: the resolver's source URL becomes an Apple Music URL (not iTunes Store), which Odesli handles best. The `linksByPlatform` blob comes along for free and we now persist it.

## Implementation steps

### Step 1 — Apple Developer setup (Bryan, manual)

In the Apple Developer Portal:

1. Identifiers → "+" → MusicKit. Create a MusicKit identifier (e.g., `com.mixtapestory.musickit`).
2. Keys → "+" → MusicKit. Generate a private key. Download the `.p8` file (you only get to download once).
3. Note three values:
   - **Key ID** — visible on the key after creation
   - **Team ID** — in the top-right of the developer portal
   - **`.p8` contents** — the file body, including the `-----BEGIN PRIVATE KEY-----` header

These become three Cloudflare Pages secrets:

```bash
pnpm exec wrangler pages secret put APPLE_MUSIC_KEY_ID --project-name mixtapestory
pnpm exec wrangler pages secret put APPLE_MUSIC_TEAM_ID --project-name mixtapestory
pnpm exec wrangler pages secret put APPLE_MUSIC_PRIVATE_KEY --project-name mixtapestory
```

Add the same three to `.env.example` (with placeholders, never the real values) and to local `.env` for dev.

### Step 2 — Apple Music client (server-only)

New file: `src/lib/server/music/apple-music.ts`.

Two responsibilities:

1. **JWT signer.** ES256 with the `.p8` key. Cache the signed JWT in module scope; rotate when within 1 hour of expiry. The JWT can live up to 6 months per Apple's spec — sign with a 90-day expiry for safety.

   Cloudflare Workers' `crypto.subtle` supports ES256 natively. The `.p8` needs to be parsed (PKCS#8 PEM → ArrayBuffer) and imported via `crypto.subtle.importKey`. Standard ~40-line module.

2. **Search.** `searchSongs(query: string, opts?: { limit?: number; storefront?: string }) → AppleMusicSong[]`. Hits `GET https://api.music.apple.com/v1/catalog/{storefront}/search?term=...&types=songs&limit=...`. Default storefront `us`.

   Returns a normalized shape that matches the existing iTunes Search result shape exactly, so callers don't need to change. The key fields we need:
   - `title`, `artist`, `album`, `releaseYear`
   - `isrc` (from `attributes.isrc`)
   - `albumArtUrl` (from `attributes.artwork.url`, with `{w}x{h}` template replaced)
   - `previewUrl` (from `attributes.previews[0].url`)
   - `sourceUrl` (`https://music.apple.com/{storefront}/album/{albumId}?i={songId}` — Apple's canonical deep-link shape)

The existing `MusicService` interface lives at `src/lib/server/music/` already (per the directory hint from earlier searches). The new module conforms to that same shape.

### Step 3 — Swap callers

Replace iTunes Search calls in the resolver pipeline. Best done behind a feature flag for one deploy so we can compare results.

Files likely touched (verify in implementation):
- `src/lib/server/music/index.ts` or wherever the `MusicService` interface lives — wire Apple Music as the default service.
- The `/api/itunes-search/+server.ts` endpoint — rename to `/api/music-search` (or keep the path and just change the backing implementation). The editor's search-as-you-type calls this; the request/response shape stays the same.
- The `?/parse_list` and `?/resolve` actions in `[handle]/edit/+page.server.ts` — verify they reach Apple Music via the same interface, no signature change.
- The Odesli resolver call — it already accepts arbitrary source URLs and works better with Apple Music URLs, so no change needed.

Keep the iTunes Search code in-tree for one or two sprints as a flagged fallback. Delete once confidence is high.

### Step 4 — Schema: store `links_by_platform`

Migration `0013_songs_links_by_platform.sql`:

```sql
alter table songs add column links_by_platform jsonb;

-- Explicit grants per the new Supabase Data API rule. linksByPlatform is
-- public read-friendly (it's what we display); writes are owner-only via
-- the existing songs RLS policy.
grant select, insert, update, delete on songs to service_role;
-- (anon/authenticated grants already exist on songs from earlier migrations)
```

Shape stored:
```json
{
  "spotify":    { "url": "https://open.spotify.com/track/..." },
  "appleMusic": { "url": "https://music.apple.com/us/album/...?i=..." },
  "youtube":    { "url": "https://www.youtube.com/watch?v=..." },
  ...
}
```

We don't store nested fields beyond `url` for v1. If we later want native URIs or per-platform IDs, the column is JSONB — additive.

### Step 5 — Resolver writes the new column

When Odesli resolves a song (the queue worker / inline-resolve path), pluck `payload.linksByPlatform` and write it alongside `songlink_url`. One column, one extra line.

### Step 6 — Backfill existing songs

One-off script: `scripts/backfill-platform-links.ts`.

Two-stage process:

1. For each song in `link_status = 'done'`: read from `song_cache` (keyed by `source_url`) and write `payload.linksByPlatform` into the new column. No external API calls — pure DB-to-DB.
2. **Optional second pass** (after Apple Music API is live): for songs whose `source_url` is an iTunes URL, re-resolve through Apple Music + Odesli to get better matches. Compare old `linksByPlatform.spotify` to new — log diffs so we can verify the swap actually improved things. Don't auto-overwrite unless the new result has *more* platforms than the old. (Bias toward keeping known-working data; only promote when strictly better.)

Run once locally against staging-of-prod (a Supabase branch), inspect, then run against prod.

### Step 7 — Visitor preference cookie

Cookie: `mxs_listen_pref`. Values: one of `apple`, `spotify`, `youtube`, `tidal`, `amazon`, or absent (= "other" / Odesli redirector). Lowercase, simple keys.

- **Set:** client-side via `document.cookie = "mxs_listen_pref=apple; path=/; max-age=31536000; samesite=lax"`. Set by the chip's click handler. After setting, trigger a hard navigation (`location.assign(location.href)`) so server-rendered hrefs update — simplest, no JS to also patch hrefs.
- **Read:** server-side in `/{handle}/+page.server.ts` via `cookies.get('mxs_listen_pref')`. Validate against the known platform keys (don't trust arbitrary values into href computation). Pass `viewerPref: 'apple' | 'spotify' | … | null` to the page data.

Existing visit-tracking cookie `mxs_visitor` already establishes the pattern.

### Step 8 — Per-song href routing

In `+page.server.ts` (or in the `+page.svelte` deriving from data — both work), compute each song's Listen destination:

```ts
function listenHref(song: DisplaySong, pref: PlatformKey | null): string {
  const platformLink = pref && song.linksByPlatform?.[pref]?.url;
  return platformLink ?? song.songlinkUrl ?? '#';
}
```

Replace `song.songlinkUrl` with the result of this function in `SongRow.svelte`.

When `pref` is null (no preference set) or the song doesn't have that platform, falls back to `songlink_url` (Odesli redirector) — today's behavior. When `pref` is set AND the song has that platform, goes direct.

### Step 9 — The chip itself

Per the mockup at `~/Desktop/mockup-listen-pref.html` (approved last night with the caveat that footer placement pushed it below the fold for long mixtapes). Implementation:

- In `src/routes/[handle]/+page.svelte`, between the meta row (`10 songs · 1978 — 2025` + view toggle) and the Share button, render:
  ```svelte
  <p class="mt-3 text-sm text-ink-muted">
    Listen with:
    <a href ... class:active={data.viewerPref === 'apple'}>Apple</a> · 
    <a href ... class:active={data.viewerPref === 'spotify'}>Spotify</a> · 
    <a href ... class:active={data.viewerPref === 'youtube'}>YouTube</a> · 
    <a href ... class:active={!data.viewerPref}>Other</a>
  </p>
  ```
- Active link gets the `text-ink underline decoration-accent decoration-2 underline-offset-4` treatment (matches existing link active style). Others stay `text-ink-muted`.
- `onclick` (JS) sets the cookie, hard-reloads.

### Step 10 — Verify

Manual smoke test on a phone:

1. Open `/bryan` anonymous. "→ Listen" routes to Odesli landing (today's behavior).
2. Tap "Listen with: Apple". Page reloads. "→ Listen" now goes direct to Apple Music for songs that have it.
3. Tap a song that previously lacked a Spotify link (e.g., "A Horse With No Name" if any user added it). With "Spotify" preference, verify it now resolves direct OR cleanly falls back to Odesli.
4. WhatsApp paste test: unfurl card still renders correctly.
5. Admin queue check: confirm `links_by_platform` populates on new song adds.

## Open questions / decisions to make at build time

1. **Storefront detection.** Pinning to `us` for v1; almost all writing-group users are US-based. If we ever get an international audience, hit Cloudflare's `cf-ipcountry` header to pick a storefront. (Not blocking.)

2. **What about `linksByPlatform.itunes` vs `linksByPlatform.appleMusic`?** Odesli returns both. iTunes is the buy-the-track surface, Apple Music is the streaming surface. We want `appleMusic` for the visitor preference. Confirm at implementation.

3. **Track-ID-only Apple URLs (no album context).** Apple's canonical URL shape includes both album and track IDs. If we only have track ID from search, we'll need a second API call to get the album — or we use a track-only shape like `https://music.apple.com/{storefront}/song/{id}`. Verify Apple supports the song-only shape on iOS deep-linking.

4. **`previewUrl` source.** Apple Music API includes preview URLs. We're already pulling these for the in-row preview button. Just make sure the new resolver fills the existing `preview_url` column.

5. **Cookie scope.** `path=/` makes the preference apply across all mixtapes, which is right. Don't scope to per-handle.

6. **Backfill volume.** ~50 songs at writing-group scale. No throttling needed. If we ever cross 10k+ songs, throttle Odesli calls to respect their soft limits.

## Risks

1. **JWT signing in workerd.** Cloudflare Workers' subtle crypto supports ES256, but parsing a PKCS#8 PEM in workerd has historically been a small gotcha. Test early. Fallback: pre-sign locally and store a long-lived JWT as a secret (rotate manually every 5 months) — ugly but works.
2. **Apple Music API soft limits.** Not publicly documented, but real. At writing-group scale we won't hit them. Worth logging the response headers (`x-ratelimit-*` if present) to see if we're trending toward a ceiling.
3. **Resolver swap regression.** If Apple Music API search returns different top-result orderings than iTunes Search did, the editor's search-picker behavior could subtly change. Compare top-5 results on a sample of 20 queries before the cutover.
4. **Lost songlink_url for songs we re-resolve.** If we run the second-pass backfill and a re-resolve hits Odesli during a transient failure, we could downgrade a song from `done` to `pending`. Solution: never overwrite `songlink_url` during backfill unless the new value is strictly better (more platforms in `linksByPlatform`). The script gate is "new platforms.length >= old platforms.length".

## Estimate

- Apple Developer setup (Bryan, manual): **20 min**
- Apple Music client + JWT signer + tests: **2-3 hours**
- Resolver swap + verification: **1-2 hours**
- Schema migration + backfill script: **1 hour**
- Visitor preference cookie + chip + per-song routing: **2 hours**
- Verification on phone + WhatsApp: **30 min**

**Total: 7-9 hours of focused work.** Splittable across two or three sessions.

## Order to ship in

Each step is independently shippable. I'd land them in this order to keep prod stable:

1. Apple Developer setup (manual, no code) — Bryan does this when he has 20 min.
2. Apple Music client module + tests, NOT yet wired into resolver. Behind a feature flag if helpful. **Independent commit.**
3. Migration 0013 + backfill of `links_by_platform` from existing cache. No behavior change. **Independent commit + prod migration.**
4. Resolver swap — Apple Music becomes the search backend. Verify a handful of test resolves. **Independent commit.**
5. Visitor preference cookie + UI chip + per-song routing. **Independent commit.**
6. Optional second-pass backfill — re-resolve old songs through new pipeline. **Off-line script run, no deploy.**

If any step regresses, the previous step is the rollback line.

## Phase 2.1 — service-side search-URL fallback (rolled into Step 6)

**Originally drafted as "Spotify Search API fallback."** Abandoned 2026-05-21
after discovering Spotify's February 2026 dev-API changes now require a
Premium subscription on the developer's account to access the Web API
(Bryan saw the message "Your application is blocked from accessing the
Web API since you do not have a Spotify Premium subscription" after
creating an app). Even with Premium the trajectory is hostile — they
flagged that they're "moving away from the Client Credentials flow for
metadata endpoints," so the rug-pull risk is real.

**Replacement approach: route to each service's public search page when
we don't have a direct track link.** No credentials, no API limits, no
ongoing dependency risk. The flow:

- Visitor sets "Listen with: Spotify" in the chip.
- For each song, the Listen button's destination is computed:
  1. If `linksByPlatform.spotify` exists for this song → direct track URL (best).
  2. If not → `https://open.spotify.com/search/{title}%20{artist}` (good fallback).
- Same construction works for every service:
  - Spotify: `https://open.spotify.com/search/{query}`
  - Apple Music: `https://music.apple.com/search?term={query}`
  - YouTube Music: `https://music.youtube.com/search?q={query}`
  - Tidal: `https://tidal.com/browse/search/{query}`
  - Amazon Music: `https://music.amazon.com/search/{query}`

The cost is one extra click for the visitor when their preferred service
isn't in our direct-link map — they land on the search results page with
the song listed and pick the version they want. For a contemplative-
writing audience that presumably knows the song they're being introduced
to, that's an acceptable cost. Beats "→ Listen" leading to a dead-end
Odesli page (which is what we have today for ISRC-orphan songs).

This collapses what was a "Phase 2.1" follow-on into a small helper in
Step 6 — a single `searchUrlFor(service, song)` function used when the
direct link is missing. Zero new infrastructure.

The Spotify developer credentials briefly added to Cloudflare and
.env.local on 2026-05-21 were removed once this approach was chosen.
If a future change reopens Spotify's free developer surface, the
direct-search fallback can be added then — but the search-URL approach
remains the more robust default.
