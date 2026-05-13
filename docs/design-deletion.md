# Account & mixtape deletion — design doc

**Status:** Not yet built. Captured 2026-05-13 so we don't forget. Implementation triggered when (a) we open the door past the writing group, or (b) a user actually asks to be removed.

---

## Why this needs to exist

Two converging forces:

1. **Regulatory.** GDPR Article 17 (Right to Erasure) covers EU/UK users; CCPA/CPRA (California) and the 2023–2025 wave of US state privacy laws (Virginia VCDPA, Colorado CPA, Connecticut, Utah, more arriving) give similar deletion rights. None of these strictly require *self-service* deletion — "email us" satisfies the rule — but self-service is the standard bar, costs less to maintain than a manual process, and is what a contemplative-writing audience expects to find when they look for it.
2. **Product fit.** The mixtape contains the user's own writing — sometimes deeply personal. The ability to take it back is part of the implicit contract of asking people to write about songs that matter to them. If a user wants out, the door should be obvious.

Self-service deletion is also a meaningful **signal of care** that builds trust at the writing-group stage. Doing it before we're forced to is the kind of move that the audience will silently notice.

---

## What gets shipped

A new `/account` page reachable from the hamburger menu (replace today's miscellaneous "signed in as…" panel with a real link). The page has three sections, top to bottom:

1. **Profile** — current handle, display name, email. Read-only for v1. (Editing them is a separate feature.)
2. **Reset mixtape** — destructive but reversible-in-spirit: deletes all songs, stories, and visit logs, keeps the profile and handle. The user can immediately start adding songs again.
3. **Delete account** — fully destructive: removes profile, all songs/stories/visits, OG image, and the Supabase auth row. The session is signed out. The handle is released (see open questions).

Both destructive actions require:

- **Typed confirmation.** "To confirm, type your handle." The button stays disabled until the input matches.
- **Plain-English consequence list** above the button: "This will permanently delete: 10 songs, 7 stories, visit log, your OG card. This cannot be undone."
- **Distinct visual treatment.** "Reset" uses the existing destructive style (accent-red border, ink text). "Delete account" goes one step further (full red background, paper text) so it doesn't look like a peer of "Reset."

Why a page, not a hamburger-triggered modal:

- Two destructive choices in a single dialog become a reading-comprehension test that users sometimes lose. A page can put real space and visual differentiation between them.
- The consequence list belongs on the page, not in a modal. Modals invite tunnel vision and accidental click-through.
- Typed-confirmation feels natural on a page; in a modal it feels like a hostage situation.

---

## What gets deleted, exactly

### Reset mixtape (keep account)

| Table / surface             | Action                                    |
| --------------------------- | ----------------------------------------- |
| `songs`                     | Delete all rows where `owner_id = user.id`. |
| `stories`                   | Cascades from `songs.id`. (Already CASCADE.) |
| `mixtape_visits`            | Delete rows where `profile_id = user.id`. (No CASCADE wired up — would need explicit delete.) |
| `og-images/{handle}.png`    | Delete from Storage. Will be re-rendered on first new song. |
| `profiles`                  | **Untouched.** Handle, display name, email remain. |
| `auth.users`                | **Untouched.** Session stays valid; user is redirected to `/{handle}` showing the empty state. |

### Delete account (everything)

| Table / surface             | Action                                    |
| --------------------------- | ----------------------------------------- |
| Everything above            | Same.                                     |
| `profiles`                  | Delete row. Cascades to remaining linked rows. |
| `auth.users`                | Delete via service-role admin client (`supabase.auth.admin.deleteUser(user.id)`). |
| Session                     | Server-side sign-out before delete completes. Redirect to `/` with a status message. |
| Handle                      | See open question 1. |

Note: `mixtape_visits.profile_id` cascades from `profiles.id` (it already does — see migration `0012`), so deleting the profile sweeps the visit log automatically.

---

## Server pieces

- **`/account/+page.svelte`** — UI per above.
- **`/account/+page.server.ts`** — three actions:
  - `reset_mixtape` — clears songs and OG. Cookie-based reauth check (compare submitted handle to user's actual handle).
  - `delete_account` — clears everything, signs out, redirects. Uses `adminClient()` for the `auth.admin.deleteUser` call.
  - (Optional) `export_data` — see "Data export" below.
- **Layout update** — `+layout.svelte` hamburger gets an "Account" link replacing or augmenting the current sign-in-as panel.

No new migration is needed for the deletion flow itself — existing CASCADE constraints + a manual Storage delete + a service-role `auth.admin.deleteUser` call cover it.

---

## Open questions to resolve before building

These should be pinned down before any code lands. Each has a cheap default but is worth a deliberate decision.

### 1. Handle reuse policy

**The question:** When `bryan` deletes their account, what happens to the handle `bryan`?

Options:

- **(a) Immediately re-claimable.** Simple. Risk: at any non-trivial scale, a stranger can immediately claim a username someone just shed, inheriting their URL and any inbound links. Concerning for a product where the handle is the URL.
- **(b) Tombstoned permanently.** Add the handle to a `released_handles` table (or extend the in-code denylist). Forever-reserved. Wastes the namespace at scale, fine at writing-group scale.
- **(c) Tombstoned with a cooling period.** Released after N months (90? 365?). Compromise but requires either a scheduled job or a check-on-claim.

**Recommendation:** (b) for v1. At writing-group scale we are not running out of handles, and any released handle would likely be "someone you know whose mixtape is gone" — re-issuing it would be eerie. Revisit if the user base grows large enough that hoarding becomes wasteful.

### 2. Audit trail of deletions

**The question:** Do we keep any record of who deleted what, and when?

Considerations:

- A minimal `deletion_log` (user-id-hash, when, which action) helps us answer "did Bryan delete his account last Tuesday?" if the dashboard data looks weird.
- But the log itself contains personal data and is therefore GDPR-relevant. Keeping it forever defeats the deletion right.
- Supabase's auth.users table already logs `deleted_at` on a soft-delete style row (depends on Supabase implementation — verify before deciding). If that's enough, we don't need our own log.

**Recommendation:** Skip the custom log at v1. Rely on Supabase auth's own deletion record (which we don't display anywhere). Revisit if we hit a debugging situation where a log would have saved time.

### 3. OG image cleanup

**The question:** The OG render pipeline writes PNGs to `og-images/{handle}.png` in Supabase Storage. Currently no code path deletes them. On both reset and account delete, we need to clean these up.

This isn't really an open question — the answer is "delete the file" — but it's a TODO that exists in the codebase right now even without this feature, since reusing a handle today would inherit the previous user's OG card. Worth noting in passing as a side benefit of building this feature.

---

## Data export (Right to Portability)

GDPR Article 20 also gives users a right to a copy of their data in a machine-readable format. The standard implementation is a "Download my data" button on the same `/account` page that produces a JSON dump of:

- Profile (handle, display name, email, created_at)
- All songs (full row dump)
- All stories (full row dump)
- Visit log (just totals — exposing per-visitor rows is privacy-on-other-users)

**For v1:** Don't build this. The audience is 20 known people in a WhatsApp group; if someone wants their data, Bryan can hand them a SQL dump. Build the page section but ship without the action wired up, OR defer entirely until requested.

If/when built, it's a small server action returning `Content-Type: application/json` + `Content-Disposition: attachment`. No UI other than a button.

---

## What this does NOT do (intentionally)

- **No partial deletion.** "Delete just this one song" is the editor's existing per-row delete. "Delete just my stories but keep my songs" — no one has asked for this, and the schema would treat stories as orphan rows. Skip.
- **No grace period / soft delete.** Account-delete is immediate and irreversible. A 7-day "trash" period would be a kindness but doubles the complexity and creates state where a "deleted" user still exists in some queries. Defer until someone asks for it.
- **No email confirmation step.** GDPR doesn't require email confirmation — the typed-handle confirmation in the UI is sufficient. Adding email roundtrip introduces a failure mode (mail delivery) on the wrong side of a critical flow.
- **No bulk admin tooling.** Bryan deleting a user from the admin queue is a separate (small) feature, not part of this design.

---

## Triggers for actually building this

Build when any of these become true:

- A real user asks to be deleted. The "email us, we'll do it" handoff is fine once or twice but the third time it's a feature.
- We open the door past the writing group (any kind of public signup). The moment we don't personally know every user, self-service deletion is table stakes.
- We add another user-content table (e.g., comments, reactions). Each new content surface compounds the manual-deletion burden.

None of those are triggered today. The point of this doc is to make sure that when one of them is, the design conversation has already happened and the open questions above are decisions, not blockers.
