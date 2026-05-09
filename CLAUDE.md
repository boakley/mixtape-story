# mixtapestory.com

A web app for making and sharing **mixtape stories** — a curated collection of songs, each accompanied by writing about why that song matters. The mixtape is the artifact; the stories are what make it personal.

- **Domain:** mixtapestory.com
- **Tagline (working):** "Share the songs, share the stories."
- **URL pattern:** `mixtapestory.com/{handle}` — personal mixtapes (`/sam`, `/margaret`).

## v1 audience

A small contemplative-writing group of about 20 people, all known to each other, sharing through an existing WhatsApp group. Mobile-first PWA — no native app, no app stores. The "share to friends" moment must feel polished; the rest can be utilitarian.

**v1 is the writing group, period.** Resist the pull of broader audiences (see "Foundation for future audiences" below). Building for one well-known audience and shipping is worth more than building for four hypothetical ones and stalling.

## Stack

- **SvelteKit** (TypeScript, strict). Chosen over Next.js for smaller bundles, simpler mental model, better mobile performance.
- **Supabase** for backend: Postgres, auth (magic-link email), and Storage. One service, one client library.
- **Cloudflare Pages** for hosting. Free tier, global edge, automatic HTTPS, deploys on `git push`. Use `@sveltejs/adapter-cloudflare`.
- **Tailwind CSS** + **shadcn-svelte** for UI. shadcn-svelte components are copy-pasted into the codebase, not installed as a dependency — modify freely.
- **Songlink / Odesli API** for cross-platform music routing. Free for non-commercial use. Converts any single-service link into a multi-service redirect so each viewer opens songs in their own preferred streaming app.

## Vocabulary

Use these words consistently in code, copy, and PRs:

- **Mixtape** — a collection of songs by one creator, with optional stories attached. The top-level artifact.
- **Story** — the writing (and eventually voice) attached to a single song within a mixtape. Not all songs need stories.
- **Song** — the music itself. Stored once with metadata; the same song can appear in multiple mixtapes.
- **Creator** — the user who made a mixtape.
- **Author** — the user who wrote a particular story. In v1 always the same as the creator; the schema keeps them separate.

Avoid: "playlist" (too generic, and our thing is richer than a playlist), "soundtrack" (the original framing — superseded), "track" (use "song").

## Data model

A `Story` attached to a `Song` within a `Mixtape` is a richer object than just a text field. Even in v1:

```ts
type Mixtape = {
  id: string
  creator_id: string         // FK → users
  handle: string             // unique; appears in URL as /{handle}
  title: string              // e.g. "Sam's mixtape"
  visibility: 'private' | 'link' | 'public'  // v1 uses 'link' only
  created_at: timestamp
  published_at: timestamp | null
}

type MixtapeSong = {           // join table — keeps song order per mixtape
  mixtape_id: string
  song_id: string
  position: number
}

type Song = {
  id: string
  title: string
  artist: string
  release_year: number | null
  isrc: string | null          // when available; preferred for Songlink
  songlink_url: string | null  // cached redirect URL
}

type Story = {
  id: string
  mixtape_id: string           // FK → mixtapes
  song_id: string              // FK → songs
  author_id: string            // FK → users (separate from mixtape.creator_id)
  text: string                 // the written story (v1)
  media: Media[]               // empty in v1; populated in v1.1+
  created_at: timestamp
}

type Media = {
  id: string
  type: 'audio' | 'image'
  storage_path: string
  duration_seconds?: number
}
```

**Why these specific shapes — three foundation decisions worth understanding:**

1. **`Mixtape` is its own entity, not embedded in `User`.** A user has zero or more mixtapes. v1 enforces ≤1 in app logic, *not* in the schema. Future audiences (multiple mixtapes per user, organizations owning mixtapes) need no migration.

2. **`Story.author_id` is separate from `Mixtape.creator_id`.** v1 enforces they match in app logic. Future audiences (many fans co-authoring a mixtape about an artist; family co-authoring a memorial mixtape) work without migration.

3. **`Story.media[]` exists in v1 even though v1 doesn't write to it.** Voice memos slot in later as additions to the array; no schema migration. Build read/write paths now to handle the empty array gracefully.

## Staged feature path

