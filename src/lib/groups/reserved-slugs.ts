// Group slugs are claimed by stewards at `/g/create` and become the
// permanent URL fragment in `/g/{slug}` and `/g/{slug}/{handle}`. A small
// denylist keeps three things from going wrong:
//
//   - Routes: `create` would shadow `/g/create`; same for any future
//     management surfaces under `/g/{verb}`.
//   - Brand: prevents squatting on terms the product cares about
//     (mixtapestory, story, stories).
//   - System nouns: words a user might assume are "official" pages that
//     don't belong to anyone (admin, support).
//
// Group slugs live in a different namespace than personal handles, so the
// list here is narrower than `RESERVED` in onboarding/+page.server.ts.
// We're not pre-emptively burning every plausible audience term; we add
// to this list as concrete needs surface.
//
// Per design-groups.md: "Probably a system-terms denylist, 3–32 chars,
// lowercase ASCII + hyphens. No profanity filter in v1."
export const RESERVED_GROUP_SLUGS = new Set([
  // route conflicts under /g
  'create', 'new', 'manage', 'settings',

  // brand
  'mixtape', 'mixtapes', 'mixtapestory', 'story', 'stories',

  // system / org nouns that could mislead
  'admin', 'help', 'support', 'system', 'official', 'staff'
]);

export function isReservedGroupSlug(slug: string): boolean {
  return RESERVED_GROUP_SLUGS.has(slug.toLowerCase());
}
