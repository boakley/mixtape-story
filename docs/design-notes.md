# Design Notes

Longer-form context that doesn't need to be re-read every session. `CLAUDE.md` carries the operative decisions; this document explains the reasoning behind them and tracks open questions.

## On the name "mixtape story"

The product was originally framed as a "soundtrack of one's life" — a person's curated set of touchstone songs with stories attached. The framing shifted to "mixtape story" because **mixtape** is a richer cultural anchor:

- A soundtrack accompanies *one* life or *one* movie. Monotonic.
- A mixtape is naturally pluralistic — multiple mixtapes can exist by different people about the same person, the same artist, the same memorial. The metaphor scales to audiences a "soundtrack" framing doesn't.
- "Mixtape" carries cultural freight that "soundtrack" doesn't: care, time, the specific gesture of *I want you to hear these songs in this order because of who I am or who you are.* That gesture **is** the product.

**Generational note worth keeping in mind:** "mixtape" lands hardest with people who actually made cassette mixtapes (roughly Gen X and older Millennials). For Gen Z and younger, the word may not carry the same nostalgia — it'll register as a music-genre term (mixtape as in hip-hop release) or just a word for "playlist." This is fine for v1 (the writing group skews older) but worth noting if/when the audience widens. Don't lean so hard on cassette-tape iconography that the product feels like it's not for younger audiences.

## The "many-fans-one-artist" insight

Worth recording: the broader product framing emerged from the observation that fans making mixtape-stories about an indie artist's catalog would be a remarkable gift to that artist — *imagine reading why your songs matter to people, in their own words.* That's the kind of generative product idea worth saving carefully.

It is **not** v1. Building for an artist-audience requires features (discovery, multi-mixtape browsing, artist landing pages, possibly artist verification) that the writing-group v1 doesn't need. Pivoting v1 to chase this would be a classic prototype-killer: designing for an audience we don't have, missing the milestones the writing group could actually start using next month.

The insight goes here so we don't lose it. The data model in `CLAUDE.md` keeps the door open. v1 ships for the writing group.

## Why a PWA (not native, not Telegram)

The audience is already on WhatsApp. Migrating ~20 people to Telegram (which would unlock Mini Apps and a richer bot API) isn't worth the friction. Native apps are over-budget for the scale. A PWA installable to home screen + WhatsApp link unfurling gets ~90% of the platform feel at ~5% of the build cost.

The implication: **WhatsApp is a distribution channel, not a runtime.** The app lives at mixtapestory.com; WhatsApp's job is to deliver beautiful preview cards into chats and accept tap-throughs. We don't build inside WhatsApp.

## Songlink / Odesli routing

Each song in a mixtape is stored once with its identifying metadata (title, artist, ISRC if available). When a user taps a song, we route through the Songlink/Odesli API rather than hard-linking to one streaming service. Each viewer ends up in *their* preferred service — Spotify users land in Spotify, Apple Music users land in Apple Music — without us asking.

API details:

