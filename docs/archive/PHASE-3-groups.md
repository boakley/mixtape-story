# Phase 3 — Groups (anthology), `/u/` profiles, guest links

**Status:** Planned. Not yet started.
**Source design exploration:** [`docs/design-groups.md`](./design-groups.md) — preserved verbatim from the original write-up; this doc is the build plan that follows from it.

**Divergences from the source doc:**
- The group landing is **three tabs** (Member mixtapes default · Songs we share · All songs), not directory-only. Decided 2026-05-26.
- Mixtape-in-group is **share, not copy**. The source doc and an earlier 3a iteration treated each group-scoped mixtape as a separate row that needed to be re-populated; both fought the user's expectation that editing "my mixtape" should propagate. Decided 2026-06-06 after the writing-group test exposed the conflict. Implementation: a `mixtape_group_shares` join table; `mixtapes.group_id` and the `'group'` visibility value are removed.
- The **year column is removed** from song views (personal + group); the **rail + accent dots are kept** for the bulleted-list-with-spine look. `memory_year` is kept as the "This song reminds me of …" in-story lead-in but no longer a structural sort key. Decided 2026-06-05 after low adoption signal; the `SongRow.svelte` change is already live on the personal page.
- Stories in the song views (Songs we share, All songs) are **truncated to the first ~2 sentences with an inline `[more]` toggle**. Personal mixtape view keeps full-length stories.
- Group description is **editable inline by stewards** via a pencil affordance at the end of the description text.

## Why now

Pure invite-link sharing has three writing-group-shaped problems (full framing in `design-groups.md`):

1. **Handles are guessable** at `/{handle}` — strangers can enumerate.
2. **New members can't catch up** — existing mixtapes don't accrete anywhere browseable.
3. **No surface for "the group's mixtapes"** — each mixtape is an island.

Phase 3 closes all three at writing-group scale, gated behind `FEATURES_GROUPS` so it ships to prod unexposed.

## Decisions already settled

| Topic | Decision |
|---|---|
| Group URL shape | `/g/{slug}` (landing), `/g/{slug}/{handle}` (member mixtape), `/g/{slug}/i/{code}` (invite) |
| User profile | `/u/{handle}` — viewer-aware listing; `/{handle}` keeps its personal-mixtape role |
| Mixtape home | One mixtape entity per user (v1). It can be shared with N groups via a `mixtape_group_shares` join table; edits propagate everywhere it's shared because there's only one row. Divergent versions for different audiences are achieved by making a *different* mixtape entity (v1.5+, `/u/{handle}/{slug}` per `design-groups.md` §1a). |
| Mode | Anthology only in v1; collective deferred |
| Joining | Invite-code only; no request-to-join (WhatsApp covers that) |
| Roles | Steward (creator + delegates) and member |
| Per-scope cap | One mixtape per user per scope |
| Family-share | Per-mixtape tokenized **guest links** (option B from source doc) |
| Visibility | `private` / `unlisted` / `group` / `public`; `group` iff `group_id IS NOT NULL` |
| Feature flag | `FEATURES_GROUPS=1`; off by default; `/g/*` and `/u/*` 404 when off |
| **Landing page** | **Three tabs**: Member mixtapes (default) / Songs we share / All songs |
| Timeline rail | **Year column removed; rail + accent dots kept** (bulleted-list-with-spine). `memory_year` kept as in-story lead-in only |
| Story length in song views | First ~2 sentences with inline `[more]` toggle (Songs we share + All songs). Personal page keeps full stories |
| Description editing | Inline edit by stewards via pencil affordance |

## Architecture in one diagram

```
                        FEATURES_GROUPS=1
                               │
                               ▼
  /{handle}        →  Personal mixtape page (existing renderer)
  /u/{handle}      →  Profile listing (new; viewer-aware)
  /g/{slug}        →  Group landing — two tabs:
                        • Member mixtapes (default)
                        • Songs we share
  /g/{slug}/{h}    →  Member mixtape (same renderer as /{handle}, RLS-gated)
  /g/{slug}/i/{c}  →  Invite URL — magic-link sign-in if signed out,
                       single-step verify-and-join, lands on /g/{slug}
                               │
                               ▼  RLS gates:
                    visibility='group'  → membership OR valid GuestLink token
                    landing + members   → membership only
                    public/unlisted     → unchanged from v1
```

## Step order

Worth staging as 3a / 3b / 3c — see *Scope honesty* at the bottom. The list reads linearly but each phase below is a shippable cut.

### 3a — Minimal joinable shell

