# Groups — design exploration

A design doc for adding **groups** to mixtapestory.com, behind a feature flag, earlier than `CLAUDE.md` previously thought. This document surveys the choices and lands on a lean for each. Nothing here is committed yet — the goal is a concrete-enough sketch that we can decide whether and when to build it.

## The problem v1 actually has

CLAUDE.md frames discovery within the writing group as an open question, leaning toward "invite-link only — every share is intentional." In practice, three issues with pure link-sharing show up fast:

1. **Handles are guessable.** Mixtapes live at `/{handle}`. Anyone who learns the domain exists can try `/sam`, `/margaret`, common first names — and either find real mixtapes that weren't shared with them, or learn which handles are taken. It's leaky-by-default.
2. **New members can't catch up.** When the 21st person joins the writing group, they can't see existing mixtapes except by scrolling back through WhatsApp. The artifacts don't accrete anywhere browseable.
3. **No sense of "the group's mixtapes."** Nothing in the product knows the writing group exists. Each mixtape is an island.

These are writing-group problems, not v2-audience problems. The "members directory" path was already named in `design-notes.md` as the alternative to invite-link-only; this doc is essentially fleshing out what that path looks like.

## Decisions worth making together

### 1. Where do group-scoped mixtapes live in the URL?

Two shapes worth taking seriously:

**A. `/{group}/{handle}`** — your instinct. `mixtapestory.com/writing-meditation/joe`. Reads nicely, feels like a section of the site.

**B. `/g/{group}/{handle}`** — explicit namespace. `mixtapestory.com/g/writing-meditation/joe`. Less pretty, but technically clean.

The choice hinges on whether group slugs and personal handles share a namespace.

Under (A), they do: every `/foo` request has to ask "is `foo` a group or a handle?" That requires a DB lookup on every root-level request, and it means no user can ever have handle `writing-meditation` because the group claims it. The reserved-prefix list in `CLAUDE.md` grows to include every group slug.

Under (B), they don't: `/g/` is a single reserved prefix; everything under it is groups. A user can have handle `writing-meditation` and a group can also be slugged `writing-meditation` without conflict. The router doesn't have to disambiguate at every request.

**Lean: B (`/g/...`).** The aesthetic loss is small; the architectural cleanliness is real. We already reserve `m`, `a`, `x`, `b` speculatively — `g` is one more entry, and it earns its keep. If `/g/` ever feels wrong once a real group lives there, we can revisit; renaming routes is cheap, growing a denylist isn't.

### 1a. User profile pages live at /u/{handle}

A user with mixtapes in several groups doesn't otherwise have one URL that shows all of them. The natural place for that is a profile page at `/u/{handle}` — `/u/bryan` lists Bryan's mixtapes in a viewer-aware way.

The choice this raises: does the existing `/{handle}` URL survive as a personal-mixtape URL, or does everything move under `/u/`?

**Lean: keep `/{handle}` for the personal mixtape, add `/u/{handle}` as the listing.** `/sam` stays as Sam's personal mixtape, if he has one — the unfurl mockup, the vision doc, and the whole WhatsApp share flow are built around that clean URL, and it's the most-pasted URL in the product. `/u/sam` is an additional page that aggregates everything Sam has across scopes; most viewers arrive at `/sam` from a chat link and visit `/u/sam` only when they want to see what else this person has made.

The listing at `/u/{handle}` is viewer-aware:

- Anonymous or stranger viewer: sees only public mixtapes (often nothing)
- A member of a group the user belongs to: sees that group's mixtape, plus any public ones
- The user themselves: sees all of their own mixtapes

This is no worse for handle enumeration than today — `/u/bryan` returning "no mixtapes you can see" leaks the same information as `/bryan` returning "not found."

The "one mixtape per scope" rule is what keeps this simple: one personal mixtape (at `/{handle}`) plus one per group the user is in (each at `/g/{group}/{handle}`). The `/u/{handle}` listing then aggregates whichever of those the viewer has rights to. This matches `design-notes.md`'s explicit not-in-v1 entry for "multiple mixtapes per user."

If we ever open up multiple mixtapes per scope, the URL shape worth landing on is asymmetric: the primary keeps the clean URL (`/{handle}` for personal, `/g/{group}/{handle}` within a group), and additional ones live under the profile — `/u/{handle}/{slug}` for personal extras, `/g/{group}/{handle}/{slug}` for group extras. This keeps the root namespace from getting polluted with `/bryan`, `/bryan-1`, `/bryan-something`, `/bryan-foobar` variants — the kind of cosmetic erosion that compounds quickly with active users. Slugs are user-chosen, not auto-incremented IDs; making the user pick a slug is part of the curation gesture.

