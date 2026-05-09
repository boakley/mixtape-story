# v1 Scaffold Plan

This plan turns an empty repo into a working SvelteKit app deployable to Cloudflare Pages, backed by Supabase, ready to receive v1 product features (text stories, magic-link auth, public `/{handle}` pages, WhatsApp unfurl, Songlink routing). It stops at the boundary where product code begins — schema, routes, helpers, and config are scaffolded but feature UI is intentionally minimal.

Primary references: `CLAUDE.md` (operative decisions) and `docs/design-notes.md` (rationale + open questions). Where this plan and those documents disagree, the source documents win.

---

## Phase 0: POC ("stake in the ground")

Before any of the v1 scaffold below, ship a deliberately minimal site to `mixtapestory.com`. Two purposes:

1. **Claim the domain in public** with a credible "we exist, we're cooking" page rather than a parked-domain placeholder.
2. **Start using the product on myself.** The `/bryan` route is the first real mixtape. Seeing my own writing render — at the real URL, on a phone, in a WhatsApp chat — is how we'll learn whether the design north star ("director's commentary, but for songs") actually feels right before we build the editor, the auth, or the database.

The POC is throwaway *behavior* on permanent *infrastructure*. The SvelteKit project, Cloudflare Pages deploy, Tailwind setup, and DNS are the same code that will carry into v1. The landing copy, the CSV-seeded mixtape, and the lack of auth get replaced as v1 features land — the URLs stay stable.

### POC scope

- **`/` landing page.** Prerendered. Contents:
  - Brand mark / wordmark for **mixtapestory.com**.
  - Tagline: *"Share the songs, share the stories."*
  - One short paragraph framing the idea.
  - Visible "In private testing" badge or note. No signup form, no email capture in the POC — anyone who needs in already has my number.
  - Footer: contact email + a link to `/bryan` as a live example.
- **`/bryan` route.** Server-rendered. Renders my mixtape from a CSV checked into the repo. Each row = one song + its story. Layout matches the design north star (song is the hero, story sits alongside) but uses placeholder typography — polish lands in v1.
- **OG unfurl on `/bryan`.** A *minimal* unfurl: `og:title`, `og:description`, and a single static `og:image` (one chosen album cover, or a hand-made card committed to `static/`). Not the v1 mosaic generator — that's deferred. The point is that pasting `mixtapestory.com/bryan` into WhatsApp produces *something* better than a bare URL.
- **404 / unknown handle.** Anything other than `/` and `/bryan` returns a friendly 404 pointing back to `/`. No matcher logic yet — a hardcoded route is fine.

### Out of POC scope (deliberately)

- Supabase, Postgres, RLS, migrations.
- Auth (magic-link, sessions, callbacks).
- Onboarding / handle claiming.
- The full `[handle=handle]` matcher and reserved-list validator.
- Songlink resolution at request time (POC pre-resolves URLs by hand into the CSV).
- The mosaic OG image generator (`workers-og`).
- Edit UI (`/{handle}/edit`), Ask flow, `ask_clicks`.
- Any database, anywhere. The CSV is the database.

If a feature isn't on the "in scope" list above, it isn't in the POC. When in doubt, leave it out.

### CSV seed format

One file at `src/lib/seed/bryan.csv`. Columns:

| column            | required | example                                                       | notes                                                       |
| ----------------- | -------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `position`        | yes      | `1`                                                           | Integer; controls render order.                             |
| `title`           | yes      | `Wichita Lineman`                                             |                                                             |
| `artist`          | yes      | `Glen Campbell`                                               |                                                             |
| `album`           | no       | `Wichita Lineman`                                             |                                                             |
| `release_year`    | no       | `1968`                                                        |                                                             |
| `album_art_url`   | no       | `https://i.scdn.co/image/...`                                 | Hot-link from Spotify/Apple is fine for POC.                |
| `songlink_url`    | no       | `https://song.link/s/...`                                     | Pre-resolved by hand (paste into song.link, copy result).   |
| `story`           | yes      | `Multi-line markdown allowed.`                                | Plain text or light markdown; escape commas + newlines per CSV rules. |