1. **Schema migration.** Create `groups`, `group_memberships`, `group_invites`, `guest_links`. Add `mixtapes.group_id`. Expand `visibility` enum to `private / unlisted / group / public` (rename `'link'` → `'unlisted'` in the same migration, with a data-fix step). Add Postgres CHECK constraint enforcing `visibility = 'group'` iff `group_id IS NOT NULL`. Full shapes in `design-groups.md#data-model-additions`. **Backfill rule:** every existing profile gets one personal mixtape (visibility=`'unlisted'`, group_id=`null`); the onboarding flow does the same for new signups. This keeps the "every profile has a personal mixtape entity" invariant — the empty-mixtape-is-OK assumption is what lets the editor write songs without JIT-create logic, and the landing's filter (step 9) is what keeps empty rows from cluttering directories.
2. **RLS policies.** Group-scoped mixtape reads require membership OR a valid `GuestLink.token`. Group landing + member list require membership. Audit with `supabase db advisors` after.
3. **Reserved-word lists.** Add `g` and `u` to `src/lib/handles/reserved.ts`. Create a separate group-slug denylist (system terms + brand terms). Validate at group create.
4. **Feature flag plumbing.** Read `FEATURES_GROUPS` from `$env/dynamic/private`; gate routes, settings UI, and the mixtape-home picker. When off, `/g/*` and `/u/*` return 404.
5. **`/g/create` flow.** Steward picks slug, name, one-line description. Creator auto-added as steward member. First invite code generated.
6. **Invite-code lifecycle.** Human-pickable codes (4–32 chars, lowercase ASCII + hyphens). Steward can set expiry, use-cap, revoke. Per-IP rate limit on invite-attempts to keep brute force impractical at short code lengths.
7. **Signed-in invite flow.** `/g/{slug}/i/{code}` → validate code, join, redirect to `/g/{slug}`. Already-member redirects to the landing with a "You're already in" toast.
8. **New-user invite flow.** *Most design weight here.* The brand-new visitor lands at `/g/{slug}/i/{code}`, sees "You've been invited to {Group Name}. {one-line product blurb.} Enter your email to join." Magic link carries invite intent **in the URL** (not a session cookie — cookies break the laptop→phone case). Single-step verify-and-join. Lands on `/g/{slug}` with a "Welcome — create your mixtape →" CTA. Target: <5 min from invite click to first mixtape on the page.
9. **`/g/{slug}` landing — Member mixtapes tab.** Name + description + cards, sorted by `updated_at desc`. Card visual matches `docs/mockups/whatsapp-unfurl.html` so the OG-unfurl and the landing share one design moment. Empty mixtapes (`songCount = 0`) are **filtered out** of the directory — the landing is "look what we've made", not a join roster; silent members are reflected in the `memberCount` only. **Exception:** the viewer's own row appears even when empty, with a "Add a song to make this visible to the group" hint, so they can see themselves while contributing. The header's mixtape count uses the active (`songCount ≥ 1`) count, not the array length.
10. **`/g/{slug}/{handle}` mixtape page.** Reuse the existing `/{handle}` `+page.svelte` renderer; the difference is purely the load + RLS path.
11. **Non-member view of `/g/{slug}`.** Name + description + "Join with invite code" field (paste a code or full invite URL). No member list, no mixtape list. Group slug doesn't exist → 404 (no probing for valid slugs).
12. **Error states.** Under-informative on purpose: revoked / expired / never-existed codes all read "This invite is no longer active. Ask the group's leader for a new link."

### 3b — Discovery and movement

13. **`/u/{handle}` profile page.** Viewer-aware listing of the user's mixtapes across scopes. Anonymous viewer sees public only; group members see that group's mixtape; owner sees everything.
14. **"Songs we share" + "All songs" tabs.** See *Landing page — three tabs* below. Same component, different filter; tab strip + sub-intro per tab.
15. **Share-mixtape-with-group flow.** Wired via `?/shareWith` (inserts a row in `mixtape_group_shares`) and `?/unshareFrom` (deletes it). One mixtape entity per user; sharing adds an edge to a group. Edits at `/{handle}/edit` propagate everywhere the mixtape is shared because the songs and stories live on one row. **No copy, no snapshot, no divergence** — by design. For divergent versions, a user makes a second mixtape entity (v1.5+).

### 3c — Niceties

16. **Guest-link issuance.** From mixtape settings, "Share with someone outside the group" → generates `/g/{slug}/{handle}?invite={token}` for a single mixtape, optionally expiring. Creator-only in v1.
17. **Leave-group flow.** Removes membership; user's mixtape (if it was in the group) reverts to `visibility='unlisted'` at `/{handle}`.
18. **Delete-group flow.** Reverts all member mixtapes to `unlisted` at `/{handle}`, notifies each creator. Does *not* cascade-delete mixtapes.

## Landing page — three tabs

The directory keeps the individual mixtape as the artifact (Member mixtapes is default). The two song-level tabs are the same component with different filters; All songs is the superset, Songs we share is the subset where `contributors.length ≥ 2`.

### Common rules across Songs we share + All songs