The constraint to defer multi-mixtape-per-scope to v1.5+ isn't technical — the schema already supports it. It's the curation discipline ("your one mixtape") that gives the artifact its weight.

### 2. Public and group mixtapes live at different URLs

If a mixtape is part of a group, its primary URL is `/g/{group}/{handle}`. If it's public or unlisted, its URL is `/{handle}`. The same mixtape can't be at both URLs at once — pick one home.

This matches your stated intuition ("if a mixtape was publicly visible it should not have the /writing-meditation prefix").

The cost: moving a mixtape between scopes changes its URL, which breaks links pasted in WhatsApp. Two mitigations:

- When a viewer has permission to see both URLs, the old one redirects to the new one. So if Sam moves their mixtape from public to group, and Margaret (a group member) clicks the old `/sam` link, she lands at `/g/writing-meditation/sam` instead of a 404.
- Warn the creator explicitly when they change their mixtape's home: "Links you've shared previously may stop working."

### 3. Membership is invite-coded, not handle-based

A group has one or more rotatable invite codes. Anyone with a code can join. There is no "request to join" flow in v1 — the WhatsApp group already serves as the channel for requesting access ("hey, send me the code").

A group has one or more **stewards** (the creator, plus anyone they delegate). Stewards can issue / rotate / revoke invite codes, remove members, and edit the group's landing-page copy. There is no separate "admin" or "moderator" role; steward is the only elevated role in v1.

## Group modes: anthology and collective

A group can take two shapes, and the choice is fundamental enough that it's worth naming as a mode set at group creation.

**Anthology mode** is what v1 needs: each member has their own mixtape, and the group's landing page lists them. The writing group, a band fan circle, a book club making "songs from books I read this year" mixtapes — all anthology. The group is the wrapper; the individual mixtapes are the artifacts. Everything described elsewhere in this doc assumes anthology mode.

**Collective mode** is a single shared mixtape that members co-author. There's no per-member mixtape page; the group's URL `/g/{group}` *is* the mixtape, and each song carries an attribution to whichever member added it and wrote its story. The memorial use case is the canonical example — friends and family making one mixtape about someone who's passed, each contributing songs that remind them of the person, each writing their own story. Where anthology answers "what's each of us going to make?", collective answers "what are we going to make together?"

The CLAUDE.md data model already supports both. `Story.author_id` was deliberately kept separate from `Mixtape.creator_id` for exactly this reason. Collective mode adds essentially no schema cost — a single `mode` field on the Group entity, plus the UX paths that follow from it.

**Implications worth understanding:**

- **URL shape is the same in both modes.** `/g/{group}` is the page you land on. In anthology mode it renders as a directory of member mixtapes; in collective mode it renders as a single mixtape with multiple story authors.
- **Adding to the mixtape differs.** Anthology: you create and maintain your own at `/g/{group}/{handle}`. Collective: you add songs (with stories) to the group's mixtape. Each member can add or remove their own contributions; stewards can rearrange ordering and (rarely) remove a member's contribution as moderation.
- **Leaving the group means different things.** Anthology: your mixtape reverts to unlisted at `/{handle}`. Collective: your contributions stay (the mixtape would otherwise have holes), but you can no longer add or edit. This is a real wrinkle — in collective mode, contributions are partly out of the contributor's hands once made. That's the right behavior for memorials (contributing is itself an act of letting go a little) but worth being deliberate about.
- **Mode is permanent.** A group is one or the other at creation; switching after the fact is messy (anthology → collective: whose mixtape becomes the collective? collective → anthology: how do songs split into per-member mixtapes?). Don't allow conversion.

**For v1, only anthology mode ships.** The writing group needs anthology; the band-fan-club demo case is anthology by default. Collective mode is added when the memorial or shared-tribute use case becomes real. Recognizing this now costs nothing in v1 but resolves what was going to be a much messier future question — "multi-user editing of a single mixtape" stops being a separate feature to invent and becomes a mode of an existing one.

## How joining actually works

Walking through the flows:

**Creating a group.** From settings, "create a group." Choose a slug, a display name, a one-line description. The creator becomes the sole steward. A first invite code is generated.

**Joining a group.** Click an invite link (`/g/{group}/i/{code}`); sign in or create an account if needed — the invite is preserved through signup. See *The new-user invite flow* below for the full walk-through.

