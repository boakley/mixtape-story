# Phase 1b — Editor

> **Status note (2026-05-11):** mid-implementation, the editor's primary input changed
> from "paste an Apple Music playlist URL" to "paste a free-text song list, resolved
> via the iTunes Search API." User-created Apple playlists can't be scraped (the
> embed page is a SPA shell that fetches data from an auth-required internal API),
> and the text-list path turned out to be both simpler and more service-neutral.
> See [Design pivot — text-list as primary input](#design-pivot--text-list-as-primary-input) at the bottom of this doc. The rest of this page reflects the original intent;
> the pivot section is the source of truth for what shipped.

This doc captures the design for Phase 1b. Phase 1a (magic-link auth, profiles, `/{handle}/edit` doesn't exist yet) is live. Phase 1b adds the editor and migrates the read path from CSVs to the database.

See [`PLAN.md`](PLAN.md) for the broader v1 scaffold. This doc supersedes the rough Phase 1b/1c sketch in PLAN.md.

---

## Goal

A signed-in owner can add, edit, reorder, and remove their own songs and stories on `/{handle}/edit`. The bulk path (paste an **Apple Music playlist URL**, get all the songs at once) is the primary entry point. Single-song URL paste (any service via Odesli) and manual entry are fallbacks. Changes show up immediately on the public `/{handle}` page.

**Deliverable:** Bryan can sit down with his Apple Music playlist for his mixtape, paste the playlist URL once, and end up with all songs imported with working "Listen" buttons. Tim can do the same (his CSV originated from Apple Music, so his content maps cleanly). Writing-group members on other services can add songs one at a time via single-song URL paste, or use manual entry.

**Why Apple-only?** Scoping discipline. One adapter gets the editor end-to-end faster than three, and Apple is what Bryan and Tim already use. The `MusicService` interface stays in place so adding Spotify and YouTube Music playlist support later is one new file each.

---

## Out of scope (deferred)

- **Spotify playlist import** — deferred to a later phase. Single Spotify song URLs still work via Odesli fallback.
- **YouTube Music playlist import** — deferred to a later phase. Single YouTube song URLs still work via Odesli fallback.
- **Voice memo uploads** (`story_media` table) — v1.1.
- **In-browser audio recording** — v2.
- **"Ask about this song"** (`ask_clicks` + the `wa.me` redirect flow) — Phase 1d.
- **OG image mosaic generator** — Phase 1d.
- **PWA manifest, share-to-WhatsApp polish** — Phase 1d.
- **Multi-user collaboration on one mixtape** — never in v1. Each mixtape has exactly one owner.
- **Cross-service song deduplication via ISRC** — defer. At 20 users × ~50 songs, the per-row metadata-duplication cost is negligible.

---

## Architecture overview

```
                                       ┌─────────────────┐
   /{handle}/edit ─── add song(s) ────▶│   resolver      │
                                       │  (dispatcher)   │
                                       └─────────────────┘
                                              │
                                  ┌───────────┬───────────────┬───────────────┐
                                  ▼           ▼               ▼               ▼
                              apple.ts    single song      manual entry    [deferred]
                              (scrape)    via Odesli       (no lookup)     spotify.ts
                                  │           │               │             youtube.ts
                                  └───────────┴───────────────┘
                                              │
                                              ▼                             ▼
                                           Track[]                       Track (sparse)
                                    │                                     │
                                    └──────────────┬──────────────────────┘
                                                   ▼
                                      insert into songs  (link_status = 'pending')
                                                   │
                                                   ▼
                                      ┌──────────────────────┐
                                      │  resolution worker   │     song_cache
                                      │  (~9 songs/minute)   │◀───▶  (URL keyed)
                                      └──────────────────────┘
                                                   │
                                                   ▼
                                       update songs.songlink_url,
                                              link_status='done'
```

---

## Schema

Three new tables (`songs`, `stories`, `song_cache`) plus an extension of `profiles` via FKs. All in the `public` schema, RLS-protected.

```sql
-- One row per song in someone's mixtape. Ordered by `position` per owner.
create table songs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,
  position            integer not null,
  -- Canonical metadata (may be filled by the resolver or by hand):
  title               text not null,
  artist              text,
  album               text,
  release_year        integer,           -- when the song came out; auto-filled when available
  memory_year         integer,           -- year in the listener's life this song belongs to; user-set; drives the timeline
  isrc                text,
  album_art_url       text,
  -- Resolution:
  source_url          text,             -- whatever URL the user pasted (or null for manual)
  songlink_url        text,             -- the Odesli cross-platform redirector
  link_status         text not null default 'pending', -- 'pending' | 'done' | 'failed' | 'manual'
  link_attempts       integer not null default 0,
  link_last_attempt   timestamptz,
  added_at            timestamptz not null default now()
);
create index songs_owner_position_idx on songs (owner_id, position);
create index songs_pending_idx on songs (link_status) where link_status = 'pending';

-- 1:1 with songs.  Separate row so empty stories are a first-class state
-- and so a story update doesn't touch the songs row.
create table stories (
  song_id     uuid primary key references songs(id) on delete cascade,
  text        text not null default '',
  updated_at  timestamptz not null default now()
);

-- Resolver cache.  Keyed by normalized source URL.  Shared across all users.
create table song_cache (
  source_url   text primary key,
  payload      jsonb not null,           -- title/artist/album/year/isrc/album_art_url/songlink_url
  fetched_at   timestamptz not null default now()
);
```

**RLS:**

- `songs`: `select` public; `insert/update/delete` only when `owner_id = auth.uid()`.
- `stories`: `select` public; `insert/update/delete` only when the related `songs.owner_id = auth.uid()` (subquery in the policy).
- `song_cache`: RLS enabled, no policies — only the service-role key (used by the resolution worker) reads/writes it.

---

## Data migration: CSV → DB

One-shot script at `scripts/migrate-seeds.ts`. The wrinkle: Bryan's and Tim's CSVs use the `year` column differently and we need to migrate them into the right field.

```ts
// scripts/migrate-seeds.ts (sketch)
const yearMeaning: Record<string, 'memory' | 'release'> = {
  bryan: 'memory',    // Bryan curated by hand; year = the year of his life the song evokes
  tim:   'release',   // Tim's CSV came from his Apple Music export; year = album release year
};
```

For each CSV in `src/lib/seed/*.csv`:

1. Look up the matching `profile` by handle.
2. Parse rows; for each, insert into `songs` and `stories`:
   - `source_url` ← the CSV's `link` column (a `song.link/...` URL already).
   - `link_status` ← `'done'` (we already have the cross-platform URL; no resolver needed).
   - `songlink_url` ← the same song.link URL.
   - **If `yearMeaning[handle]` is `'memory'`**: `memory_year` ← CSV year, `release_year` ← null.
   - **If `'release'`**: `release_year` ← CSV year, `memory_year` ← null.

Run once locally against the prod DB as a Node script using the service-role key.

After migration: every CSV row is also a DB row. CSVs become a deletable historical artifact. Bryan's timeline still works (memory years intact). Tim's timeline shows no year labels until he edits and sets his memory years.

---

## Read-path migration (formerly the start of Phase 1c)

Rewire `/[handle]/+page.server.ts` to query the DB instead of glob'ing CSVs:

```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('handle, display_name')
  .eq('handle', params.handle)
  .maybeSingle();
if (!profile) throw error(404, 'Mixtape not found');

const { data: songs } = await supabase
  .from('songs')
  .select('*, story:stories(text)')
  .eq('owner_id', profile.id)
  .order('position');

return { handle: profile.handle, displayName: profile.display_name, songs };
```

Done in the same commit as the migration script. After this lands, `src/lib/seed/` and the CSV-glob code in `+page.ts` (landing) and `+page.server.ts` (handle page) can be deleted. PLAN.md's Phase 1c becomes just "delete the dead CSV code."

---

## Music service adapters

Per the [`MusicService`](#interface) interface below, each streaming service gets its own adapter file. Adding a service = one new file + appending to the dispatcher's services array. Swapping scraping → official API later = changing the internals of one adapter; nothing else moves.

### Interface

```ts
// src/lib/server/music/types.ts
export type Track = {
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  isrc: string | null;
  albumArtUrl: string | null;
  sourceUrl: string;            // the URL we resolved from
};

export type UrlKind = 'playlist' | 'song';

export interface MusicService {
  name: string;
  matchUrl(url: string): UrlKind | null;
  fetchSong(url: string): Promise<Track>;
  fetchPlaylist(url: string): Promise<Track[]>;
}
```

### Dispatcher

```ts
// src/lib/server/music/index.ts
const services: MusicService[] = [apple]; // Phase 1b. Spotify and YouTube adapters land in a later phase.

export async function resolve(url: string): Promise<Track[]> {
  for (const svc of services) {
    const kind = svc.matchUrl(url);
    if (!kind) continue;
    return kind === 'playlist' ? svc.fetchPlaylist(url) : [await svc.fetchSong(url)];
  }
  // Fallback: try Odesli on a bare song URL we don't recognize
  return [await odesliFallback(url)];
}
```

### Apple Music (scrape, swappable to API later) — the only adapter in Phase 1b

- No API key for v0. Fetches `https://embed.music.apple.com/<region>/playlist/<slug>/<id>` and parses the embedded JSON-LD `<script>` tag for track data.
- Uses `node-html-parser` (Workers-compatible) to extract the JSON-LD block.
- Swap path: register for the Apple Developer Program ($99/year), generate a signed JWT developer token, swap `apple.ts` internals to use the official Apple Music API. Interface stays the same.
- Recognizes URLs: `https://music.apple.com/<region>/playlist/...`, `https://music.apple.com/<region>/album/<slug>/<id>?i=<track-id>`.

### Odesli (fallback + cross-platform link)

- Used in two places:
  1. **Per-track enrichment** after an adapter returns a `Track` — we call Odesli to get the cross-platform `song.link/...` URL. This is the bottleneck (rate limit ~10/min).
  2. **Fallback for unrecognized URLs** — if no adapter matches, we try Odesli directly. It supports more services than we have adapters for (Spotify, YouTube Music, Tidal, Deezer, etc.). This is how Phase 1b supports single Spotify/YouTube/etc. song URLs without their adapters.
- No auth required.
- Documented rate limit ~10/min on the public endpoint, observed to be stricter in burst.

### Deferred: Spotify and YouTube Music adapters

These come in a later phase. When they land, the work is:

- **Spotify**: scrape `https://open.spotify.com/playlist/<id>` for embedded JSON track data. Same pattern as Apple. No env vars, no Developer app. ~1.5h. (Why not the official API? See the [Feb 2026 developer access update](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security) — Premium-required Development Mode plus 5-user cap and unspecified endpoint restrictions make the API path higher-friction than scraping.)
- **YouTube Music**: free Google Cloud project + YouTube Data API v3 key (`YOUTUBE_API_KEY` env var). Adapter returns video URLs; Odesli does the song-level canonicalization. ~1.5h.

Each is one new file conforming to `MusicService`, appended to the `services` array. No refactor of anything else.

---

## Resolution queue

Per-row state on `songs`, not a separate queue table. The "queue" is just `select * from songs where link_status = 'pending' order by owner_id, position limit 9`.

**Why `order by owner_id, position` instead of FIFO?** When a user imports a 47-song playlist, the **first song of every import batch resolves in the first minute** — the owner sees their first song's Listen button activate within ~60 seconds, which is a useful "yes, the queue is working" signal. The remaining 38 songs trickle in over the next ~4 minutes. By the time anyone else views the shared mixtape (often hours or days later), Odesli has long since resolved every song. The Listen button is disabled meanwhile (see [Listen affordance](#listen-affordance)) — that's deliberate: the editor surface is for writing, not for listening, and listeners almost never sit inside the 5-minute resolution window.

**Worker:** Supabase Edge Function on a `pg_cron` schedule, running every minute.

```
every 1 min:
  pending = select * from songs where link_status = 'pending' order by added_at limit 9
  for each song in pending:
    try:
      cached = select payload from song_cache where source_url = song.source_url
      if cached:
        update songs set songlink_url = cached.songlink_url, link_status = 'done' where id = song.id
        continue
      result = call odesli(song.source_url)
      insert into song_cache (source_url, payload) values (song.source_url, result)
      update songs set songlink_url = result.songlink_url, ..., link_status = 'done' where id = song.id
    except RateLimited:
      stop processing this batch  -- next minute's run picks up
    except other error:
      update songs set link_status = 'failed' if attempts >= 3, else increment attempts
```

**Decided: Supabase Edge Function on a `pg_cron` schedule.**

- Keeps all auth/data infrastructure inside Supabase — fewer moving parts.
- Edge Functions get the service-role key from Supabase secrets without us shipping it around.
- pg_cron is already installed in the Supabase project.

---

## Admin / queue visibility

Operational visibility into the resolver queue. Two surfaces:

1. **JSON API at `/api/admin/queue`** — single endpoint returning current queue state. Stable contract; everything else can be built on top.
2. **Admin page at `/admin/queue`** — server-rendered table view over that same data. Phase 1b gets a deliberately simple version; richer dashboards (charts, time-range filters) are later.

**Auth model:** admin-only. Implementation: an `ADMIN_EMAILS` env var (comma-separated list), checked in `event.locals.safeGetSession()` flow. If the signed-in user's email is in the list, they're admin; otherwise the page 403s and the API returns 401. Simpler than an `is_admin` column on `profiles` for one admin; we promote to a DB-backed model when there's more than one.

The endpoint uses the service-role Supabase client to bypass RLS — admins need to see all songs, not just their own.

### API response shape

```jsonc
GET /api/admin/queue
{
  "stats": {
    "pending": 12,
    "in_progress": 0,
    "failed": 2,
    "resolved_last_hour": 45,
    "resolved_last_day": 187,
    "cache_size": 312
  },
  "pending": [
    {
      "id": "uuid",
      "owner_handle": "bryan",
      "position": 5,
      "title": "Hotel California",
      "artist": "Eagles",
      "source_url": "https://open.spotify.com/track/...",
      "added_at": "2026-05-10T14:02:00Z",
      "attempts": 0
    }
    // ...
  ],
  "failed": [
    {
      "id": "uuid",
      "owner_handle": "tim",
      "title": "Some Song",
      "artist": "Some Artist",
      "source_url": "...",
      "attempts": 3,
      "last_error": "Songlink 404",
      "last_attempt": "2026-05-10T14:00:00Z"
    }
  ],
  "recently_resolved": [
    {
      "id": "uuid",
      "owner_handle": "bryan",
      "title": "...",
      "artist": "...",
      "songlink_url": "https://song.link/s/abc",
      "resolved_at": "2026-05-10T14:01:55Z"
    }
    // last 20
  ]
}
```

### Admin page

`/admin/queue` renders three small tables (pending / failed / recently resolved) plus the stats header. Each failed row has a "Retry" button (POSTs to `/api/admin/queue/:id/retry`, which resets `link_status='pending'` and `link_attempts=0`). Each pending row links to that user's `/{handle}/edit` so we can jump straight to the source.

Auto-refresh: simple 30-second `setInterval` re-fetch. No websockets for v0.

### Hamburger menu

When the signed-in user matches `ADMIN_EMAILS`, the hamburger dropdown gains an "Admin" link above "Sign out". Hidden otherwise — non-admins don't even know the page exists.

---

## Caching

Single cache table `song_cache`, keyed by normalized source URL:

- **Key**: the source URL with tracking params stripped (e.g., `?si=...` removed from Spotify URLs).
- **Value**: the full Odesli payload as JSONB — title, artist, album, year, ISRC, album art URL, song.link URL.
- **Population**: by the resolution worker on first lookup of a URL.
- **Hit benefit**: every user who pastes the same Spotify URL hits the cache after the first time. For a writing group where multiple people may list "Hotel California," this is meaningful.

No TTL for now. Streaming-service URLs are stable; if metadata drifts (an album re-issue, etc.) it's a rare edge case we can clear by hand.

---

## Year semantics: `release_year` vs `memory_year`

Two distinct concepts, both optional:

- **`release_year`** — when the song was released. Auto-filled from streaming-service metadata when we have it (Spotify, Apple Music). Read-only in the editor; user can override if needed. Useful for trivia / context but doesn't drive any layout.
- **`memory_year`** — the year in the listener's life this song belongs to. User-set. **Drives the timeline.** When present, the song renders with that year on the spine. When absent, no year label, no chronological commitment — just a song on the list.

Field label in the editor: **"Memory year"**. Placeholder: **"What year has meaning attached to this song?"**

This intentionally keeps required data to a minimum. A user can paste a playlist, write stories, and never set a single memory year — their mixtape is still complete and shareable. The timeline is a layered affordance that emerges as memory years get set; it doesn't gate participation.

The public `/{handle}` page renders songs in user-controlled order (via the editor's reorder controls). Year labels appear or don't, song by song. The spine and dots remain — every song is a beat on the page — but the year text is conditional on `memory_year`.

---

## Editor UI

Route: `/{handle}/edit`. Owner-only (server-side check: `event.locals.safeGetSession()` user matches the handle's owner; otherwise 403).

Page shape:

```
mixtapestory.com
─
Bryan's mixtape — edit                                  ⊙ View public page
8 songs · 1978 — 2025

╭───────────────────────────────────────────────────────╮
│ Paste a playlist URL, a song URL, or add manually    │
│ [                                              ] Add  │
╰───────────────────────────────────────────────────────╯

[song list — one row per song, draggable or arrow-reorderable]

1978    Not Fragile — Bachman-Turner Overdrive       → Listen ↑↓ ✕
        [story textarea, click-to-expand]

1980    Havin' a Party — Southside Johnny ...        → Listen ↑↓ ✕
        [story textarea]
...
```

**Top input bar — "smart" URL detection:**

1. User pastes URL → server matches with dispatchers. If playlist URL: server fetches all tracks, returns a preview screen showing the songs with checkboxes (all checked by default), user clicks "Import N songs."
2. If single-song URL: server resolves, inserts as one row, scrolls to it.
3. If empty + "add manually" button: form with year/song/album/artist (no URL), inserted as a row with `link_status = 'manual'`.

**Preview screen (for playlists):**

Shows each detected song with a checkbox (checked by default). Songs whose `source_url` is already in the user's mixtape are flagged with a small "(already in your mixtape)" hint next to the title — still checked, still importable. The user can uncheck songs they don't want, or leave duplicates in if they intentionally want the same song to appear twice (e.g., bookending a mixtape). The "Import N songs" button writes all checked rows at once with `link_status = 'pending'` (or `'done'` if `song_cache` already has the source URL).

**Inline story editing:**

Each song's row has a "Write your story" link if `stories.text` is empty, otherwise the existing story is visible (collapsed to 2 lines with a "More" expander). Click to open an inline textarea; save commits that row's story without affecting others.

**Reorder: arrows now.** Each row has `↑` and `↓` buttons. Accessible, works on mobile without quirks, no library. Bulk imports already land in playlist order — which is usually what people want — so reordering is the exception, not the rule. Drag-and-drop is queued for v1.1 if reordering volume justifies it.

**Delete:**

Per-row `✕` with a confirm step ("Remove this song?"). Cascades to `stories` via FK.

---

## Listen affordance

Every song row renders a Listen button at the same position with the same shape. The button is **enabled when `songlink_url` is set**, **disabled otherwise**, with a tooltip explaining the disabled state.

Why not fall back to the source URL (Spotify/Apple/YouTube) or a Google search while we wait? Because the realistic timeline is: a mixtape is created, the owner edits/writes, then *hours to days later* it's shared with the writing group. By the time anyone clicks Listen, Odesli has long since resolved. Multi-tier fallbacks would only matter in a window listeners almost never sit in, and the cost is real — three possible link behaviors instead of one, a UX that means different things in different states, and a Listen button that quietly changes destination over time. The owner doesn't need to click their own Listen buttons to know what song they added.

### States

| `link_status` | Button | Tooltip |
|---|---|---|
| `done` | Enabled, accent color, `href = songlink_url`, target=_blank | (none) |
| `pending` | Disabled, muted text | "Universal link is being generated. Usually ready within a few minutes." |
| `failed` | Disabled, muted text | "Couldn't generate a universal link for this song." Admins see "Retry" in the queue dashboard; users see only the tooltip. |
| `manual` (no source URL ever existed) | Disabled, muted text | "No streaming link for this song." |

### Implications

- **Owner editing:** during the first few minutes after a bulk import, Listen buttons on their own mixtape are disabled. They see the songs (title, artist, album, year, story) and can edit normally; only the Listen button is gated. Acceptable — the editor surface is for writing, not for listening.
- **Listener viewing:** the realistic case. Odesli has resolved; every Listen works.
- **Manual entries without a URL:** Listen stays disabled forever. Title and artist are still visible — readers can find the song themselves on their preferred service if they want. That's a deliberate scope cut: the product is about the writing, not about being a song-finder.

### Visual design

The disabled state uses the muted text color (`text-ink-muted`) and `cursor: not-allowed`. The arrow glyph (`→`) stays, but doesn't change color on hover. A small tooltip appears on hover (or long-press on mobile) explaining the state. Native `title=` is fine for v0; we can upgrade to a styled tooltip later if needed.

---

## Story editing

Decided: **one-by-one, inline, save-per-story** (no bulk form). After a 47-song playlist import, the user sees the list as a static set of song rows. They tap "Write your story" on whichever song they want to write about — not necessarily the first, not necessarily in order. Save commits that one story; nothing else moves, no focus jumps to the next song. Some songs may never get stories — that's fine.

**Not a wizard.** No auto-advance, no "1 of 47" progress bar, no enforced order. The list is the surface; users navigate it themselves. Wizard-style guided flow could be a v1.1 enhancement if user testing surfaces that people get stuck staring at the list, but the default is to trust the user.

**Story format: Markdown.** Decided.

- Library: `marked` — small, fast, Workers-compatible. Used on the public read path to render stories to HTML.
- **Raw HTML disabled** (`gfm: true` + html option off). Stories are user-content rendered on a public page; even though RLS limits *who* can write stories, disabling raw HTML eliminates a class of XSS vectors for free.
- Supported features: paragraphs, bold, italic, links, blockquotes, lists, line breaks. Disabling headers and code blocks is optional — they're unlikely in prose-shaped writing but harmless if present. Default `marked` settings minus raw HTML are fine.
- Editor textarea is plain (no toolbar / no preview pane for v0); users type markdown directly. A small "Markdown supported" hint near the textarea is enough scaffolding. If users find that friction we can add a preview tab in 1b.1.

---

## Required external setup (you do these)

Before code starts:

1. **Add env vars to Cloudflare Pages** (via dashboard or `wrangler pages secret put`):
   - `SUPABASE_SERVICE_ROLE_KEY` (already available from Supabase dashboard; used by the worker and admin queue endpoint)
   - `ADMIN_EMAILS` — comma-separated list (e.g. `bryan.oakley@gmail.com`) — controls who sees `/admin/queue` and the Admin menu item

2. **No setup needed for**: Apple Music (scrape path), Odesli (public endpoint).

That's it for Phase 1b. The Spotify Developer app and YouTube Data API setup only become relevant when those adapters land in a later phase.

---

## Decisions log

All resolved. Coding can start without ambiguity.

| # | Question | Decision |
|---|---|---|
| 1 | Which streaming-service adapters ship in 1b? | **Apple Music only.** Spotify and YouTube Music playlist import deferred to a later phase. Single-song URLs from those services still work via Odesli fallback. Bryan and Tim both already use Apple. |
| 2 | Story format: plain text or markdown? | **Markdown** via `marked`, raw HTML disabled. See "Story editing". |
| 3 | Reorder UX: arrows or drag-and-drop? | **Arrows (`↑` `↓`)** in 1b. Drag-and-drop is v1.1 if reordering volume justifies it. |
| 4 | Year handling: one field or two? | **Two fields**: `release_year` (auto from metadata) + `memory_year` (user-set, drives timeline). See "Year semantics". |
| 5 | Duplicates on bulk import: skip / allow / block? | **Allow.** Same song can legitimately matter at two different points in a life — different `memory_year`, different story, different beat on the timeline. Preview screen flags already-present songs with an "(already in your mixtape)" hint so the user knows, but leaves them checked; they decide. Accidental re-paste of a whole playlist creates duplicates, which the user can clean up via the editor's per-row delete. |
| 6 | Resolution worker location? | **Supabase Edge Function on `pg_cron` schedule.** Keeps auth/data infra in one place. |
| 7 | Resolver retry policy? | **3 attempts**, then `link_status='failed'`. Admin queue page surfaces failed rows with a "Retry" button (resets to pending). User-facing Listen button stays disabled with the "Couldn't generate" tooltip until the retry succeeds. |
| 8 | Manual-entry songs without a URL: what does Listen do? | **Listen button is disabled with a "No streaming link" tooltip.** No Google-search fallback. Title and artist remain visible so a reader can find it themselves if they want. The product is about the writing, not song-finding. |

---

## Estimated effort

Honest break-down. Each line is "focused work, including local testing":

| Piece | Hours |
|---|---|
| Schema + RLS migrations | 0.5 |
| Data migration script (CSV → DB) | 0.5 |
| Read-path migration (rewire /[handle]) | 0.5 |
| `MusicService` interface + dispatcher | 0.5 |
| Apple Music adapter (scrape) | 1.5 |
| Odesli fallback + per-track enrichment | 0.5 |
| Resolution queue worker (Supabase Edge Function) | 1.5 |
| `song_cache` table + cache-hit logic | 0.5 |
| Editor list UI (view, edit story inline, delete) | 2.0 |
| "Add" surface (smart input + manual form + preview screen) | 2.5 |
| Listen button states + disabled tooltip | 0.25 |
| Reorder (arrows) | 0.5 |
| Admin queue API + page + hamburger entry | 1.5 |
| End-to-end testing + production deploy | 1.0 |

**Total: ~13 hours of focused work.** Down from ~16 thanks to scoping to a single adapter. Still a multi-session phase, not an afternoon.

---

## Risks

- **Apple HTML changes** (scrape path) — could break silently. Mitigation: integration tests that hit a real Apple Music playlist URL and verify expected fields. Fail loud, not silent. Adapter returns a clear error so the editor can surface "couldn't read this playlist" rather than silently producing zero songs.
- **Odesli rate limits more aggressive than documented** — we've already seen this in Tim's bulk import. Mitigation: queue with conservative throttle, retry-after backoff, status surfacing per song.
- **Odesli rate limit** — ~10/min on the public endpoint, observed stricter in burst. Mitigated by the queue + first-song priority. Worth revisiting if Phase 1b proves the product and traction grows.
- **JSON-LD scraping fragility** for Apple — Apple sometimes wraps data in non-standard structures. Mitigation: have the adapter fall back to "couldn't parse" gracefully → user sees the playlist as failed and can paste songs one at a time.
- **Worker time budget** — Supabase Edge Functions have a CPU/wall-time budget per invocation. Processing 9 songs per minute with Odesli calls should fit comfortably (each call is ~200ms). Worth verifying once.

---

## What "Phase 1b done" looks like

- [ ] Bryan can sign in, paste an Apple Music playlist URL at `/bryan/edit`, see all songs imported with working Listen buttons within a few minutes.
- [ ] Bryan can write a story for each song inline (save per song), reorder via arrows, and delete songs.
- [ ] Tim can sign in, paste an Apple Music playlist URL, get the same experience.
- [ ] A writing-group member on Spotify or YouTube Music can add songs one at a time via single-song URL paste; Odesli handles the resolution.
- [ ] Manual entry (no URL) works; Listen button is appropriately disabled.
- [ ] `/{handle}` reads from DB, not CSV; the seed CSV files have been deleted.
- [ ] The `song_cache` table is populated and hits are observable in logs.
- [ ] Failure cases (rate-limited resolver, unrecognized URL, scraper breaks) are surfaced clearly in the editor.
- [ ] All of the above works in production at `mixtapestory.com`.

After this, Phase 1d (OG mosaic, Ask flow, PWA polish) starts.

---

## Design pivot — text-list as primary input

Discovered mid-implementation that Apple's user-created playlists (`pl.u-…` prefix) can't be reached by HTML scraping — Apple serves an empty SPA shell that fetches the playlist data client-side from `amp-api.music.apple.com`, which requires an Apple Developer JWT bearer token. The MusicKit JS bundle explicitly forbids re-hosting that token, and the official Apple Music API needs a paid Developer account ($99/yr) plus JWT signing — both bigger lifts than Phase 1b was scoped for. Editorial playlists (`pl.<hash>`) *do* pre-render JSON-LD and the scrape worked on those, but those are the niche case; the writing group will overwhelmingly use their own user playlists.

Rather than block on the paid-developer path, the editor pivoted to a different primary input shape: **paste a plain-text list of song titles and artists.** Each line is searched against the **iTunes Search API** (public, no auth, free, officially supported, ~20/min rate limit). The first match becomes the row; a per-row "try a different match" surface fetches additional candidates when the search returns the wrong version (live recordings, remixes, covers).

### Why this is better than the original design

1. **Service-neutral.** A free-text song list works for Spotify users, YouTube Music users, anyone — they don't need to share *to* Apple to use the editor. The original playlist-URL flow was Apple-only.
2. **Lower friction in practice.** Writing-group members curating a mixtape are picking 10-50 *meaningful* songs; that list usually exists somewhere already (Notes, a doc, a chat thread). They're not bulk-cloning their music library. Free-text paste meets people where their content actually lives.
3. **Officially supported endpoint.** iTunes Search is documented and stable. The HTML scrape was always going to break when Apple changed their markup.
4. **Smaller codebase.** Removed `apple.ts` (~150 lines of JSON-LD parsing, regex matching, embed-URL conversion) and the entire playlist code path in the dispatcher.
5. **Affiliate-friendly tail.** iTunes Search returns canonical Apple Music `trackViewUrl` values. If/when the product scales enough to bother, appending an Apple Performance Partners token to those URLs is a one-line change — tiny commission per Apple-Music-using listener, but free. Not wired up yet.

### Resulting input modes

The editor's top input is a three-mode tab:

1. **Paste list** (default, primary): textarea → "Find songs" → preview screen with per-row checkbox, thumbnail, "try a different match" picker, and an "Import N songs" button. Rows that the search couldn't match are left unchecked but visible; the user can fix the query manually or remove them.
2. **Single URL** (secondary): paste any one streaming-service URL → Odesli resolves → one row. Useful for "I just found this song, here's the link."
3. **Manual** (last resort): no URL at all → inserts as `link_status='manual'`. Listen button stays disabled with the "No streaming link" tooltip.

The Odesli queue worker still resolves song.link URLs in the background — every row from the text-list path lands as `link_status='pending'` with `source_url = trackViewUrl`, and the worker fills in the universal `songlink_url` over the next minute or two.

### Server-side bits

- `src/lib/server/music/itunes.ts` — `searchOne(query)` and `searchMany(query, limit)` against `https://itunes.apple.com/search?term=...&entity=song`. Returns our `Track` shape directly.
- `src/lib/server/music/parse-list.ts` — `parseSongList(text)` accepts either quoted-title shape (one or many `"Title" Artist` segments on any number of lines) or newline-delimited shape (`Title — Artist`, `Title - Artist`, `Title by Artist`, or just `Title Artist`). Strips parenthetical annotations from the artist field. `resolveBatch(entries, searchOne, 4)` fans out with concurrency 4.
- Editor actions: `parse_list` (text → preview), `search_alternates` (query → top-8 candidates), `import_playlist` (commits preview rows; handles entries without a `source_url` as `link_status='manual'`), plus the existing `resolve`/`manual`/per-row CRUD.

### What got removed

- `src/lib/server/music/apple.ts` (deleted).
- The dispatcher's `services: MusicService[]` array, the playlist branch in the dispatcher, and all URL-pattern matching for Apple Music URLs. The dispatcher is now just `resolveSong(url) → odesliFallback(url)`.
- The editor UI's playlist-URL detection logic — `?/resolve` now always inserts a single row, never a preview.

### What it doesn't do

- **No catalog beyond iTunes.** A song that isn't in Apple's catalog (very rare for mainstream Western music, more common for niche/regional/independent material) won't match. Workaround: paste the single-song URL via the URL tab, or use Manual.
- **No Spotify/YouTube playlist URL import.** That would require those services' APIs and is back to "later phase" territory. Realistically the text-list path makes those redundant.
- **No "wrong match? show alternates" memory.** If you swap a row to an alternate and then re-paste the same list, the same first match wins again. Acceptable for v0.

### Affiliate (deferred)

Apple's Performance Partners program lets you append `&at=<token>` to Apple Music URLs for commission on listeners who arrive via your link and subsequently subscribe or purchase. Worth knowing the scope:

- The public `/{handle}` page links to **song.link/Odesli**, which redirects each viewer to *their* preferred streaming service. Commission only fires for viewers whose default is Apple Music.
- Per-click revenue is tiny. Not relevant until scale.
- Wiring is a one-liner if/when it matters: wrap any `music.apple.com` URL with the `at=` query param at render time.

### Apple Music API (revisit — Developer Program is active)

Bryan enrolled in the **Apple Developer Program** on 2026-05-11. The official Apple Music API at `api.music.apple.com` is now an available option but is **not yet wired up**. The editor still uses the public iTunes Search endpoint; the cache + concurrency-3 throttle handle the 20/min ceiling fine at writing-group scale.

**Triggers to revisit this swap (any one is sufficient):**

- Real users hitting the rate limit in normal use (cache + throttle make this unlikely until ~hundreds of users with frequent bulk paste).
- A need for **reliable ISRCs** — iTunes Search often omits the `isrc` field; Apple Music API populates it consistently. Becomes load-bearing the moment we want to deduplicate songs across users, do cross-service matching, or expose anything keyed on ISRC.
- A decision to **resurrect Apple-playlist URL paste** as a second bulk-import mode for Apple-Music users. The `/v1/catalog/<storefront>/playlists/<id>` endpoint serves curated and user playlists when the user is authenticated against their library. Note: this would *complement*, not replace, the text-list path — that flow is service-neutral and stays the primary input.
- Multi-storefront localization (different storefronts for different regions).
- An Apple Music–specific feature (artist deep links, chart data, recommendations) that the public Search endpoint can't provide.

**Implementation when we swap (~half a day):**

1. In the Apple Developer portal, create a **MusicKit identifier** and a **MusicKit private key**. Download the `.p8`. Note the Team ID and Key ID.
2. Add Cloudflare secrets: `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` (the `.p8` contents). Mirror in `.env.local` for dev.
3. Add `jose` for ES256 JWT signing. Write ~20 lines that sign a developer token (ES256, `iss` = team, `kid` = key ID, `exp` ≤ 6 months). Cache and rotate daily.
4. Swap `fetchSearch` internals in `src/lib/server/music/itunes.ts` to call `https://api.music.apple.com/v1/catalog/<storefront>/search?term=...&types=songs&limit=8` with `Authorization: Bearer <jwt>`. Map the response shape to the existing `Track` type.
5. Everything else (the `MusicService` interface, `itunes_cache`, the throttle, `parse-list`, the search picker, the alternates picker, the editor UI, the read-path) stays untouched. The interface was designed for this swap.

**What it does *not* automatically unlock:**

- **Performance Partners affiliate** is a *separate* program with its own enrollment. Developer Program membership doesn't grant it.
- **Spotify and YouTube Music** still need their own paths if they ever come back into scope — Apple Music API only sees Apple's catalog.