- **Dedup key.** ISRC when both rows have it (Apple Music API gives us ISRC most of the time, per Phase 2). When either side lacks it, fall back to normalized title + artist — lowercase, strip "feat.", strip parenthetical qualifiers, collapse whitespace.
- **Layout.** Left-margin rail + accent dot per song (matches the personal mixtape page), no year column. Each row: title + → Listen (right-aligned), artist below, then stories stacked. Each story prefixed with "from {DisplayName}", linking to the contributor's `/u/{handle}`.
- **Sort across songs.** **Newest added first** — by max `Story.created_at` across contributors for that song. Replaces the earlier "year-on-the-rail ascending" rule, since the rail is gone and adoption of `memory_year` was too thin to use as a sort key.
- **Story order under a song.** Earliest `Story.created_at` first — preserves the thread feel.
- **`memory_year` rendering.** Kept as "This song reminds me of {year}." in-story lead-in when present. Not used for sort, not displayed as a structural column.
- **Story truncation.**
  - First **2 sentences** of source `Story.text` (sentence boundary: `[.!?]` followed by whitespace or end). If the first 2 sentences exceed ~280 chars, truncate at ~280 with ellipsis.
  - Inline `[more]` link expands to full story (toggles to `[less]`); no navigation away. Stories shorter than the cap show no `[more]`.
  - Truncation runs on plain text *before* markdown render, then the trimmed text is re-rendered — avoids splitting tags.
- **Empty states.**
  - Songs we share empty: "No shared songs yet." Tab stays visible — the empty is a nudge.
  - All songs empty: "No songs yet — be the first." (Same as the Member mixtapes empty case at group-creation time.)
- **Performance.** Compute at request time at writing-group scale (≤20 members × ≤30 songs each = trivial). Materialized view only if real use shows it slow.

### Tab-specific rules

- **Songs we share** filter: `contributors.length ≥ 2`. Shown sub-intro: "{N} songs picked by two or more of you."
- **All songs** filter: none. Sub-intro: "Every song picked by the group · newest first."

### Steward affordances

- **Description edit:** pencil at the end of the description, visible only when viewer is a steward. Inline edit pattern.
- **Other steward affordances** (manage invite codes, member roster, delete group) live on a separate `/g/{slug}/manage` page accessed via a "Manage group" link in the hamburger menu when the viewer is a steward.
- **Non-stewards see no Manage link, no pencil** — role-conditional server-side, with RLS enforcing underneath.

## Open questions to settle during build

Carried from `design-groups.md` plus Phase 3 additions:

- **Group slug constraints.** Lean: 3–32 chars, lowercase ASCII + hyphens, system-terms denylist, no profanity filter in v1.
- **When user picks `/u/{handle}`.** Lean: at first-mixtape creation, not at signup — keeps the invite flow short.
- **Guest-link issuance — creator vs steward.** Lean: creator-only in v1.
- **Songs-we-share sort.** Current rule is "year-on-the-rail then title." Revisit if writing-group use shows a better default (e.g., recency, or member-count).
- **Tab persistence.** Should the Member-mixtapes / Songs-we-share choice persist in localStorage like the expand/compact view? Probably yes; trivial.
- **Cross-group membership visibility.** Default: no. A group member can't enumerate another member's other groups.
- **Anonymous-viewer copy on `/g/{slug}`.** "Join with invite code" field needs friendly copy that doesn't sound like a SaaS gate — borrows tone from the rest of the product.

## Explicitly not in Phase 3

- Public mixtape discovery surface (no global feed of mixtapes)
- "Request to join" flows
- Per-mixtape multi-group or multi-scope visibility
- Payment, billing, plan tiers — but forward-compat: keep `Group.created_by`, don't hardcode group limits, group creation stays an explicit action
- Steward transfer flows
- Collective-mode groups
- Multiple mixtapes per scope per user (asymmetric `/u/{handle}/{slug}` URL shape sketched in `design-groups.md` §1a)
- Group theming or branding
- Chat / comments inside a group — WhatsApp continues to serve that role

## Smallest interesting milestone

The writing group can see `/g/writing-meditation` listing each member's mixtape, joined by an invite code, with a "Songs we share" tab surfacing overlap. A person outside the group can't enumerate handles. The creator can issue a guest link to share one mixtape with a family member.

That clears the three problems at the top of this doc and validates the shape before any wider audience.

## Scope honesty

Phase 3 is bigger than Phase 2 was. Phase 2 was a weekend; Phase 3 is multiple. Two ways to stage:

- **3a / 3b / 3c**, shipping each behind the same flag. The writing group can use 3a (minimal joinable shell with directory landing) while 3b ("Songs we share" + `/u/` profiles + move-between-scopes) and 3c (guest links + delete-group + steward niceties) build.
- **One long-lived branch**, ship the whole thing in one flag-flip.

Lean: stage as 3a / 3b / 3c. The writing group gets value from 3a alone, and each cut surfaces real feedback before the next is built.

## Related artifacts (planned during build)

- `docs/mockups/group-landing.html` — visual mockup of the landing-page tabs, matching the `whatsapp-unfurl.html` design language. Likely first deliverable once 3a starts.
- Update `CLAUDE.md` — promote groups from "future audience" framing to "v1 feature behind flag" once 3a lands; add `/g` and `/u` to the URL namespace section; update the data model section to reflect `group_id` and the expanded visibility enum.