**Adding your mixtape to a group.** From mixtape settings, choose its home: personal (unlisted at `/{handle}`) or a group you're in. A mixtape lives in at most one group at a time. Moving updates the URL; the creator is warned.

**Leaving a group.** Removes the user from the member list. Their mixtape, if it was in the group, reverts to unlisted at `/{handle}`.

**Multiple groups per user.** Yes. A user can belong to several. The v1 "one mixtape per user" rule ports to "one mixtape per scope" — so a user could have a writing-meditation mixtape and a separate mixtape in another group, but not two within the same group. This keeps the curation-and-identity constraint from v1 intact where it matters.

## The new-user invite flow

The flows above assume signed-in users. The harder case is the brand-new visitor — someone in a seminar or discussion group who's never heard of the site, sitting in a room where the leader just said "follow this link." Most of the design effort for joining belongs here, because this is where most users actually meet the product.

The bare `/g/{group}` URL can't double as the invite link without giving up access control — anyone who stumbles on the slug could join. So invites are code-bearing URLs, but with a shape designed for handing out verbally or visually:

`mixtapestory.com/g/seminar-spring-2026/i/spring2026`

The code is **human-pickable**, not a random token. The steward picks `spring2026` when creating the invite — memorable, fits on a whiteboard, works as a QR slide. Codes are scoped to the group, so `spring2026` can be a code for many different groups without colliding.

### What a brand-new visitor sees

1. Lands on the invite URL. Page shows: *"You've been invited to {Group Name}. {One-line description of what mixtapestory is.} Enter your email to join."* Framed as accepting an invitation, not signing up for a SaaS — the conversion-killing friction at this step is the user wondering "what is this thing," and the answer needs to be on the page, not behind a link.

2. Enters email. Magic link goes out. The invite intent rides in the magic link URL itself, not a session cookie — cookies break the common case of typing email on a laptop and opening the magic link on a phone, which is exactly what happens in a seminar room with phones and laptops side by side.

3. Clicks the magic link. Verification completes the auth, creates the account, and joins the group in a single step. Lands on the group's landing page.

4. The landing page prompts: *"Welcome to {Group}. Create your mixtape →"*. The first-mixtape flow walks them through picking a `/u/{handle}` slug, adding a few songs, writing one story. Target: under five minutes from invite click to a mixtape appearing on the group page.

### Code design

**Format.** 4–32 characters, lowercase alphanumerics plus hyphens, unique within the group but not globally. Stewards who want stronger codes can pick less guessable ones (`spring2026-x7q9`); the system rate-limits code attempts per IP to keep brute-force impractical at the default lengths too.

**Lifecycle.** Defaults are unlimited use and no expiry. Stewards can optionally set:

- An expiry date ("24 hours" / "7 days" / specific date)
- A use count limit ("first 30 people")
- Revoke at any time

For a seminar event, "expires in 7 days, first 30 uses" is the right shape — generous for the room, not a hostage to fortune.

**Multiple codes per group.** Yes. A steward might keep one permanent code for trusted referrals plus short-lived ones for specific events. Each code's URL is different, so the steward can hand out different links to different audiences without recycling the same one.

### What `/g/{group}` shows non-members

The bare URL still exists. For a non-member arriving without a code, it shows:

- The group name and short description (the slug is already exposed once a URL has been shared, so the name and description leaking buys no extra privacy)
- A "Join with invite code" field — paste a code or a full invite URL
- No member list, no mixtapes, no visible counts

So the seminar leader can hand out the full code URL, a QR of the code URL, or the bare URL plus the code separately — whatever the format of the room calls for.

### Error states

Friendly defaults, deliberately under-informative for security:

- Code revoked, expired, or never existed: *"This invite is no longer active. Ask the group's leader for a new link."* Don't distinguish causes — prevents brute-force enumeration and doesn't leak steward behavior.
- Code use limit reached: same message as expired.
- Already a member: redirect to the group landing with a *"You're already in"* state.
- Group slug doesn't exist: 404. (Showing the join prompt for any slug would let strangers probe for valid group names.)

### Steward workflow for an event

Walking through the seminar case end-to-end:

