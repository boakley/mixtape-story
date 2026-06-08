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
  * I want to be able to add a description to my mixtape, and edit
    the title, just like a group.
  * Should the menu include a "My groups" section?
* by default, e2e tests need to be headless. It should be trivial for me
  to run them headed with a command line switch or env var
* I want the placeholder song titles to be different, so I can advertise
  my favorite artists. The toast by Adam Ezra, maybe "Everything will be alright" by Paul Thorn, maybe something from South Hill Banks or Maia Sharp (Kind?)

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
* E2E test for the feature-off case — with `FEATURES_GROUPS` unset,
  do `/g/create`, `/g/{slug}`, `/g/{slug}/i/{code}`, `/admin/groups`
  all return 404? The unit test (features.test.ts) covers the
  parser; an E2E pass would cover the gate-wiring on every route.
  Probably needs a separate playwright config or env override
  (the default config runs with FEATURES_GROUPS=1 from .env.local).
* E2E suite uses `page.waitForLoadState('networkidle')` in ~8 places
  (pages/mixtape.ts, pages/group.ts, specs 01/08/13) as a hydration
  fence. Playwright's docs mark networkidle as discouraged — it can
  be slow and isn't a real "hydrated" signal. Pick one replacement
  and apply uniformly: probably a `data-hydrated="true"` attribute
  the root layout sets in `onMount`, then `page.locator('html[data-
  hydrated]').waitFor()`. Cleanup pass, ~30 min.
* mixtape masthead: visitor-count "Display" preference. The doc
  (`docs/implementation-notes.md` §1) calls for a creator toggle in
  the `☰` to hide the visitor count from the meta line — for the
  creator who'd rather not look at it. The auto-drop on narrow
  viewports is wired via CSS; this is the explicit on-wide-screens
  toggle. Persist via the `useStoredState` rune like the view toggle.
