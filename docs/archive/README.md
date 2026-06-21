# Archive

Build plans and design explorations from v1 and v1.5. Kept for historical
context. Not the source of truth for current behavior.

For the current state of the project, see:

- [`docs/CLAUDE.md`](../../CLAUDE.md) — operative product decisions
- [`docs/design-notes.md`](../design-notes.md) — current rationale and open questions
- [`docs/design-language.md`](../design-language.md) — visual conventions in use
- [`docs/TESTING.md`](../TESTING.md) — the test suite as it stands

## What's in here

- [`PLAN.md`](PLAN.md) — the original v1 scaffold plan. Everything in
  it has shipped.
- [`PHASE-1B.md`](PHASE-1B.md) — Phase 1b build plan for the editor,
  the Apple Music adapter (later replaced — see PHASE-2), the Odesli
  resolver, and the admin queue. Shipped.
- [`PHASE-2-resolver-and-pref.md`](PHASE-2-resolver-and-pref.md) —
  Phase 2 swap from iTunes Search to the Apple Music API, plus the
  visitor "Listen with" preference. Shipped. Useful as a record of
  what diverged from the original plan (Spotify Web API became
  Premium-gated mid-build; Odesli stopped surfacing Spotify and
  YouTube entirely; both routed to public search URLs as a result).
- [`PHASE-3-groups.md`](PHASE-3-groups.md) — Phase 3 build plan for
  groups (the writing-meditation use case). Shipped, then refactored
  in v1.5 to share semantics — see the banner at the top of the
  superseded design doc below.
- [`design-groups.md`](design-groups.md) — the original groups
  design exploration. Self-marked as superseded by v1.5; preserved
  here because the reasoning around URL shape, anthology vs.
  collective modes, and the new-visitor invite flow is still
  worth reading.

Internal cross-references between these files keep working because
they all moved together.
