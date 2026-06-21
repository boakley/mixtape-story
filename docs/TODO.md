# TODO

Single source for everything we've thought about but haven't done yet.
Mix of UX issues, feature ideas, and infra/test work. Conversational
on purpose — these are notes to think with, not tickets. Cull / fold
freely.

* fix ux design issues
  * should the list of mixtapes in a group be expandable
    Right now I can click to jump to a mixtape, but it might be
    nice to drill into it without having to leave the page
  * add a "+ Create a group" link to the drawer. The route at
    /g/create works fine; nothing in the menu surfaces it today.
    Natural placement: under MY GROUPS as a muted accent link
    below the user's existing groups, similar to how "Add a
    description" reads on the mixtape page.
* features:
  * ship the /how-it-works page — built and parked in
    docs/mockups/how-it-works-page.svelte (landing strip shipped alone;
    handle already reserved). Revive when blog traffic suggests
    strangers want more than the strip before signing in.
  * highlight songs added since your last visit? The data mostly
    exists already: songs.added_at + mixtape_visits.last_visit_at per
    visitor (post-0019, keyed per mixtape). One wrinkle: the page-load
    upsert overwrites last_visit_at before anything reads it, so the
    query needs a read-before-write. One gap: group pages have no
    visit tracking at all (no group_visits table), and that's arguably
    where the feature matters most — the surface that aggregates other
    people's activity. Honest skepticism (Bryan, 2026-06-12): typical
    users probably don't revisit a mixtape repeatedly, so wait for
    evidence of repeat visits before building. The visitor counts can
    answer that — first_visit_at vs last_visit_at spread shows whether
    anyone actually comes back.
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
* mixtape masthead: visitor-count "Display" preference. The doc
  (`docs/implementation-notes.md` §1) calls for a creator toggle in
  the `☰` to hide the visitor count from the meta line — for the
  creator who'd rather not look at it. The auto-drop on narrow
  viewports is wired via CSS; this is the explicit on-wide-screens
  toggle. Persist via the `useStoredState` rune like the view toggle.
* gitleaks — open-source secret scanner that greps a repo (and its
  history) for things that look like API keys, JWTs, private keys,
  etc. Look up how to install it; main candidate uses are a
  pre-commit hook (so `.env.local`, the Apple `*.p8` / `AuthKey_*`
  files, and the Supabase service-role key never make it into a
  commit) and a one-shot scan of the existing history. Probably
  also worth as a CI gate eventually. Mentioned in a separate
  conversation; flagged here so it doesn't get forgotten.
