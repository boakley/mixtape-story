# Design language

What things look like and why. The colors live in `src/app.css`; the
conventions (what a solid dot means vs. a hollow ring, when a `(?)`
shows up, etc.) live in the code that uses them. This doc is the
written-out version so we don't have to re-derive it every time we
build a new surface.

Look here before adding a new page or component. If you're tempted to
invent a new convention, check whether one of these already fits.

## Tokens

Defined in `src/app.css` `@theme`. Use the Tailwind utilities, not raw
hex.

| Token | Hex | Role |
|---|---|---|
| `paper` | `#fdfcf8` | Page background. Warm off-white. |
| `ink` | `#1a1816` | Primary text. Warm near-black, never `#000`. |
| `ink-muted` | `#6b6660` | Secondary text, metadata, captions. |
| `rule` | `#e8e3da` | Borders, separators, the vertical rail. |
| `accent` | `#b04a2f` | One color does all the work — links, the underline, the rail's dot, hover hover-to-color, focus outline, the form-error color too. |

Warm-leaning across the board on purpose; the visual mood is
"hand-lettered notebook," not "SaaS dashboard."

**Fonts**: system sans by default
(`ui-sans-serif, system-ui, -apple-system, …`). A serif token
(`Iowan Old Style → Palatino → Georgia`) is defined but not used
anywhere yet; reserved for the day a long-form reading mode lands.

**Focus**: 2px accent outline, 2px offset, applied globally via
`:focus-visible`. Don't disable it.

## Typography scale

| Use | Class | Notes |
|---|---|---|
| Brand cap line ("MIXTAPESTORY.COM") | `text-[10px] uppercase tracking-wide text-ink-muted` | The link back home, top-left of every page. Smaller and tighter than `text-xs`/`tracking-wider` so it reads as a quiet wayfinding mark, not a heading. Rendered by `BrandCap.svelte` — edit it there, not per page. |
| Page title (h1) | `text-3xl sm:text-4xl leading-tight text-ink` | Group/mixtape name. |
| Song title (h2/h3) | `text-xl sm:text-2xl leading-tight text-ink` | Inside expanded SongRow. |
| Body | `text-base text-ink` | Story bodies. |
| Meta / muted | `text-sm text-ink-muted` or `text-xs text-ink-muted` | Counts, timestamps, attribution. |
| Form label | `text-xs uppercase tracking-wider text-ink-muted` | All form labels follow this pattern. |
| Steward section header | Same as form label | "STEWARD · 0 active invite codes" — same uppercase tracking. |

## Visual vocabulary

### Rail + dot/ring

Vertical column of related items uses a 1px `bg-rule` rail running
through them, with a bullet positioned in a 1rem-wide column to the
left of content.

- **Solid filled dot** (`rounded-full bg-accent ring-2 ring-paper`)
  = a song. Used on `/{handle}` and inside the Songs-we-share / All-
  songs tabs. The paper-colored ring makes it look "punched through"
  the rail.
- **Hollow ring** (`rounded-full border-2 border-accent bg-paper`)
  = a mixtape. Used on the group landing's Member-mixtapes tab.

The semantic: **solid = a thing, hollow = a container of those
things.** Don't break this. If you need a third level, propose it
in `docs/TODO.md` first.

The rail itself extends past each row's padding (`-top-N -bottom-N`
with N matching `py-N`) so adjacent rows visually merge into one
spine. Canonical implementations:

- Solid-dot row: `src/lib/components/SongRow.svelte`
- Hollow-ring row: the Member-mixtapes branch in `src/routes/g/[slug]/+page.svelte`

### Pill toggle

Two-state choices (Expanded/Compact view) sit in a small pill:

```
inline-flex rounded-full border border-rule p-0.5 text-xs
```

Each button: `rounded-full px-3 py-1`. Active = `bg-ink text-paper`,
inactive = `text-ink-muted hover:text-ink`. Canonical:
`src/lib/components/ViewToggle.svelte`.

### Underline tabs

Three-way primary nav (Member mixtapes / Songs we share / All songs).
Flex row with a `border-b border-rule` on the container; each tab
button uses `-mb-px border-b-2` so the active 2px sits *on top of*
the container's 1px rule.

- Inactive: `border-transparent text-ink-muted hover:text-accent`
- Active: `border-accent text-ink font-medium`

