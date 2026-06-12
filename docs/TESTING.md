# Testing

mixtapestory.com's test suite has one organizing idea: it is the executable version of the user journey. The product is small and deliberately scoped, and the tests are too. What they cover is not "every feature" but "the path a person actually walks": sign in, make a mixtape, write a story, publish, share, open someone else's, ask about a song. Read top to bottom, the end-to-end suite is a narrated tour of the product. That is the point.

## Philosophy

Three commitments shape everything below.

**The pyramid is respected.** Most behavior is verified by fast unit tests. A thin layer of end-to-end tests covers the journeys that only mean something when the whole system is wired together. Browser tests are slow and comparatively brittle; they earn their place by covering things no unit test can, not by re-checking logic a unit test already pins down.

**The journey is the unit of E2E design.** End-to-end tests are organized around what a person does, in the order they do it, not around pages or components. A new maintainer should be able to read the `testing/e2e/tests/` directory like a story and come away understanding the product. The suite doubles as onboarding documentation: the product vision and the E2E directory describe the same thing, one in prose and one in code.

**Restraint is a feature.** This repo's ethos is anti-ceremony: when tempted to add abstraction for an audience that doesn't exist, stop. Testing follows the same discipline. The goal is a curated suite that illustrates the journey, not a large library chasing coverage numbers. Ten journey tests that read like the product are worth more than fifty that don't.

## Tooling

**Playwright + TypeScript** for end-to-end. **Vitest** for unit tests (it ships with the SvelteKit toolchain). One language across app and tests, one toolchain, one mental model.

TypeScript is the right choice for a product written in TypeScript: no second language or toolchain to keep in sync. Playwright is the pragmatic modern pick for the browser layer. Auto-waiting removes most of the flakiness older Selenium suites fight, and the trace viewer makes failures easy to read. BDD isn't necessary here. With a thoughtful page-object model in the product's vocabulary, the test bodies already read as plain sentences, and a Gherkin layer would only add glue between you and the test.

## The layers

### Unit tests (Vitest)

Pure logic is tested cheaply and in isolation. This is where the bulk of the assertions live. Examples of the kind of thing covered here:

- reserved-slug / reserved-handle denylist validation: every system, namespace, and brand prefix is rejected; valid slugs pass
- `listenHref` routing for the visitor's "Listen with" preference: direct per-platform links when present, public service-side search URLs as fallback
- `safeRedirect` open-redirect hardening: only local paths are honored; protocol-relative URLs (`//evil.com`) and absolute URLs are rejected
- Future: Songlink cache-key derivation, OG description formatting, etc. as new pure-logic surfaces appear

These run in milliseconds, need no browser, and pin down exactly the kind of detail that machine-generated code gets subtly wrong.

### End-to-end tests (Playwright)

A deliberately short list, each one a journey that only has meaning end to end:

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

That list, named in sentence-shaped titles, is itself a spec a product owner can scan.

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

This layer does the real architectural work, and it is reusable by more than tests. The product is described once, in domain terms; tests are the first consumer, not the only possible one. A marketing or training video is driven by the same page objects: slower, with realistic seed data, but the same vocabulary. No single test ever does double duty as a video, but the framework underneath serves both. A future screenshot-for-docs script would be a third consumer of the same interface. Page objects here are not a convenience for making tests pass; they are a reusable, domain-shaped interface to the product.

## Tags

Tests are tagged on two dimensions so the suite can be sliced by feature area or by user role. Tags follow a `key:value` namespace (Playwright requires the leading `@`):

- **`@feature:…`** — what part of the product the test exercises. Current values: `auth`, `editor`, `public`, `group`, `invite`, `og`.
- **`@role:…`** — what kind of user is walking the journey. Current values: `new-user`, `creator`, `steward`, `member`, `viewer`.

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
through. If we ever see that happen, layer in a strict allowlist.

### Why prefixes, not flat `@group` / `@steward`

- **Slice by namespace, not just by value.** `--grep "@feature:"` matches any feature; impossible with flat tags.
- **ReportPortal attributes for free.** RP's reporter splits on `:` into a filterable `feature=group` attribute; no extra config when the integration lands.
- **Typo hygiene.** `grep -rE "@(role|feature):" testing/e2e/tests | sort -u` gives the full inventory in one line. Catches `@features:group` that flat tags would silently absorb.
- **Future-proof.** Adding a third dimension later (`@priority:critical`, `@surface:mobile`) doesn't require renaming what's there.

A two-dimension scheme is cheap to set up at 14 specs and meaningful refactor pain to add at 50. It's a small investment with the largest payoff when the suite grows or the reporting layer arrives — both of which are realistic, not hypothetical.

### What we deliberately don't tag

`@critical` / `@smoke`. At the suite's current size, the whole thing is the smoke test; that dimension earns its keep around 50+ specs. Add it then, not now.

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

(15-form-helptips briefly carried `@feature:edit` — the predicted semantic
drift the format-only check can't catch. Fixed 2026-06-09; if it recurs,
layer in the strict allowlist.)

## Authentication

Magic-link auth is the hardest part of this app to make test-friendly, and the strategy is deliberate: prove the real path once, and don't make every other test walk it.