- Free for non-commercial use. If we ever monetize, revisit.
- Cache responses in our DB. Songlink is rate-limited and slow on cold lookups.
- Cache key: input URL or ISRC. Cache invalidation: never (a song's cross-platform mapping is effectively permanent).

## Open Graph cards

The unfurl card is the single most important pixel real estate in the product — it's where most of the funnel conversion happens. Requirements:

- `og:title` — `{Name}'s mixtape` (e.g. "Sam's mixtape")
- `og:description` — `{N} songs · {year_range}` (e.g. "7 songs · 1974 — 2022")
- `og:image` — 1200×630 PNG generated server-side. A 2×2 or 3×3 mosaic of album art covers, with the title typeset over a slight gradient. Generated at request time; cached aggressively (album art doesn't change once a song is added).
- `og:url`, `og:type=website`, `twitter:card=summary_large_image`

The image is *not* optional and *not* a generic logo. The whole appeal is recognizing "oh, that's Sam's specific mixtape" at a glance.

Implementation: `workers-og` (Cloudflare-compatible port of `@vercel/og`). Cache by mixtape version hash so a song add invalidates the previous image. See `docs/mockups/whatsapp-unfurl.html` for the visual target.

## Voice memo modes (post-v1)

Three modes for how voice memos relate to song playback:

1. **Independent** *(planned for v1.1)* — voice memo is a standalone clip in our app. Song plays wherever the user opens it. Simplest. Ships first.
2. **Sequential** *(possible v2.5)* — tap song → ~30s commentary plays in-app → hand off to streaming service for the actual song. Closer to "director's commentary" metaphor but adds UX complexity (the handoff moment is awkward).
3. **Overlaid** *(out of scope)* — voice over actual song audio. Would require licensing the songs themselves, which defeats the entire Songlink-routing architecture.

The director's commentary metaphor pulls toward Sequential, but Independent is enough to ship and learn from. Don't pre-build for Sequential.

## Open product questions

These are unresolved. Don't paper over them with code defaults — surface them when relevant.

### Should the "X asked" count be visible to viewers, or only to the creator?

Visible creates social proof (3 friends already asked about this song → I'm curious too) but nudges everyone toward the songs that already have heat, starving quieter songs of attention.

**Tentative lean:** visible to everyone. The social proof effect is real and the creator likes seeing the heat. But worth being deliberate.

### What does the "Ask about this song" button actually do?

Three options ascending in build cost:

- **(a)** Opens a `wa.me` deep-link to the playlist owner pre-filled with "Hey, tell me about {song}?". Zero backend, ships tomorrow.
- **(b)** Writes a row to our DB and pings the owner in-app. Requires notifications.
- **(c)** Both.

**For v1: (a).** Track click counts via a redirect endpoint so we can still show "X asked" without storing the messages themselves.

### Discovery within the group

How do friends find each other's mixtapes? Three shapes:

- **Invite-link only** — every share is intentional. Most private. Closest to existing group-chat behavior.
- **Members directory** — a shared "people in this group" page. Adds a "group" or "circle" concept to the data model.
- **Public landing** — `mixtapestory.com` itself shows recent activity. Wrong fit for a contemplative-writing audience and bleeds into territory v1 explicitly avoids (broader audiences).

Worth deciding before the data model gets schema'd. Probably **invite-link only** for v1; revisit if the group asks for a directory.

### What's at the root URL `mixtapestory.com/`?

Three options:

- **A landing page** explaining the product. Tagline ("Share the songs, share the stories"), a couple of example mixtapes, a "make your own" CTA. Reads as a real product to outside visitors. The right answer if the product brand matters even at v1.
- **A redirect to the user's own mixtape** when logged in, landing page when not.
- **Just a sign-in prompt.** Ugly but cheap.

**Tentative lean:** simple landing page with the tagline, two example mixtapes (built from the writing-group's own data once they exist), sign-in link. Don't over-invest — this is a v1 decision that gets reconsidered when audience widens.

## Things explicitly *not* in v1

Avoid scope creep. These are deliberate omissions:

- In-browser audio recording (v2)
- Following / activity feed (probably never in current scope)
- Comments on songs — asks-via-WhatsApp covers the same need without us building a comments system
- Public discovery beyond the group
- Multiple mixtapes per user (one per user in v1; schema supports more)
- Reordering songs after publish (v1.1)
- Editing song metadata after add (v1.1)
- Account deletion / data export — required eventually, not in v1
- Artist audiences, memorials, business mixtapes (post-v1, separate planning)
- Theming, branding, custom domains (post-v1, audience-driven)

## Naming and tone

Product writing should match the audience: a contemplative writing group of adults. Neither breezy-startup nor twee. Short, plain, honest. Mixtape framing leans warm and personal but never coy.

- ✓ "7 songs · 1974 — 2022"
- ✗ "Sam's epic life mixtape! 🎶"
- ✓ "Ask about this song"
- ✗ "Drop Sam a note"
- ✓ "Share the songs, share the stories."
- ✗ "Your life. Your soundtrack. Your story."

Empty states get one line each. No exclamation points. No emoji in product copy (users may use them in their own stories — that's their voice, not ours).