Canonical: the tab strip in `src/routes/g/[slug]/+page.svelte`.

### Action links

Every action link is `{leading glyph} {label}`. Underline the **label
only**; the leading glyph stays plain (and aria-hidden, since the label
already names the action).

```svelte
<a href={url}>
  <span aria-hidden="true">→ </span><span
    class="underline decoration-accent decoration-2 underline-offset-4">Listen</span>
</a>
```

Text-ink at rest, accent on hover.

The leading glyph is chosen by meaning, not by uniformity:

- **`→`** for most actions — `→ Listen`, `→ Share my mixtape with this group`.
- **A conventional icon** where one exists and is more learnable than
  the arrow — notably the system **share** glyph for Share. Listen and
  Share end up visually consistent (identical accent underline on the
  label) while Share keeps the icon a first-time visitor recognizes
  before they read the word.

The earlier convention here underlined the glyph + label together; that
forced Share onto the arrow scheme and lost the share-icon affordance.
Refined 2026-06-08 with the masthead redesign.

### Affordance chevron

Trailing `→` on a row whose whole body is a link (the Member-mixtapes
rows on the group landing). Muted at rest, accent on hover via
`group-hover`. Distinct from the per-song *disclosure* chevron in
`SongRow.svelte` (which is `›`, rotates on open, and means "expand
this row to see the story"). Don't conflate the two.

### Section card

Bordered panel: `rounded-md border border-rule bg-paper p-5`. Used
for empty states, steward section, non-member box. Always uses the
page bg color (`paper`) for the fill — no shadow, no tint. The
border + the corner radius do the work.

### Form fields

- Container: usually `<label class="block">`.
- Label span: `text-xs uppercase tracking-wider text-ink-muted`.
- Input/textarea: `rounded-md border border-rule bg-paper px-3 py-2 text-ink focus:border-accent focus:outline-none`.
- Errors: `role="alert"` + `text-accent`. Accent is the error color
  too — no separate red palette.
- Buttons: primary = `rounded-md bg-ink px-3 py-1 text-xs text-paper hover:opacity-90`; secondary/cancel = `text-ink-muted hover:text-accent`.

Canonical: `src/lib/components/InlineEdit.svelte`.

### Help affordances: `(?)`

Form-field help is a small `(?)` icon next to the label. Click-to-
toggle popover (works on touch). Click outside, click another `(?)`,
or `Esc` closes it. The icon is:

```
inline-flex h-4 w-4 items-center justify-center rounded-full
border border-rule text-[10px] text-ink-muted
hover:border-accent hover:text-accent
```

Popover body: `rounded-md border border-rule bg-paper px-3 py-2 text-xs leading-snug shadow-md` with a small triangular notch pointing at the icon.

Canonical: `src/lib/components/HelpTip.svelte`. Wire-up: each `(?)`
takes a `label` (used as `aria-label="Help: {label}"`) and the body
text as the default snippet.

### Pencil ✏️ for inline-edit

Steward-only "edit this field" affordance: a small inline SVG pencil
right after the field it edits. ~13–15px, `text-ink-muted hover:text-accent`,
inline-flex aligned to the text. `aria-label="Edit {field name}"`.
Two examples in `src/routes/g/[slug]/+page.svelte` (group name h1 and
description paragraph) — different sizes, same shape.

## Layout

- **Page container**: `mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12`.
  Narrow column on purpose — this is reading material.
- **Section margin**: `mt-10` (40px) between major sections.
- **Row padding**: `py-2` for compact rows (one-line), `py-4 sm:py-5`
  for expanded song rows with stories.

## Tone

- One-line empty states. No exclamation points. No emoji.
  ("No mixtapes here yet. Be the first.")
- Sentence case in most copy. The brand cap line and form labels are
  the only ALL CAPS surfaces.
- Questions over commands when the page is asking the user something
  ("Add a description", not "Add description.").
- "Mixtape", "story", "song", "creator", "author" — see CLAUDE.md
  vocabulary section. Don't drift into "playlist" or "track."

## Mockups (visual reference)

- `docs/mockups/whatsapp-unfurl.html` — the OG-unfurl design that the
  /{handle} page mirrors.
- `docs/mockups/group-landing.html` — the three-tab landing
  (Member mixtapes / Songs we share / All songs).

Both are live HTML; open them in a browser to see the intent.
