# mixtapestory.com — Vision

**Share the songs, share the stories.**

A web app for making and sharing **mixtape stories** — a curated collection of songs, each accompanied by writing about why that song matters. The mixtape is the artifact; the stories are what make it personal. Listening to either alone is valid. Together, they are director's commentary for songs.

## The core gesture

Making a mixtape *for* someone is a specific human act of care — choosing these songs, in this order, because of who you are or who they are. The product exists to honor that gesture, then add a second layer: writing that says *here is why this one matters.* The song stays the hero; the story sits alongside.

This holds across every version of the product. Everything else is scaffolding.

## v1 — The writing group

A small contemplative-writing group of about 20 people, all known to each other, sharing through their existing WhatsApp group.

What ships:

- One mixtape per person at `mixtapestory.com/{handle}`
- Text stories on songs (voice memos arrive in v1.1)
- Songlink routing so each viewer opens songs in their own streaming service
- WhatsApp-shaped distribution: tap-to-share, plus an Open Graph unfurl card that has to feel right
- Magic-link auth, link-only visibility, no public discovery

The writing group is not a beachhead market. It is the audience. Success looks like: most of those 20 people make a mixtape, share it in the group, and reading each other's becomes a small ongoing thing. We get there in weeks, not months, against people whose taste we trust and who don't need the product explained.

The data model already accommodates more — multiple mixtapes per user, separate creator and author identities, audio media on stories — but v1 logic is straightforward and writing-group-shaped. No abstractions built for audiences we don't have.

## v2 — Broader scope

The same primitives — mixtapes plus stories — plausibly serve three other audiences. Each is structurally different from v1, and from each other. None of them ships until v1 has proven the core gesture lands.

**Fans → indie artist.** Many fans, each making a mixtape of one artist's catalog, each with their own stories. Reading them is the gift to the artist. *Imagine reading why your songs matter to people, in their own words.* This is the originating spark behind the broader name. It needs discovery, multi-mixtape browsing per artist, artist landing pages, possibly verification.

**Memorials.** Friends and family co-authoring a mixtape about someone who's passed. Emotionally heavy. Needs co-authorship, careful privacy defaults, and thought about what happens to a memorial as contributors themselves age.

**Small businesses.** Branded mixtapes — *the music we play in our shop, and why.* Commercial, light analytics, custom domains. Effectively a different product wearing the same shape.

What changes between v1 and v2: discovery surfaces, auth and verification models, unfurl templates, pricing, possibly the landing page. What does **not** change: the data model, Songlink routing, the writing-alongside-music gesture, the tone.

v2 is a separate planning effort, not v1 scope creep. Each audience gets evaluated on its own terms — features built, copy rewritten, and where necessary, declined.

## The thread

Constants across every version:

- The song is the primary artifact; the writing is the layer.
- The viewer opens songs in their own streaming service. We never ask them to switch.
- The product lives on the open web at a clean URL. Distribution happens in chat apps; the runtime is the browser.
- Tone is contemplative, plain, honest. Adult. Neither breezy-startup nor twee.

## What this is not

Not a playlist tool. Not a social network. Not an audio platform that hosts music. Not an algorithmic feed of strangers. Not a place to follow people. Not a native app. Not built inside WhatsApp.

The discipline of v1 is also the discipline of v2: build for the audience in front of us, ship for that audience, then decide whether the next audience is worth a separate effort. The data model keeps doors open. The product code does not.