1. Leader creates the group at `/g/create`. Picks slug `seminar-spring-2026`, name "Spring 2026 Seminar," short description.
2. Generates an invite code `spring2026` with constraints: expires in 7 days, first 30 uses.
3. The system gives the leader two artifacts: a shareable URL (`mixtapestory.com/g/seminar-spring-2026/i/spring2026`) and a downloadable QR code of the same URL.
4. In the room: leader shows the URL or QR on a slide. *"Scan this and add a mixtape — five songs and a paragraph each, doesn't have to be polished."*
5. People scan, hit the welcome page, enter email, get magic link, verify, land on the group, and start a mixtape.
6. Leader watches the group landing populate as people submit, over the next hour to week.

No "request to join" UX, no per-person approval, no separate code-entry step for the canonical case.

## The "show my family" case

You raised this directly: if a mixtape lives in a group, can a family member see it without joining the group? This is the most interesting design question in the set because none of the obvious answers is clean.

Options ascending in cost:

**(a) Tell them to publish a public copy too.** Friction; defeats the point.

**(b) Tokenized guest link.** `/g/writing-meditation/joe?invite=abc123` grants read access for that one mixtape, expires after some window. No membership granted; the visitor doesn't see other group mixtapes or the group landing page.

**(c) Per-mixtape "also publicly readable" toggle.** Mixtape stays in the group; additionally, anyone with `/{handle}` can read it. Two URLs for one piece of content; only the group URL is discoverable.

**(d) Full multi-scope visibility.** A mixtape can be in zero, one, or many groups, and independently public or not. Maximum flexibility; biggest schema change.

**Lean: (b).** It maps to a clear mental model — *here's a link for you, sis* — without changing the mixtape's home or introducing weird dual-state mixtapes. It also covers a use case beyond family: a steward issuing a guest link for a one-off external share, or the creator letting a friend see something without a permanent grant.

(c) is tempting because it's a property rather than a token. But it produces the ambiguous state of "this mixtape is technically in the group, but also lives publicly," which is exactly the kind of fuzziness v1 should avoid. (d) is the right long-term shape if the product widens, but it's overkill now.

## Visibility model after groups land

The `visibility` field grows from three values to four. The meaning is still scope-of-discovery:

