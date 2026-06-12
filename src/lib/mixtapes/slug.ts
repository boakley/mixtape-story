// Mixtape slug validation. Shares the handle/group-slug grammar:
// 3–32 chars, lowercase letters/digits/hyphens, starts with a letter,
// ends with a letter or digit.
//
// The grammar is the namespace-safety mechanism: system paths under
// /{handle}/ are `_`-prefixed (/_edit, future /_qr …) and a slug can
// never start with `_`, so user space and system space can't collide —
// by construction, not by list. The denylist below exists only for the
// legacy /edit redirect shim, whose literal route segment outranks the
// [slug] param and would make a mixtape slugged "edit" unreachable.

export const MIXTAPE_SLUG_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

export const RESERVED_MIXTAPE_SLUGS = new Set(['edit']);

export function isValidMixtapeSlug(slug: string): boolean {
  return MIXTAPE_SLUG_RE.test(slug) && !RESERVED_MIXTAPE_SLUGS.has(slug);
}
