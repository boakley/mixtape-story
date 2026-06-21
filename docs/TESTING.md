# Testing

mixtapestory.com's test suite has one organizing idea: it is the executable version of the user journey. The product is small and tightly scoped, and the tests are too. What they cover is "the path a person actually walks": sign in, make a mixtape, write a story, publish, share, open someone else's, ask about a song. Read top to bottom, the end-to-end suite is a tour of the product.

This is on purpose. For a banking or healthcare app, exhaustive feature coverage is the right emphasis. The failure modes are regulatory and financial. For a small consumer app where data is less significant, the journey is the important thing. The failure mode is at most an experience that doesn't quite work.

## Philosophy

Most behavior is verified by fast unit tests. A thin layer of end-to-end tests covers the journeys that only mean something when the whole system is wired together. Browser tests are slow and comparatively brittle, so they cover things a unit test can't rather than re-checking logic a unit test already pins down.

End-to-end tests are organized around what a person does, in the order they do it. They aren't organized by page or component. A new maintainer should be able to read the `testing/e2e/tests/` directory like a story and come away understanding the product. The suite doubles as onboarding documentation: the product vision and the E2E directory describe the same thing, one in prose and one in code.

Restraint is part of the design. The principle here is to keep things small, and to stop when tempted to add abstraction for an audience that doesn't exist. Testing follows the same idea. A small suite that illustrates the journey is more useful than a large library chasing coverage numbers. Ten journey tests that read like the product are worth more than fifty that don't.

## Tooling

**Playwright + TypeScript** for end-to-end. **Vitest** for unit tests (it ships with the SvelteKit toolchain). Same language across app and tests, same toolchain for both.

TypeScript is the right choice for a product written in TypeScript: no second language or toolchain to keep in sync. Playwright works well for the browser layer. Auto-waiting removes most of the flakiness older Selenium suites fight, and the trace viewer makes failures easy to read. BDD isn't necessary here. With a thoughtful page-object model in the product's vocabulary, the test bodies already read as plain sentences, and a Gherkin layer would only add glue between you and the test.

## The layers

### Unit tests (Vitest)

Pure logic is tested cheaply and in isolation. This is where the bulk of the assertions live. Examples of the kind of thing covered here:

- reserved-slug / reserved-handle denylist validation: every system, namespace, and brand prefix is rejected; valid slugs pass
- `listenHref` routing for the visitor's "Listen with" preference: direct per-platform links when present, public service-side search URLs as fallback
- `safeRedirect` open-redirect hardening: only local paths are honored; protocol-relative URLs (`//evil.com`) and absolute URLs are rejected
- Future: Songlink cache-key derivation, OG description formatting, etc. as new pure-logic surfaces appear

These run in milliseconds, need no browser, and pin down exactly the kind of detail that machine-generated code tends to get wrong.

### End-to-end tests (Playwright)

A short list, each one a journey that only has meaning end to end:

- **Authentication, the real path**: one test exercising the actual magic-link flow (see Authentication below)
- **Create a mixtape**: a creator pastes a list of songs, resolves them, sees them on the public page
- **Write a story**: a creator opens the editor for a song, writes prose, sets the memory year, sees it render in expanded view
- **Share and unfurl**: the share button on the public page, plus the Open Graph card. The card is flagged in the design notes as the single most important feature, so the `og:*` meta tags are asserted on the rendered page (and a future visual snapshot of the generated image)
- **A viewer opens a mixtape**: an anonymous visitor lands on `/{handle}`, reads through, exercises the Listen link
- **Create a group**: a steward visits `/g/create`, fills the form, lands on the new group's landing page with the steward panel visible
- **Invite and join**: a steward mints an invite code; a brand-new visitor follows the URL, signs up via magic link, lands inside the group as a member — exercising the full magic-link-carrying-intent flow across two browser contexts
- **Share a mixtape with a group**: a member with a populated mixtape clicks "Share my mixtape with this group"; their card appears in the directory; clicking "Stop sharing" removes it
- **Group tabs**: the three tabs on a group landing render, persist across reloads, and respect the shared Expanded/Compact view + story truncation
- **Steward inline edit**: a steward edits the group name and description in place, collapses the steward section, uses a HelpTip
- **First-visit hint**: a first-time visitor sees the auto-open + expand-gesture hint once; interaction dismisses it; reload keeps it dismissed
- **First Listen**: the first Listen tap pops the service chooser; the choice persists and deep-links thereafter; "Other" persists explicitly without re-prompting
- **Masthead edit**: the owner edits mixtape title and description; a visitor sees the new values; an anonymous POST to the edit actions is rejected (owner-gate)
- **Form HelpTips**: every primary form field across login, group create, and the editor exposes its (?) help affordance
- **Story prose styling**: a richly formatted story (paragraphs, list, quote, link) renders *styled* on the public page — computed-style assertions that bind markdown output to the `prose-story` CSS, after that class shipped as a phantom (referenced, never defined) for three phases
- **A mixtape just for a group**: from a group's page, a member creates a group-born mixtape (blank, or deep-copied from an existing one) that diverges freely — edits in either direction never leak
- **Each group sees one mixtape**: a member shares the primary with one group and a group-born version with another; cards name and link the right mixtape; the per-group cap and the reshare chooser hold; two members' overlapping picks meet in Songs we share
- **Reorder songs**: the per-row Up/Down buttons that move a song by single-position swap; the new order survives a reload and shows on the public page. The product also supports drag-and-drop via svelte-dnd-action for visual users; the test path goes through the button UI because it's deterministic (one click = one POST, no animation timing to race). Same principle as the Songlink and `wa.me` boundaries below: test the behavior, not the third-party library.
- **Admin pages**: non-admins get 404s everywhere; an admin walks groups/mixtapes/queue and every filter tab stays on its page (the All-tab-404 regression's net). Admin access in dev comes from the `*@e2e-admin.local` wildcard in `ADMIN_EMAILS` (see `src/lib/server/admin.ts`)

That list, with each item written as a sentence, is itself a spec a product owner can scan.

## Page objects: the product's vocabulary as an API

The foundation under the E2E tests is a set of page objects that speak the product's language. Methods are named for what a person does (`mixtape.addSongsByList()`, `mixtape.writeStory()`, `group.shareMyMixtape()`), not for the DOM (`clickPublishButton()`). The repo already defines this vocabulary (mixtape, story, song, creator, author, group, steward; never "playlist" or "track"); the page objects mirror it. A test body then reads as a sentence in the product's own language:

```ts
test('a member shares and unshares their mixtape', async ({ creator }) => {
  await creator.mixtape.addSongsByList([
    'Wish You Were Here - Pink Floyd',
    'Imagine - John Lennon'
  ]);

  const group = await createGroup(creator.page, {
    slug: 'e2e-share-circle',
    name: 'E2E Share Circle'
  });

  await group.shareMyMixtape();
  await expect(group.memberCard(creator.handle)).toBeVisible();

  await group.unshareMyMixtape();
  await expect(group.memberCard(creator.handle)).toHaveCount(0);
});
```

This layer does the architectural work, and it is reusable beyond just tests. The product is described once, in domain terms; tests are one consumer of that description. A marketing or training video is driven by the same page objects: slower, with realistic seed data, but the same vocabulary. No single test ever does double duty as a video, but the framework underneath serves both. A future screenshot-for-docs script would be a third consumer of the same interface. Page objects here are a reusable interface to the product, in the domain's vocabulary, with uses beyond getting tests to pass.

## Tags

Tests are tagged on two dimensions so the suite can be sliced by feature area or by user role. Tags follow a `key:value` namespace (Playwright requires the leading `@`):

- **`@feature:…`**: what part of the product the test exercises. Current values: `auth`, `editor`, `public`, `group`, `invite`, `og`.
- **`@role:…`**: what kind of user is walking the journey. Current values: `new-user`, `creator`, `steward`, `member`, `viewer`.

A spec gets one or two tags per dimension. Multi-actor journeys (like 08-invite-and-join) carry tags for every actor that appears.

```ts
test('a steward invites someone; the invitee joins via magic link',
  { tag: ['@feature:group', '@feature:invite', '@feature:auth',
          '@role:steward', '@role:new-user'] },
  async ({ creator, visitor }) => { … }
);
```

Filter at run time:

```sh
pnpm exec playwright test --grep "@feature:group"   # everything group-related
pnpm exec playwright test --grep "@feature:"        # every test with any feature tag
pnpm exec playwright test --grep "@role:new-user"   # brand-new visitor journeys
pnpm exec playwright test --grep-invert "@feature:auth"
```

### Enforcement

The rule "every spec has at least one `@feature:*` and one `@role:*`"
is enforced by `scripts/check-test-tags.ts`, invoked as part of
`pnpm test:unit` (via `src/lib/check-test-tags.test.ts`) and
therefore CI. A missing-tag commit goes red without anyone needing
hooks installed locally.

For fast manual feedback: `pnpm check:tags`.

The check is format-only (catches `@features:group` typos and empty
`@feature:` values); it doesn't validate against the allowed-value
list above, so semantic drift like `@feature:groups` would slip
through. If that ever happens, layer in a strict allowlist.

### Why prefixes, not flat `@group` / `@steward`

- **Slicing across a whole namespace.** `--grep "@feature:"` matches any feature; impossible with flat tags.
- **ReportPortal attributes for free.** RP's reporter splits on `:` into a filterable `feature=group` attribute; no extra config when the integration lands.
- **Typo hygiene.** `grep -rE "@(role|feature):" testing/e2e/tests | sort -u` gives the full inventory in one line. Catches `@features:group` that flat tags would silently absorb.
- **Future-proof.** Adding a third dimension later (`@priority:critical`, `@surface:mobile`) doesn't require renaming what's there.

A two-dimension scheme is cheap to set up at 14 specs and meaningful refactor pain to add at 50. The payoff is largest when the suite grows or the reporting layer arrives, both of which are realistic scenarios.

### What I deliberately don't tag

`@critical` / `@smoke`. At the suite's current size, the whole thing is the smoke test. I'll readdress this once the suite hits ~50 specs.

### Current tag map

| Spec | Tags |
|---|---|
| 01-sign-in | `@feature:auth` `@role:new-user` |
| 02-create-mixtape | `@feature:editor` `@role:creator` |
| 03-write-stories | `@feature:editor` `@role:creator` |
| 04-publish-and-share (OG) | `@feature:public` `@feature:og` `@role:creator` |
| 04-publish-and-share (Share button) | `@feature:public` `@role:creator` |
| 05-viewer-opens-mixtape | `@feature:public` `@role:viewer` |
| 07-create-group | `@feature:group` `@role:steward` |
| 08-invite-and-join | `@feature:group` `@feature:invite` `@feature:auth` `@role:steward` `@role:new-user` |
| 09-share-mixtape-with-group | `@feature:group` `@role:member` |
| 10-group-tabs | `@feature:group` `@role:steward` |
| 11-steward-inline-edit | `@feature:group` `@role:steward` |
| 12-first-visit-hint | `@feature:public` `@role:viewer` |
| 13-first-listen | `@feature:public` `@role:viewer` |
| 14-mixtape-masthead-edit | `@feature:public` `@role:creator` `@role:viewer` |
| 15-form-helptips | `@feature:auth` `@feature:editor` `@feature:group` `@role:creator` `@role:viewer` |
| 16-story-prose-styling | `@feature:editor` `@feature:public` `@role:creator` |
| 17-group-mixtape | `@feature:group` `@feature:editor` `@role:creator` |
| 18-share-mixtapes-with-groups | `@feature:group` `@role:member` `@role:creator` |
| 19-reorder-songs | `@feature:editor` `@role:creator` |
| 20-admin-pages | `@feature:admin` `@role:creator` |

(15-form-helptips briefly carried `@feature:edit`. This is the predicted
semantic drift the format-only check can't catch. Fixed 2026-06-09; if
it recurs, layer in the strict allowlist.)

## Authentication

Magic-link auth is the hardest part of this app to make test-friendly. The strategy: prove the path once, and don't make every other test walk it.

**Most journeys start already authenticated.** A fixture creates a fresh test user, profile, and personal mixtape via the Supabase admin API (service-role key, server-side only), then mints an `action_link` via `auth.admin.generateLink` (the same URL Supabase would have put in a magic-link email). The browser context navigates to that URL, which sets the session cookie, and the test opens the app already signed in. The journeys under test (create, share, invite-and-join) are about the product. They aren't about logging in, and making each one round-trip through email would add slowness and a flake surface for no coverage gain. (The `creator` fixture in the snippet above is exactly this seeded, authenticated user.)

**One test exercises the actual flow.** Against the local Supabase stack (`supabase start`, which bundles a local mail catcher), a single test triggers the actual magic-link request, retrieves the link from the local inbox, follows it, and asserts the session is established. This is the test that proves auth genuinely works; the seeded-session fixture trusts that proof and skips the trail thereafter.

This solves the testing problem. The auth path gets coverage once. Everything else gets fast and stable coverage that doesn't repeat the dance. The service-role key lives only in the test environment and never reaches client code.

## Running the suite

```
pnpm run test:unit       # Vitest: fast, no browser
pnpm run test:unit:watch # Vitest watch mode
pnpm run test:e2e        # Playwright (headed locally so you can watch)
pnpm run test:e2e:ui     # Playwright UI mode for debugging
pnpm run test            # both layers, sequentially
```

E2E runs headed locally by default so a developer can watch the journey run; set the `CI` env var (or any CI runner does this automatically) to flip to headless. `PWHEAD=1` forces headed anywhere.

A local Supabase stack must be running (`pnpm exec supabase start`). The fixtures expect Mailpit at `127.0.0.1:54324` and the Postgres/REST stack at `127.0.0.1:54321`. The Playwright config reuses the existing dev server if one is up; otherwise it boots `pnpm run dev`.

When CI eventually lands, both layers run on every push and the Playwright HTML report is published as a build artifact. For a project that uses its tests as documentation, a browsable report is part of the deliverable.

## Reporting

Locally a single `list` reporter runs; under CI the config adds Playwright's `html` report (to be published as a build artifact once CI lands).

ReportPortal streaming is optional and off by default. It is a Playwright reporter rather than a fixture, so the on/off decision lives in `playwright.config.ts`. That file is plain TypeScript and reads the environment when it loads, so the ReportPortal reporter (`@reportportal/agent-js-playwright`) is appended to the list only when `RP_ENABLE` is set along with `RP_ENDPOINT` and `RP_API_KEY`. A developer who doesn't run ReportPortal leaves those unset; the reporter is never loaded and the run is unaffected. If `RP_ENABLE` is set but the connection variables are missing, the config logs a warning and continues without ReportPortal instead of failing the run.

```
RP_ENABLE=1
RP_ENDPOINT=http://localhost:8080/api/v2   # local or hosted instance
RP_API_KEY=<your key>
RP_PROJECT=mixtapestory
RP_LAUNCH=mixtapestory e2e
```

The agent is a dev dependency: always installed, but never loaded unless streaming is enabled. Runs without streaming aren't affected.

A fixture has a related but different job. If a test needs to push custom logs or attributes into the ReportPortal report, that goes through a fixture, and the fixture should no-op when streaming is off so the same test runs identically with or without ReportPortal.

## What I don't test at the E2E level

Naming the omissions is part of the approach.

- **Logic with unit coverage**: handle validation, cache keys, OG formatting are pinned at the unit level; re-asserting them through a browser would be slower and prove nothing new.
- **Auth on every journey**: covered once end-to-end, seeded thereafter (above).
- **Third-party internals**: I assert that the app routes through Songlink and that the `wa.me` link is well-formed, but I don't test Songlink's resolution or WhatsApp's rendering. Those are their systems, not mine.
- **Out-of-scope features**: anything on `design-notes.md`'s "not in v1" list has no tests, because it has no code. Tests follow the shipped product.
- **Exhaustive cross-browser / device matrices**: not warranted for a 20-person, mobile-first audience. One mobile viewport and one desktop is enough; a full matrix would be ceremony.

If a future change would *break* one of these boundaries (say, logic that can only be exercised through the browser), that's worth flagging and discussing, the same way the data model flags choices that would close off a future audience.

## Directory layout

```
testing/
  e2e/
    tests/                        # the v1 journey, in order
      01-sign-in.spec.ts          # the real magic-link path, once
      02-create-mixtape.spec.ts
      03-write-stories.spec.ts
      ...                         # one numbered spec per journey
      NN-latest-journey.spec.ts   # see the tag map above for the full list
    pages/                        # page objects in the product's vocabulary
      mixtape.ts
      group.ts
    fixtures/
      auth.ts                     # seeded-session fixture + admin client
      mailpit.ts                  # local mail catcher helper for 01
      env.ts                      # reads .env.local for local Supabase
      test.ts                     # custom Playwright test with creator/visitor fixtures
      global-setup.ts             # pre-compiles routes so test 1 hits a warm dev server
    results/                      # gitignored — Playwright HTML report, traces, videos
src/
  …
  lib/foo/foo.test.ts             # Vitest unit tests, colocated with the module
```

Unit tests live next to the module they exercise (Vitest convention), so refactoring a module finds its test in the same folder. End-to-end tests live under `testing/e2e/tests/` because they don't have a module owner; they're whole-product journeys. Each subdir under `testing/e2e/` has one purpose: `tests/` are the specs, `pages/` are the domain interface, `fixtures/` are shared setup, `results/` is gitignored artifacts. `rm -rf testing/e2e/results/` is always safe.

The numbered E2E files are intentional. Read in order, they are the v1 journey, from first sign-in through groups to the polish layer (hints, the Listen chooser, HelpTips). One number is a hole: 06 was reserved for ask-about-a-song, whose `wa.me` deep-link surface never shipped; the gap stays so the other numbers keep their meaning.

Numbering tests used to be a cost I avoided, because every insert between two existing journeys meant renaming the rest by hand. With AI handling the rename ripple, that overhead is gone, and there's an upside: no test depends on another, but reading the suite in order is a tour of the product, and the order is part of what newcomers learn from.

## Current state (2026-06-09)

Honest snapshot of what's wired today vs. what's still pending:

- **Framework, fixtures, page objects, scripts**: fully wired.
- **19 spec files (01–20, no 06), all active**: 33 journeys × two device projects = 66 test executions per run, green in ~25s against the local stack. No `test.skip()` scaffolds remain.
- **106 unit tests across 12 files**: reserved-handle and reserved-slug denylists, mixtape-slug grammar, admin-allowlist matching (incl. the `*@domain` wildcard), `listenHref` routing, `safeRedirect` hardening, story truncation, markdown rendering (tags + sanitization), mixtape-copy builders, the tag-format check, the editor's text-list paste parser (quoted-title and newline-delimited shapes, separators, parenthetical annotations), and the seed CSV parser (comma-rule preservation, year-range validation, position counting). Pass in well under a second.
- **Pyramid ratio: roughly 3:1 unit to E2E journeys** (106 vs. 33). The fast layer pins the branchy logic; the slow layer covers the journeys that only mean something end-to-end. The Philosophy section above states the intent; this is the current evidence.
- **06-ask-about-a-song**: still not written (the `wa.me` deep-link surface it would test isn't built in the product); its number stays reserved.
- **CI**: not yet configured. The local commands above work; a workflow file lands when prod has CI infrastructure.
- **ReportPortal**: not yet wired. The integration sketched in *Reporting* above is the target, not the current state.

Two ways to grow the suite from here: (1) add a journey when a new feature lands, written as a sentence in the same numbered style; and (2) keep selectors on the accessibility surface (`getByRole` / `getByLabel` + visible text) so refactors don't shake the suite. The second has worked across several component extractions already.