- `private` — only the creator. Not used at launch; reserved.
- `unlisted` — at `/{handle}`, anyone with the link. (Today's `'link'` value, renamed for clarity.)
- `group` — at `/g/{group}/{handle}`, only group members. Requires `group_id`.
- `public` — at `/{handle}`, listed publicly. No public discovery surface exists in v1, but the value is in the enum so we don't have to migrate later.

The joint constraint worth enforcing: `visibility = 'group'` iff `group_id IS NOT NULL`. App-level check, plus a Postgres CHECK constraint as belt-and-braces.

## The group landing page

You described this well — "almost like the All Mixtapes page perhaps with an introductory paragraph or two."

`/g/{group}` shows:

- The group's name and a steward-editable one-or-two paragraph description
- A list of member mixtapes, using the same card language as the OG unfurl (album-art mosaic, title, song count, date range)
- Sorted by most recently updated; sort option could be configurable later, not v1
- Visible only to logged-in group members

This is the first place in the product where a list of mixtapes appears anywhere. For the writing group specifically, this becomes the page that gets bookmarked and revisited — the WhatsApp group keeps being the social layer, and the landing page becomes the contemplative-reading layer.

One small note: the card design should match the unfurl visual direction (`whatsapp-unfurl.html`). The product gets coherence from re-using that one strong visual moment in multiple contexts.

## Data model additions

Roughly:

```ts
type Group = {
  id: string
  slug: string                // unique; appears in URL as /g/{slug}
  name: string                // display name
  description: string         // markdown, shown on landing
  mode: 'anthology' | 'collective'  // permanent at creation; v1 only uses 'anthology'
  created_at: timestamp
  created_by: string          // FK → users (initial steward)
}

type GroupMembership = {
  group_id: string
  user_id: string
  role: 'steward' | 'member'
  joined_at: timestamp
}

type GroupInvite = {
  id: string
  group_id: string
  code: string                // human-pickable, e.g. spring2026 or march15-cohort
  created_by: string
  created_at: timestamp
  expires_at: timestamp | null
  revoked_at: timestamp | null
  uses_remaining: number | null    // null = unlimited
}

type GuestLink = {            // the family-member case
  id: string
  mixtape_id: string
  token: string
  created_by: string
  created_at: timestamp
  expires_at: timestamp | null
  revoked_at: timestamp | null
}
```

And on `Mixtape`:

```ts
type Mixtape = {
  // ...existing fields
  group_id: string | null     // null = personal scope
  visibility: 'private' | 'unlisted' | 'group' | 'public'
}
```

Reserved handle list gets `g` and `u` added. Group slugs need their own reserved-words list (system terms, brand terms) — separate from personal handles.

RLS policies (per `CLAUDE.md`'s "use RLS from day one"):

- Reading a mixtape with `visibility = 'group'` requires the requester to be a member of `group_id`, OR present a valid `GuestLink.token` for that mixtape
- Reading a group landing page requires membership
- Reading a member list requires membership

## Feature flag rollout

Gate everything behind `FEATURES_GROUPS=1`. Off by default. When off:

- `/g/...` routes 404
- "Create a group" doesn't appear in settings
- Mixtape settings don't show a group field
- Existing v1 behavior is unchanged

This lets the feature build in a branch and ship to production unexposed. Turn it on for the writing group once the landing page reads well; widen it if and when there's a next audience.

The flag boundary is also a useful forcing function. If you find yourself wanting to put logic *outside* the flag ("just in case"), that's a signal the scope is growing past what was committed.

## Notes toward the paid-feature direction

You mentioned group creation might eventually be paid ($5–20/year) to offset hosting. A few cheap forward-compatibilities cost nothing now:

- `Group.created_by` is already there; adding `plan` or `billing_status` later is one column
- Don't hardcode group limits anywhere — if it becomes paid, "N groups free, unlimited paid" is one policy in one place
- Keep group creation an explicit user action, never implicit auto-creation — easier to gate later

No payment code in v1. No "upgrade" copy. Just don't paint yourself into a corner.

## What this is explicitly not

- Not a social network. No follows, no friends, no activity feeds.
- Not collective-mode groups in v1. The mode v1 needs is anthology (each member has their own mixtape, group landing lists them). Collective-mode groups — one shared mixtape per group, members contributing songs with their own stories — serve the memorial direction and similar shared-tribute use cases. The data model already supports them; the mode itself is deferred to v2.
- Not chat or comments inside a group. WhatsApp continues to serve that role; the existing "Ask about this song" wa.me deep-link still works inside groups.
- Not public group discovery. There is no "browse groups" page in v1. Groups are joined via link, not browsed.
- Not group-level theming or branding. (That's a small-business-audience feature.)

## Open questions worth deciding before building

- **Group slug constraints.** Reserved words, length limits, character set. Probably a system-terms denylist, 3–32 chars, lowercase ASCII + hyphens. No profanity filter in v1.
- **What happens when a group is deleted?** Member mixtapes revert to `unlisted` at `/{handle}` and creators get notified. Don't cascade-delete mixtapes.
- **Can a group member see another member's other group memberships?** Default to no — membership lists are visible only inside each group.
- **Steward transfer / multi-steward.** Eventually needed. Defer to when a real group asks.
- **Guest link UX.** Steward-issued vs creator-issued? Probably creator-only in v1 (you control who sees your own mixtape).
- **When does a user pick their `/u/{handle}` slug?** Lean: at first-mixtape creation time, not at signup. The invite flow creates the account with just email; the user picks their handle when they start their first mixtape. Keeps the invite flow short and means an account can briefly exist without a public identity. The alternative — pick at signup — adds one screen to the invite flow but makes the identity model simpler from the start.

## If we shipped this

v1 of groups would include:

- `/g/{slug}` landing pages and `/g/{slug}/{handle}` mixtape pages
- `/g/{slug}/i/{code}` invite URLs that work for signed-in users and brand-new visitors alike
- `/u/{handle}` user profile pages, viewer-aware listings of each user's mixtapes
- Redirect from old to new URL on a visibility move, when the viewer has permission to see the new one
- Invite-code-only joining, no request flow
- One mixtape per group per user (preserves v1's curation constraint per scope)
- Guest links for the family-share case
- Steward + member roles only
- Feature-flagged off until the writing group is ready

Deferred:

- Public mixtape discovery (no global feed of mixtapes)
- "Request to join" flows
- Per-mixtape multi-group or multi-scope visibility
- Payment, billing, plan tiers
- Steward transfer flows
- Collective-mode groups — one shared mixtape per group with stories attributed to multiple authors; v1 only supports anthology mode
- Multiple mixtapes per scope per user — themed side mixtapes ("road trip songs," "lullabies sung to my kids") are inherently personal, not group-shaped, and wait for v1.5+ using the asymmetric URL pattern sketched in section 1a

The smallest interesting milestone: the writing group can see a landing page at `/g/writing-meditation` listing each other's mixtapes, joined by code, and a person outside the group cannot enumerate handles. That's enough to solve the three problems at the top of this doc.
