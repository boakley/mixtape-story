// Personal handles claimed at /onboarding become the URL fragment in
// /{handle}. A pre-emptive denylist keeps three things from going
// wrong:
//
//   - Routes: a user claiming `login` would shadow /login; same for
//     any future top-level surface
//   - Brand: protects product nouns (mixtape, story) from squatters
//   - Future audiences: per CLAUDE.md "Foundation for future
//     audiences" — artists, memorials, businesses both singular and
//     plural so we keep flexibility on the eventual route shape
//
// Single-letter handles are reserved as defense-in-depth: if the
// handle regex ever relaxes, /u/{handle} or /m/{slug} stays
// collision-free.
//
// Personal handles live in a different namespace than group slugs,
// so this list is broader than RESERVED_GROUP_SLUGS — handles share
// the root path with every potential future top-level route.
export const RESERVED_HANDLES = new Set([
  // system / auth / infra
  'about', 'account', 'admin', 'api', 'auth', 'callback', 'email',
  'help', 'how-it-works', 'login', 'logout', 'me', 'onboarding', 'privacy', 'robots',
  'settings', 'signin', 'signup', 'sitemap', 'static', 'support',
  'terms', 'verify',

  // brand / product
  'mixtape', 'mixtapes', 'mixtapestory', 'og', 'story', 'stories',

  // discovery / navigation
  'dashboard', 'discover', 'explore', 'feed', 'inbox', 'notifications',
  'search', 'share', 'shared',

  // future audiences
  'artist', 'artists', 'band', 'bands', 'book', 'books',
  'business', 'businesses', 'creator', 'creators', 'fan', 'fans',
  'memorial', 'memorials',

  // single-letter namespace escape hatches
  'a', 'b', 'm', 'u', 'x'
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}