**Most journeys start already authenticated.** A fixture creates a fresh test user, profile, and personal mixtape via the Supabase admin API (service-role key, server-side only), then mints an `action_link` via `auth.admin.generateLink` — the same URL Supabase would have put in a magic-link email. The browser context navigates to that URL, which sets the session cookie, and the test opens the app already signed in. The journeys under test (create, share, invite-and-join) are about the product, not about logging in; making each one round-trip through email would add slowness and a flake surface for no coverage gain. (The `creator` fixture in the snippet above is exactly this seeded, authenticated user.)

**One test exercises the real flow.** Against the local Supabase stack (`supabase start`, which bundles a local mail catcher), a single test triggers the actual magic-link request, retrieves the link from the local inbox, follows it, and asserts the session is established. This is the test that proves auth genuinely works; the seeded-session fixture trusts that proof and skips the trail thereafter.

The split is the honest engineering answer to a real problem: real coverage of the auth path exactly once, fast and stable coverage of everything else. The service-role key lives only in the test environment and never reaches client code.

## Running the suite

```
pnpm run test:unit       # Vitest: fast, no browser
pnpm run test:unit:watch # Vitest watch mode
pnpm run test:e2e        # Playwright (headed locally so you can watch)
pnpm run test:e2e:ui     # Playwright UI mode for debugging
pnpm run test            # both layers, sequentially
```

E2E runs headed locally by default so a developer can watch the journey unfold; set the `CI` env var (or any CI runner does this automatically) to flip to headless. `PWHEAD=1` forces headed anywhere.

A local Supabase stack must be running (`pnpm exec supabase start`) — the fixtures expect Mailpit at `127.0.0.1:54324` and the Postgres/REST stack at `127.0.0.1:54321`. The Playwright config reuses the existing dev server if one is up; otherwise it boots `pnpm run dev`.

When CI eventually lands, both layers run on every push and the Playwright HTML report is published as a build artifact. For a project that uses its tests as documentation, a browsable report is part of the deliverable, not an afterthought.

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

The agent is a dev dependency: always installed, but never loaded unless streaming is enabled, so it costs a portable run nothing.

A fixture has a related but different job. If a test needs to push custom logs or attributes into the ReportPortal report, that goes through a fixture, and the fixture should no-op when streaming is off so the same test runs identically with or without ReportPortal.

## What we deliberately don't test at the E2E level

Naming the omissions is part of the discipline.

- **Logic with unit coverage**: handle validation, cache keys, OG formatting are pinned at the unit level; re-asserting them through a browser would be slower and prove nothing new.
- **Auth on every journey**: covered once for real, seeded thereafter (above).
- **Third-party internals**: we assert that we route through Songlink and that the `wa.me` link is well-formed; we do not test Songlink's resolution or WhatsApp's rendering. Those are their systems, not ours.
- **Out-of-scope features**: anything on `design-notes.md`'s "not in v1" list has no tests, because it has no code. Tests track the product, not the roadmap.
- **Exhaustive cross-browser / device matrices**: not warranted for a 20-person, mobile-first audience. One mobile viewport and one desktop is enough; a full matrix would be ceremony.

If a future change would *break* one of these boundaries (say, logic that can only be exercised through the browser), that's worth flagging and discussing, the same way the data model flags choices that would foreclose a future audience.

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

Unit tests live next to the module they exercise (Vitest convention) — refactoring a module finds its test in the same folder. End-to-end tests live under `testing/e2e/tests/` because they don't have a module owner; they're whole-product journeys. Each subdir under `testing/e2e/` has one purpose: `tests/` are the specs, `pages/` are the domain interface, `fixtures/` are shared setup, `results/` is gitignored artifacts. `rm -rf testing/e2e/results/` is always safe.

The numbered E2E files are intentional: read in order, they are the v1 journey, from first sign-in through groups to the polish layer (hints, the Listen chooser, HelpTips). The directory is the story. One number is a hole: 06 was reserved for ask-about-a-song, whose `wa.me` deep-link surface never shipped; the gap stays so the other numbers keep their meaning.

## Current state (2026-06-09)

Honest snapshot of what's wired today vs. what's still pending:

- **Framework, fixtures, page objects, scripts**: fully wired.
- **17 spec files (01–18, no 06), all active**: 27 journeys × two device projects = 54 test executions per run, green in ~20s against the local stack. No `test.skip()` scaffolds remain.
- **64 unit tests across 9 files**: reserved-handle and reserved-slug denylists, mixtape-slug grammar, `listenHref` routing, `safeRedirect` hardening, story truncation, markdown rendering (tags + sanitization), mixtape-copy builders, and the tag-format check. Pass in well under a second. (Was 69/7 — the feature-flag parser and its tests retired with the `FEATURES_GROUPS` flag when groups went permanently live.)
- **06-ask-about-a-song**: still not written (the `wa.me` deep-link surface it would test isn't built in the product); its number stays reserved.
- **CI**: not yet configured. The local commands above work; a workflow file lands when prod has CI infrastructure.
- **ReportPortal**: not yet wired. The integration sketched in *Reporting* above is the target, not the current state.

Two complementary ways to grow the suite from here: (1) add a journey when a new feature lands, in the same numbered, sentence-shaped style, and (2) keep selectors on the accessibility surface (`getByRole` / `getByLabel` + visible text) so refactors don't shake the suite — that bet has paid off through several component extractions already.
