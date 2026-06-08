# TODO

Single source for everything we've thought about but haven't done yet.
Mix of UX issues, feature ideas, and infra/test work. Conversational
on purpose — these are notes to think with, not tickets. Cull / fold
freely.

* fix ux design issues
  * header stuff: streaming choice, etc) takes up a lot of vertical space
  * should the list of mixtapes in a group be expandable
    Right now I can click to jump to a mixtape, but it might be
    nice to drill into it without having to leave the page
  * all form fields need a (?)
  * it wasn't obvious to some users that a song could be clicked on
    in the compact view to see the story
* features:
  * can we add the ability to start with an actual apple music (or spotify?)
    playlist? Can we have a "play this playlist on apple music" link?
  * generate demos (stashed; largely working)
* by default, e2e tests need to be headless. It should be trivial for me
  to run them headed with a command line switch or env var

---

## From our conversations (not yet absorbed above — feel free to merge or cull)

* the admin/groups page is showing leftover e2e-w*-* groups from past
  test runs. should there be a globalTeardown that wipes everything
  with `e2e-w%-*` slugs and `%-w%` profiles after the suite, plus a
  `pnpm clean:e2e` script for the times tests get interrupted?
* mobile-safe HelpTip popover positioning — the (?) on the Code field
  clips when the icon is near the viewport's left edge on narrow
  screens. auto-flip to right-aligned when near the edge?
* /g/{slug}/manage page — the design plan (`docs/PHASE-3-groups.md`)
  calls for moving invite codes / member roster / delete-group there,
  with a "Manage group" link in the hamburger menu when the viewer
  is a steward. the current collapsible steward section is a stopgap.
  worth doing when we have a second steward-only thing to put there.
* multi-member "Songs we share" E2E test — spec 10 covers the empty
  state (single creator); a two-actor test would seed a second
  member's mixtape with one overlapping song and exercise the actual
  dedup + rendering path. ~hour of work.
* group-create description textarea placeholder reads like default
  content but isn't. some users typed alongside the placeholder
  thinking it'd stay. revisit with "insert and select" vs "example:
  ..." prefix when doing a polish pass.
* slideshow/coverflow reading mode at /{handle} — swipe-through
  alternative to the list view. right shape of feature creep, but
  two upstream design questions (which view is default? what's the
  unit of share?) need writing-group signal first. consider a
  "Read next ↓" stepping-stone if guided-reading friction surfaces
  sooner.
* extract GroupSongRow from /g/[slug]/+page.svelte (the songEntry
  snippet — ~140 lines tightly coupled to page state). deferred
  until a second consumer exists (e.g. search results, a different
  tab). flagged so it doesn't get forgotten.
