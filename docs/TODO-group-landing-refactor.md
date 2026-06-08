# Group landing refactor (post-Phase-3b)

`src/routes/g/[slug]/+page.svelte` hit **809 lines** after Phase 3b
polish landed (three tabs, inline name+description editing, HelpTip,
steward collapse, ListenWithChip integration). Tests pass, type-check
clean, no security or correctness flaws — but the file is past the
threshold to leave before adding the next feature.

Concrete moves from the 2026-06-07 code review. **Delete this file
when the refactor lands.**

## Three extractions

### 1. `<InlineEdit />` — high value, low effort

Name and description editing are ~100 lines of near-duplicated form
markup + state in `+page.svelte`. Both follow the same pattern:

- Idle view: text (or heading) + pencil button (steward only)
- Click pencil → switch to form
- Form: input (or textarea) with live char counter, Save + Cancel
- Save submits via `use:enhance`; success dismisses the form

Proposed shape:

```svelte
<InlineEdit
  label="Group name"
  formAction="?/editName"
  multiline={false}
  maxLength={100}
  value={data.group.name}
  errorPayload={nameForm}
>
  {#snippet display(value)}
    <h1 class="...">{value}</h1>
  {/snippet}
</InlineEdit>
```

Saves ~80 lines × 2 call sites. **~30 min.**

### 2. `<StewardSection />` — high value, medium effort

The steward section is ~140 lines of `+page.svelte` and owns three
pieces of internal state (collapsed flag + invite-form payload +
HelpTip context). Maps 1:1 to a real product concept ("the steward
management panel") and is steward-gated as a whole — clean
encapsulation boundary.

Proposed shape:

```svelte
{#if data.isSteward}
  <StewardSection slug={data.group.slug} invites={data.invites} />
{/if}
```

Component owns its own collapse state + localStorage hookup. The
invite form + revoke buttons stay POST-action driven; we just move
them. **~45 min.**

### 3. `<GroupSongRow />` — defer

The `songEntry` snippet is ~140 lines but tightly coupled to page
state (`view`, `expandedSongsInCompact`, `expandedStoryKeys`,
`listenPref`). Could become a component with prop-bound state, but
the prop list would get long.

**Recommendation:** leave the snippet inline for now. Extract when
there's a second consumer (a different tab using the same layout, or
a search-results page).

## Three small consistency fixes (do during the refactor)

### A. `requireSteward()` action helper

Every action in `+page.server.ts` opens with the same ~20 lines:
`gate()` → `safeGetSession()` → group lookup → membership lookup →
role check. Five actions × 20 lines of repeat. Proposed helper:

```typescript
async function requireSteward(params, locals, errorKey: string) {
  // returns { user, admin, group } or throws / returns fail
}
```

Saves ~80 lines + makes the action body shorter and more readable.

### B. `useStoredState()` rune

The localStorage read+write pattern appears in three places:
`activeTab` and `stewardOpen` in `+page.svelte`, `view` inside
`ViewToggle`. Small rune:

```typescript
function useStoredState<T extends string>(
  key: string,
  defaultValue: T,
  validate: (v: string) => v is T
): { get value(): T; set value(next: T): void }
```

### C. localStorage key namespace consistency

Currently inconsistent: `group-tab` (no namespace), `mixtapestory:view`,
`mixtapestory:steward-open`. Normalize all to `mixtapestory:*` prefix
during the refactor.

## Out of scope

- Building `/g/{slug}/manage` (eventual home of steward UI per
  `docs/PHASE-3-groups.md`). The collapsible section is the stopgap.
- Mobile-safe popover positioning for `HelpTip` when icon is near the
  viewport left edge. Cosmetic; separate ticket.
- Story-truncation edge cases (abbreviations, ellipses). Good enough
  for v1.
- Re-implementing the song-row as a component (option #3 above).

## Expected end state

| File | Before | After (target) |
|---|---|---|
| `src/routes/g/[slug]/+page.svelte` | 809 | ~500 |
| `src/routes/g/[slug]/+page.server.ts` | 583 | ~450 |
| `src/lib/components/InlineEdit.svelte` | — | ~80 |
| `src/lib/components/StewardSection.svelte` | — | ~140 |
| `src/lib/rune/use-stored-state.svelte.ts` | — | ~30 |
| `src/lib/server/group-actions.ts` | — | ~30 |

Tests target ARIA roles + stable `data-testid` hooks, so they should
survive the refactor unchanged.