- **v1 (MVP):** Text stories only. Data model and Storage bucket already provisioned for media. WhatsApp share + Open Graph unfurl working. Songlink routing working. One mixtape per user, link-only visibility.
- **v1.1:** Upload existing audio files as voice memos (iPhone Voice Memos / Android equivalents → upload → attach to story). No in-browser recording yet.
- **v2:** In-browser MediaRecorder UI with waveform display, once v1.1 has proven the feature is used.
- **v2+:** Other audiences (see below). Separate planning effort, not v1 scope creep.

## Design north star

**"Director's commentary, but for songs."** Mixtape is the wrapper, but the soul of the product is the writing-alongside-music gesture: making a mixtape *for* someone is a specific human act of care. The song is the *primary* artifact; the writing is a *layer* on top of it. Listening to either alone is valid.

When in doubt, the song stays the hero, the story sits alongside.

See `docs/design-notes.md` for the longer reasoning and `docs/mockups/whatsapp-unfurl.html` for the visual direction.

## WhatsApp distribution

WhatsApp is a **distribution channel, not a platform.** The app lives on the open web. Two mechanisms:

1. **`wa.me` Click-to-Chat links** — every mixtape page has a "Share to WhatsApp" button that opens WhatsApp with the URL pre-filled.
2. **Open Graph link unfurling** — when someone pastes a mixtapestory.com URL into any chat, it unfurls into a preview card. Every public mixtape page **must** serve correct OG tags: `og:title`, `og:description`, `og:image` (album-art mosaic, generated server-side). This is the single feature that has to feel right; budget time accordingly.

## Foundation for future audiences

v1 ships for the writing group only. But the same primitives (mixtapes + stories) plausibly serve other audiences over time:

- **Fans → indie artist**: many fans each making a mixtape of one artist's catalog, each with their own stories. Reading them is the gift to the artist. (The originating insight that motivated the broader name.)
- **Memorials**: friends and family co-authoring a mixtape about someone who's passed.
- **Small businesses**: branded mixtapes ("the music we play in our shop, and why").

**These are out of scope for v1.** No code, no UI, no settings, no abstractions built *for* them. The foundation decisions in the data model section above are the only concession — and they cost nothing in v1.

If a v1 design choice would *prevent* one of these futures, flag it and discuss. If a v1 design choice merely *doesn't yet support* one of these futures, that's correct and intentional.

## URL namespace

`/{handle}` resolves to a personal mixtape (the v1 use case). To keep future routes possible without conflicting with personal handles, **reserve these prefixes** as a denylist users cannot claim as handles:

- System: `about`, `api`, `auth`, `login`, `logout`, `signup`, `signin`, `settings`, `account`, `admin`, `help`, `privacy`, `terms`
- Future namespaces: `m`, `a`, `x`, `b` (reserved for `/m/`, `/a/`, etc. if disambiguation becomes necessary)
- Brand: `mixtape`, `story`, `stories`

Centralize this list in `src/lib/handles/reserved.ts`. Validate on signup.

## Conventions

- TypeScript strict mode. No `any`.
- Server-side rendering by default; static prerender only for fully public landing pages.
- Tailwind for styling; avoid raw CSS files except for global tokens.
- `src/lib/server/` for code that must never reach the client; `src/lib/` for shared code.
- Database schema lives in `supabase/migrations/` as SQL. Edit migrations, never the live DB directly.
- **Use Supabase Row Level Security from day one.** Even at 20 users, getting RLS right early prevents nasty refactors.
- Magic-link auth only for v1. No passwords, no OAuth providers yet.
- Product copy: one line each in empty states. No exclamation points. No emoji.

## Cost target

Free-tier on Supabase + Cloudflare Pages + Supabase Storage. The only line item is the domain (~$15/year for `.com`). Total <$20/year through ~100 users. Past that, revisit.

## Workflow with Claude Code

- Use **plan mode** for any change that touches more than a single file.
- Read the relevant existing code before proposing changes; don't pattern-match from generic SvelteKit examples that may not match conventions in this repo.
- When uncertain about a product decision, **ask first** — this is a real product with a defined audience, not a tutorial project. The open questions in `docs/design-notes.md` are explicitly unresolved; don't paper over them with code defaults.
- When tempted to add abstraction "for future audiences," stop. The data model already encodes the foundation decisions that matter. v1 logic should be straightforward and writing-group-shaped.