Parse with [`papaparse`](https://www.papaparse.com/) (no native Node CSV in the Cloudflare runtime, and `papaparse` works in Workers). Read at request time from `src/lib/seed/bryan.csv` imported as a string via Vite's `?raw` suffix. No build-time codegen needed.

If the story field gets unwieldy in CSV (likely — long-form writing in a single cell is awkward), promote to one markdown file per song under `src/lib/seed/bryan/{position}-{slug}.md` and keep the CSV for metadata only. Decide once we see real content.

### POC file additions

Minimal additions to the v1 layout already specified below. Everything here is either reused by v1 or trivially deletable.

```
src/
├── lib/
│   ├── seed/
│   │   ├── bryan.csv               ← songs + stories
│   │   └── parse.ts                ← papaparse wrapper, returns Song[] + Story[]
│   └── components/
│       └── poc/
│           ├── LandingHero.svelte  ← tagline + "in private testing" badge
│           └── SongStoryCard.svelte ← POC-styled row; will be replaced in v1
└── routes/
    ├── +page.svelte                ← landing (prerendered)
    ├── +page.ts                    ← `export const prerender = true`
    └── bryan/
        ├── +page.svelte
        └── +page.server.ts         ← load: parse CSV, return { songs, stories }
```

`src/lib/components/poc/` is a marker: anything in there is POC-only and gets deleted (or absorbed) when v1 components land. Keeping it isolated avoids accidentally building v1 styling against throwaway markup.

### POC deploy

- Same Cloudflare Pages project, same domain (`mixtapestory.com` apex + `www` redirect), same `@sveltejs/adapter-cloudflare`. The POC ships through the production deploy path so step 13 of the v1 scaffold is already proven by the time we get there.
- No env vars needed for POC — no Supabase, no service-role key. Configure them later when v1 work begins.
- `static/robots.txt` with `Disallow: /` for the POC window. Public testing only — search engines stay out until v1 ships and we want to be found.

### POC → v1 transition

What gets thrown away when v1 starts landing:

- `src/lib/seed/` and `src/lib/components/poc/` — replaced by Supabase queries + real components.
- The POC `/bryan/+page.server.ts` load — replaced by the `[handle=handle]` matcher and the v1 `+page.server.ts`.
- The hand-curated static OG image — replaced by `/{handle}/og.png` via `workers-og`.
- The "in private testing" notice on `/` — replaced by real landing copy + a sign-in entry point.

What carries forward unchanged:

- The SvelteKit project, `tsconfig`, Tailwind config, Cloudflare adapter, `wrangler.toml`, DNS, `pnpm` lockfile.
- The visual tokens in `app.css` (paper-white, ink-black, single accent) — POC is the first chance to commit to them.
- `static/` icons + manifest.

### Definition of done for POC

- [ ] `mixtapestory.com/` resolves and shows the tagline + "in private testing" notice.
- [ ] `mixtapestory.com/bryan` resolves and renders the seed CSV as a list of songs with stories.
- [ ] Pasting `mixtapestory.com/bryan` into WhatsApp produces an unfurl with at least a title + description + one image.
- [ ] Editing `bryan.csv` and pushing to `main` redeploys with the new content.
- [ ] `robots.txt` blocks indexing.
- [ ] Lighthouse mobile pass ≥ 90 on `/bryan` (POC is mobile-first; this is the cheap canary).

Once these are checked, POC is "done" and v1 scaffold work (step 1 below) begins. The POC site keeps running on the same project; v1 features land incrementally on top of it.

---

## Stack confirmation

| Layer       | Choice                                    | Notes                                                                |
| ----------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Framework   | SvelteKit (TS, strict)                    | SSR by default; static prerender only on fully public landing.       |
| Adapter     | `@sveltejs/adapter-cloudflare`            | Pages, not Workers Sites.                                            |
| Styling     | Tailwind v4 + shadcn-svelte (vended)      | shadcn components copy-pasted into `src/lib/components/ui`.          |
| Backend     | Supabase (Postgres + Auth + Storage)      | One client lib (`@supabase/supabase-js` via `@supabase/ssr`).        |
| Auth        | Magic-link (OTP) only                     | No password, no OAuth in v1.                                         |
| Music       | Songlink / Odesli `v1-alpha.1` API        | Public endpoint, no key needed for non-commercial use.               |
| OG image    | `workers-og`                              | Cloudflare-runtime port of `@vercel/og`. Renders at request time.    |
| Hosting     | Cloudflare Pages                          | Free tier, edge SSR, deploy on push.                                 |
| Package mgr | pnpm                                      | Faster install, smaller `node_modules`. Lockfile committed.          |
| Tests       | Vitest for unit (lib helpers) only        | Playwright deferred until there's UI worth E2E-ing.                  |

---

## Final repo layout

```
mixtape/
├── .env.example                    ← committed; documents required vars
├── .gitignore
├── .nvmrc                          ← pin Node 20
├── .npmrc                          ← engine-strict, public-hoist-pattern for shadcn
├── .prettierrc
├── eslint.config.js
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── svelte.config.js                ← adapter-cloudflare, alias setup
├── tailwind.config.ts
├── tsconfig.json                   ← strict: true, noUncheckedIndexedAccess: true
├── vite.config.ts
├── components.json                 ← shadcn-svelte config
├── wrangler.toml                   ← optional, only for `wrangler pages dev`
├── CLAUDE.md                       (existing)
├── PLAN.md                         (this file)
├── README.md                       ← thin pointer to CLAUDE.md
├── docs/                           (existing)
├── supabase/
│   ├── config.toml                 ← `supabase init` output, edited
│   ├── migrations/
│   │   ├── 0001_init_schema.sql
│   │   ├── 0002_rls_policies.sql
│   │   └── 0003_storage_buckets.sql
│   └── seed.sql                    ← two fake users + a few songs for local dev
├── static/
│   ├── favicon.png
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable.png
│   ├── apple-touch-icon.png
│   └── manifest.webmanifest
└── src/
    ├── app.html                    ← OG meta placeholders, theme-color
    ├── app.css                     ← Tailwind + design tokens
    ├── app.d.ts                    ← App.Locals: { supabase, getSession }
    ├── hooks.server.ts             ← Supabase SSR client + auth guard
    ├── lib/
    │   ├── components/
    │   │   ├── ui/                 ← shadcn-svelte (Button, Input, Dialog, etc.)
    │   │   ├── SongRow.svelte      ← list item: art / title / artist / story preview
    │   │   ├── ShareButton.svelte  ← wa.me deep-link
    │   │   └── AskButton.svelte    ← per-song "Ask about this song"
    │   ├── server/                  ← never bundled to client
    │   │   ├── supabase.ts          ← createServerClient factory
    │   │   ├── service-client.ts    ← service-role client (cache writes only)
    │   │   ├── songlink.ts          ← resolve(url) → normalized song; uses songlink_cache
    │   │   ├── og-image.ts          ← workers-og mosaic renderer
    │   │   └── handle.ts            ← reserved-list check + validation
    │   ├── supabase.ts              ← createBrowserClient factory
    │   ├── types.ts                 ← Profile, Song, Story, Media, SonglinkPayload
    │   ├── utils/
    │   │   ├── handle.ts            ← regex validator, slugify
    │   │   ├── share.ts             ← buildWaMeUrl(text)
    │   │   └── format.ts            ← year-range, song-count copy ("7 songs · 1974 — 2022")
    │   └── og/
    │       └── mosaic.ts            ← layout primitives shared by og-image renderer
    ├── params/
    │   └── handle.ts                ← matcher: lowercase, 2–32 chars, not reserved
    └── routes/
        ├── +layout.svelte
        ├── +layout.server.ts                ← loads session for every page
        ├── +page.svelte                     ← landing (prerendered)
        ├── +page.ts                         ← `export const prerender = true`
        ├── login/
        │   ├── +page.svelte                 ← email input + form
        │   └── +page.server.ts              ← action: signInWithOtp
        ├── auth/
        │   └── callback/
        │       └── +server.ts               ← exchange code → cookie session
        ├── logout/
        │   └── +server.ts                   ← signOut and redirect
        ├── onboarding/
        │   ├── +page.svelte                 ← claim handle + display name
        │   └── +page.server.ts              ← action: insert into profiles
        ├── me/
        │   └── +server.ts                   ← redirect → /{own-handle}/edit
        ├── api/
        │   └── songlink/
        │       └── +server.ts               ← POST: resolve user-pasted URL (auth-required)
        └── [handle=handle]/
            ├── +page.svelte                 ← public playlist view
            ├── +page.server.ts              ← load profile + songs + stories
            ├── og.png/
            │   └── +server.ts               ← workers-og PNG response
            ├── ask/
            │   └── [song]/
            │       └── +server.ts           ← log click + 302 to wa.me
            └── edit/
                ├── +page.svelte             ← owner-only editor
                └── +page.server.ts          ← actions: addSong, editStory, removeSong, reorder
```

A couple of layout decisions worth flagging:

- **`/{handle}` lives behind a `params` matcher** so reserved routes (`login`, `auth`, `onboarding`, `me`, `api`, `static`-ish names) cannot be claimed as handles. The matcher is the single source of truth — both URL routing and the handle-claim form check the same allow/deny list.
- **`/me` is a redirect**, not a separate UI tree. The owner edits at `/{their-handle}/edit`. This keeps the canonical URL stable in the address bar — important when the share button reads `window.location`.
- **`og.png/+server.ts`** is a route, not a static asset. Cloudflare's edge cache + an ETag derived from the playlist's `updated_at` provides the invalidation story without us hand-rolling KV.

---

## Bootstrap sequence

The order matters: each step should leave the repo in a runnable state.

### 1. Initialize SvelteKit + TypeScript

- `pnpm create svelte@latest .` — Skeleton template, TypeScript syntax, ESLint, Prettier. **Decline** Playwright and Vitest at this prompt (we'll add Vitest selectively).
- Edit `tsconfig.json`: confirm `"strict": true`; add `"noUncheckedIndexedAccess": true` and `"exactOptionalPropertyTypes": true`. CLAUDE.md says no `any` — these flags catch the common escape hatches.
- Add `.nvmrc` pinning Node 20 (Cloudflare Pages runtime supports up to 20 reliably).
- Add a thin `README.md` that points to `CLAUDE.md` and `PLAN.md`.

### 2. Tailwind + shadcn-svelte

- `pnpm dlx svelte-add@latest tailwindcss` (or manual: install `tailwindcss`, `postcss`, `autoprefixer`, write `tailwind.config.ts`, add `@import 'tailwindcss'` to `src/app.css`).
- `pnpm dlx shadcn-svelte@latest init`. When prompted:
  - Style: `default`
  - Base color: `slate` (we'll tweak tokens in `app.css` to lean warm/contemplative)
  - Components dir: `src/lib/components/ui`
  - Utilities: `src/lib/utils.ts`
- Pre-install only the components v1 actually needs: `Button`, `Input`, `Label`, `Textarea`, `Dialog`, `DropdownMenu`, `Toast`. Defer the rest.
- Edit `app.css` to define design tokens (paper-white background, ink-black text, single accent). Match the visual direction in `docs/mockups/whatsapp-unfurl.html`.

### 3. Cloudflare adapter

- `pnpm add -D @sveltejs/adapter-cloudflare` and remove `adapter-auto`.
- In `svelte.config.js`: `import adapter from '@sveltejs/adapter-cloudflare'` and configure with default options.
- Add `wrangler.toml` (optional, only used by `wrangler pages dev` for local CF emulation):
  ```toml
  name = "mixtapestory"
  compatibility_date = "2026-05-01"
  pages_build_output_dir = ".svelte-kit/cloudflare"
  ```
- Verify `pnpm build` produces `.svelte-kit/cloudflare/`.

### 4. Supabase: local stack + SSR client

- Install: `pnpm add @supabase/supabase-js @supabase/ssr`.
- `pnpm add -D supabase` and `pnpm exec supabase init` to create `supabase/config.toml`.
- `pnpm exec supabase start` boots local Postgres + GoTrue + Storage in Docker.
- Wire `src/hooks.server.ts` to construct a per-request server client via `@supabase/ssr`'s `createServerClient`, attach it to `event.locals.supabase`, and expose `event.locals.getSession()` (a memoized `getUser()` call — `getSession()` alone trusts the cookie without re-verifying with Supabase, which `@supabase/ssr` warns against).
- `src/lib/supabase.ts` for the browser uses `createBrowserClient` with the anon key.
- `src/lib/server/service-client.ts` constructs a service-role client for one narrow use: writing to `songlink_cache` from server endpoints. Never ship the service-role key to the client and never use it inside any code path that handles user input as data.

### 5. Database schema, RLS, and storage

Three migrations, applied via `pnpm exec supabase db reset` locally and `supabase db push` against the remote project.

Full SQL is in [Database schema](#database-schema) below. The shape:

- `profiles` — 1:1 with `auth.users`. Holds `handle` (the URL slug) + `display_name`.
- `songs` — per-user rows. Holds Songlink-resolved metadata + the original input URL.
- `songlink_cache` — shared, keyed by normalized input URL, populated server-side by service-role.
- `stories` — 1:1 with songs. Story.song_id matches the type sketch in CLAUDE.md.
- `story_media` — empty in v1; the table exists so v1.1 audio uploads are purely additive.
- `ask_clicks` — append-only log of `wa.me` redirects, used to compute "X asked" counts.

RLS posture:

- All public-readable rows (`profiles`, `songs`, `stories`, `story_media`) have a permissive `select` policy. The product is a public playlist by design.
- Writes are gated by `owner_id = auth.uid()` (directly, or transitively via `songs`).
- `ask_clicks` allows anonymous inserts (a viewer doesn't need an account to click "Ask"). Selects are restricted to the song owner — but we'll surface counts via a `security definer` view so unauthenticated viewers can still see "3 asked" without reading the underlying rows.
- `songlink_cache` has RLS enabled with **no policies** — anon and authenticated roles get nothing; only the service-role key (which bypasses RLS) reads/writes it.

Storage bucket: a single `media` bucket, `public: false`. Owner-write storage policies are deferred to the v1.1 voice-memo work; v1 just provisions the bucket so `0003` doesn't have to be edited later.

### 6. Auth flow (magic-link)

The four moving parts:

1. **`/login` form** posts an email to a server action, which calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ${PUBLIC_SITE_URL}/auth/callback }})`.
2. **Email** is sent by Supabase's transactional service (templates customized in the Supabase dashboard so they don't say "Supabase" anywhere).
3. **`/auth/callback`** receives `?token_hash=...&type=...`, calls `supabase.auth.verifyOtp(...)`. `@supabase/ssr` writes the session cookie. Then redirect: `/onboarding` if no profile exists, otherwise `/{handle}/edit`.
4. **`/logout`** calls `supabase.auth.signOut()` and redirects home.

`hooks.server.ts` includes a route guard: paths under `/onboarding`, `/me`, and `/{handle}/edit` require `event.locals.getSession()`; otherwise redirect to `/login?next=...`.

### 7. Profile / handle claiming

- `/onboarding` is reachable only when authenticated and no `profiles` row exists yet.
- The form takes `handle` and `display_name`. Validates against `src/lib/server/handle.ts`:
  - Regex: `^[a-z][a-z0-9-]{1,30}[a-z0-9]$`
  - Not in reserved list (`login`, `logout`, `auth`, `api`, `onboarding`, `me`, `static`, `_app`, etc.)
  - Not already taken (DB unique constraint catches the race; the form returns a friendly error)
- On success, insert into `profiles` and redirect to `/{handle}/edit`.

### 8. Skeleton routes

Each route gets a placeholder that compiles + renders, so the build is green from day one. Real UI lands in feature commits, not in scaffold.

| Route                              | What it does in v1 scaffold                                            |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `/`                                | Static landing: one paragraph + "Sign in" link. Prerendered.           |
| `/login`                           | Email form → magic link. POST action → `signInWithOtp`.                |
| `/auth/callback`                   | Verify OTP, set session cookie, redirect.                              |
| `/logout`                          | Sign out and redirect home.                                            |
| `/onboarding`                      | Claim handle + display name.                                           |
| `/me`                              | Redirect to `/{own-handle}/edit`.                                      |
| `/{handle}`                        | Public playlist view (SSR). Empty-state if no songs.                   |
| `/{handle}/edit`                   | Owner-only editor. Form actions: `addSong`, `editStory`, `removeSong`. |
| `/{handle}/og.png`                 | 1200×630 mosaic PNG via `workers-og`.                                  |
| `/{handle}/ask/{song}`             | Log click, 302 to `wa.me` deep-link.                                   |
| `/api/songlink`                    | POST `{ url }` → resolved Song, cached. Auth-required.                 |

### 9. Songlink integration

Server-only module at `src/lib/server/songlink.ts`:

```ts
export async function resolveSongUrl(rawUrl: string, fetch: typeof globalThis.fetch): Promise<ResolvedSong>
```

Behavior:

1. Normalize the input URL (strip query params Spotify/Apple add for tracking).
2. Hit `songlink_cache` keyed on the normalized URL. If hit → return.
3. Otherwise call `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`.
4. Extract `entitiesByUniqueId[<spotify or apple id>]` for canonical title/artist/album/thumbnailUrl/isrc.
5. Insert into `songlink_cache` via the service-role client.
6. Return the canonical fields plus `pageUrl` (the cross-platform redirector).

The `addSong` action on `/{handle}/edit` calls this, then inserts into `songs` with the resolved fields. Album art is referenced by URL, not downloaded — Cloudflare's image proxy can be added later if hot-linking gets flaky.

Failure modes to surface in UI:

- Songlink couldn't resolve the URL → "We couldn't recognize this link. Try a Spotify, Apple Music, or YouTube Music URL."
- Rate limited → 60s backoff + retry once; otherwise the same UX message.

### 10. OG image generation

`/{handle}/og.png` is the single most important pixel surface in the product (per `docs/design-notes.md`). The endpoint:

1. Loads profile + first 9 songs (ordered by position) including their `album_art_url`.
2. Composes a 3×3 mosaic — falling back to 2×2 if fewer than 9 songs, or a single-art card if 1–3 songs.
3. Overlays `{Display Name}'s soundtrack` and `{count} songs · {year_range}` using the same typography as the on-page header.
4. Returns PNG with:
   - `Cache-Control: public, max-age=60, s-maxage=86400, stale-while-revalidate=86400`
   - `ETag: "{playlist.updated_at-timestamp}"`
5. The page's `<meta property="og:image">` URL appends `?v={updated_at}` so a song-add invalidates the unfurl naturally.

Implementation uses `workers-og`'s JSX-like API. Album art is fetched in parallel inside the worker; if any fails, fall back to a tinted placeholder rather than failing the whole image.

### 11. WhatsApp share + Ask flow

Two small surfaces, both rooted in `wa.me`:

- **Share to WhatsApp** button on `/{handle}` reads `${PUBLIC_SITE_URL}/{handle}` and opens `https://wa.me/?text={encoded url}`. Just an anchor — no JS needed.
- **Ask about this song** button on each row links to `/{handle}/ask/{song}`. The endpoint:
  1. Inserts a row into `ask_clicks` (anon-allowed).
  2. 302s to `https://wa.me/?text={encoded message}` where the message is `"Hey {display_name}, tell me about {Song} — {Artist}? {playlist_url}"`.

The "X asked" count is computed by a `count(*) from ask_clicks where song_id = ?` — done in the page load function. If write volume gets noisy, denormalize later.

### 12. PWA manifest + icons

- `static/manifest.webmanifest` — `display: standalone`, `start_url: /`, `theme_color`, `background_color`, icon set (192, 512, maskable).
- Reference from `app.html`: `<link rel="manifest" ...>`, `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable">`.
- No service worker in v1. SvelteKit's built-in service worker support is opt-in; we skip it to avoid stale-asset bugs in a contemplative-writing audience that won't tolerate them.

### 13. Cloudflare Pages deploy

- Create the Pages project (one-time) pointed at the GitHub repo.
- Build command: `pnpm install --frozen-lockfile && pnpm build`. Output dir: `.svelte-kit/cloudflare`.
- Compatibility date: `2026-05-01`. Compatibility flags: `nodejs_compat` (Supabase SDK uses some Node built-ins).
- Set env vars in the Pages dashboard (mirror of `.env.example`, see below).
- First deploy: auto-builds on push to `main`. Preview deploys for branches.
- Domain: `mixtapestory.com` apex + `www` redirect, via Cloudflare DNS. `PUBLIC_SITE_URL` set accordingly.

The Supabase remote project is created separately (one-click in dashboard); push migrations with `pnpm exec supabase db push` and configure the auth email templates and the `Site URL` and `Redirect URLs` to include `https://mixtapestory.com/auth/callback`.

---

## Database schema

To be split across `0001_init_schema.sql`, `0002_rls_policies.sql`, and `0003_storage_buckets.sql`.

```sql
-- 0001_init_schema.sql

create extension if not exists "pgcrypto";

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique not null,
  display_name  text not null,
  bio           text,
  created_at    timestamptz not null default now()
);

create table songs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,
  position            integer not null,
  isrc                text,
  title               text not null,
  artist              text not null,
  album               text,
  release_year        integer,
  album_art_url       text,
  songlink_url        text,                -- the Odesli pageUrl (router)
  songlink_input_url  text not null,        -- whatever URL the user pasted, normalized
  added_at            timestamptz not null default now()
);
create index songs_owner_position_idx on songs (owner_id, position);

create table songlink_cache (
  cache_key   text primary key,             -- normalized input URL or "isrc:XXXX"
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

create table stories (
  id          uuid primary key default gen_random_uuid(),
  song_id     uuid not null unique references songs(id) on delete cascade,
  text        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table story_media (
  id                uuid primary key default gen_random_uuid(),
  story_id          uuid not null references stories(id) on delete cascade,
  kind              text not null check (kind in ('audio', 'image')),
  storage_path      text not null,
  duration_seconds  integer,
  position          integer not null default 0,
  created_at        timestamptz not null default now()
);

create table ask_clicks (
  id           bigint generated always as identity primary key,
  song_id      uuid not null references songs(id) on delete cascade,
  fingerprint  text,
  created_at   timestamptz not null default now()
);
create index ask_clicks_song_idx on ask_clicks (song_id);

-- Public-facing count view; reads ask_clicks via security definer to bypass RLS.
create view ask_counts
  with (security_invoker = false) as
  select song_id, count(*)::bigint as count from ask_clicks group by song_id;
```

```sql
-- 0002_rls_policies.sql

alter table profiles       enable row level security;
alter table songs          enable row level security;
alter table stories        enable row level security;
alter table story_media    enable row level security;
alter table ask_clicks     enable row level security;
alter table songlink_cache enable row level security;

-- profiles
create policy profiles_select_all
  on profiles for select using (true);
create policy profiles_insert_self
  on profiles for insert with check (id = auth.uid());
create policy profiles_update_self
  on profiles for update using (id = auth.uid());

-- songs
create policy songs_select_all
  on songs for select using (true);
create policy songs_modify_own
  on songs for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- stories
create policy stories_select_all
  on stories for select using (true);
create policy stories_modify_own
  on stories for all
  using (exists (
    select 1 from songs s
    where s.id = stories.song_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from songs s
    where s.id = stories.song_id and s.owner_id = auth.uid()
  ));

-- story_media (mirrors stories)
create policy story_media_select_all
  on story_media for select using (true);
create policy story_media_modify_own
  on story_media for all
  using (exists (
    select 1 from stories st
    join songs s on s.id = st.song_id
    where st.id = story_media.story_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from stories st
    join songs s on s.id = st.song_id
    where st.id = story_media.story_id and s.owner_id = auth.uid()
  ));

-- ask_clicks: anyone can insert; only owner can select underlying rows.
-- Aggregated counts go through the `ask_counts` view, which is queryable
-- by anon via the SECURITY DEFINER property.
create policy ask_clicks_insert_anyone
  on ask_clicks for insert with check (true);
create policy ask_clicks_select_owner
  on ask_clicks for select
  using (exists (
    select 1 from songs s
    where s.id = ask_clicks.song_id and s.owner_id = auth.uid()
  ));

-- songlink_cache: RLS enabled, no policies → only service-role can touch it.
```

```sql
-- 0003_storage_buckets.sql

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Storage policies for the `media` bucket are intentionally not added here;
-- the bucket is unused in v1. v1.1 voice-memo work adds owner-scoped policies.
```

A note on `ask_counts`: with `security_invoker = false`, the view runs with the view-creator's privileges (postgres / supabase_admin). That bypasses RLS on `ask_clicks` for read purposes, which is what we want — but it also means we should grant `select` on the view explicitly to `anon` and `authenticated`:

```sql
grant select on ask_counts to anon, authenticated;
```

(Add to `0002`.)

---

## Environment variables

`.env.example` (committed) and `.env.local` (gitignored) document and supply these:

| Variable                     | Where used   | Notes                                                                  |
| ---------------------------- | ------------ | ---------------------------------------------------------------------- |
| `PUBLIC_SUPABASE_URL`        | client + svr | Supabase project URL.                                                  |
| `PUBLIC_SUPABASE_ANON_KEY`   | client + svr | Anon key. Safe to ship.                                                |
| `SUPABASE_SERVICE_ROLE_KEY`  | server only  | Used only by `service-client.ts` to write `songlink_cache`.            |
| `PUBLIC_SITE_URL`            | client + svr | `https://mixtapestory.com` in prod; `http://localhost:5173` locally.   |

`PUBLIC_*` is SvelteKit's convention for client-readable env vars (via `$env/static/public`). The service-role key uses `$env/static/private` and must never appear in code under `src/lib/` (only `src/lib/server/`).

---

## Open product questions still affecting scaffold decisions

These are surfaced from `docs/design-notes.md` because they can't be papered over by the scaffold:

1. **"X asked" visibility** — design-notes leans toward visible-to-everyone. The scaffold assumes that: the `ask_counts` view is readable by anon. If we change to creator-only, we'd remove the public grant on the view and the `/{handle}` page just stops showing the count. Cheap to flip.
2. **What `Ask about this song` does** — design-notes commits to (a): `wa.me` deep-link with click counting. The scaffold matches: no notifications backend, just `ask_clicks` + redirect.
3. **Discovery** — design-notes leans invite-link only. The scaffold matches: no group/circle table, no public directory. The landing page is intentionally minimal.

If any of these flip, the schema doesn't break — but pages 1 and 3 would need product-level rework.

---

## Definition of done for v1 scaffold

The scaffold is "done" when, on a fresh checkout:

- [ ] `pnpm install && pnpm exec supabase start && pnpm dev` boots a working app.
- [ ] A new user can sign up via magic link, claim a handle, and reach `/{handle}/edit`.
- [ ] Adding a Spotify URL on `/{handle}/edit` resolves via Songlink, persists, and renders on `/{handle}`.
- [ ] `/{handle}` SSRs with correct `og:title`, `og:description`, and an `og:image` URL pointing to `/{handle}/og.png`.
- [ ] `/{handle}/og.png` returns a 1200×630 PNG.
- [ ] `pnpm build` produces a deployable Cloudflare Pages bundle without errors.
- [ ] A `pnpm exec supabase db reset` re-creates the schema and RLS policies cleanly.
- [ ] An anon user clicking "Ask about this song" gets redirected to `wa.me` and the click is logged.

UI polish (typography, spacing, real empty states, the actual mosaic layout matching `docs/mockups/whatsapp-unfurl.html`) is **not** part of the scaffold — it's the next phase.

---

## What's deliberately deferred (per `CLAUDE.md` non-goals)

- In-browser audio recording (v2).
- Voice-memo upload UI (v1.1) — table and bucket exist, no UI.
- Multi-playlist per user — schema currently has no `playlists` table; songs hang off `profiles` directly. Adding a `playlists` table later is straightforward and will require a one-pass migration of existing songs into a default playlist row.
- Reorder + edit-song-metadata UI (v1.1) — the schema supports both (`position`, all fields mutable); only the editor UI is omitted.
- Account deletion / data export — required eventually, not v1.
- Service worker / offline mode — explicitly skipped to avoid stale-asset bugs.
- Playwright E2E — defer until UI is real enough to test.
- Following / activity feed — likely never.

---

## Sequence to follow when implementing

**Phase 0 (POC) — do these first, deploy, then stop and review.**

0a. Steps 1 → 3 (SvelteKit + Tailwind + Cloudflare adapter), but land *only* the POC routes (`/`, `/bryan`) and components (`src/lib/components/poc/*`, `src/lib/seed/*`). Skip Supabase, auth, and any feature route. Commit.

0b. Author `bryan.csv` with a real first cut of songs + stories. Wire `/bryan/+page.server.ts` to parse and render.

0c. Add the static `og:image` and OG meta tags on `/bryan`. Add `static/robots.txt`.

0d. Configure DNS + first Cloudflare Pages deploy to `mixtapestory.com`. Walk the WhatsApp paste test on a real phone. Run through the POC "definition of done" checklist.

**Phase 1 (v1 scaffold) — only after POC is live and the WhatsApp unfurl looks right.**

1. Step 4 (Supabase clients + hooks). Commit.
2. Step 5 (migrations + RLS). Commit. Run `supabase db reset` and verify with a hand-written `psql` smoke check.
3. Steps 6 → 7 (auth + onboarding). Commit. Manually walk the magic-link flow against the local stack.
4. Step 8 (skeleton routes that compile but don't yet do their final job). Commit.
5. Step 9 (Songlink). Commit. Verify by pasting one Spotify URL through `/api/songlink`.
6. Step 10 (OG image). Commit. Eyeball one rendered PNG locally.
7. Step 11 (share + ask). Commit.
8. Step 12 (PWA manifest + icons). Commit.
9. Step 13 (deploy). First production deploy. Smoke-check the unfurl with a real WhatsApp paste.

After step 13, the scaffold work is done and feature-by-feature polish begins.
