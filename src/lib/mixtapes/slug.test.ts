import { describe, expect, it } from 'vitest';
import { isValidMixtapeSlug, RESERVED_MIXTAPE_SLUGS } from './slug';

// Mixtape slugs share the handle/group-slug grammar:
//   ^[a-z][a-z0-9-]{1,30}[a-z0-9]$  (3–32 chars)
// The grammar itself is what makes `_`-prefixed system paths
// (/{handle}/_edit) collision-free — no denylist entry needed for
// them. The denylist exists only for the legacy /edit redirect shim,
// whose literal route segment outranks the [slug] param.

describe('isValidMixtapeSlug', () => {
  it('accepts ordinary slugs', () => {
    expect(isValidMixtapeSlug('family')).toBe(true);
    expect(isValidMixtapeSlug('road-trip-2019')).toBe(true);
    expect(isValidMixtapeSlug('abc')).toBe(true);
  });

  it('enforces length bounds (3–32)', () => {
    expect(isValidMixtapeSlug('ab')).toBe(false);
    expect(isValidMixtapeSlug('a'.repeat(33))).toBe(false);
    expect(isValidMixtapeSlug('a'.repeat(32))).toBe(true);
  });

  it('requires a leading letter and trailing letter/digit', () => {
    expect(isValidMixtapeSlug('1family')).toBe(false);
    expect(isValidMixtapeSlug('-family')).toBe(false);
    expect(isValidMixtapeSlug('family-')).toBe(false);
  });

  it('rejects uppercase and underscores structurally', () => {
    expect(isValidMixtapeSlug('Family')).toBe(false);
    // The load-bearing rule: system paths are _-prefixed, and the
    // grammar makes such a slug impossible — by construction, not
    // by list.
    expect(isValidMixtapeSlug('_edit')).toBe(false);
    expect(isValidMixtapeSlug('_anything')).toBe(false);
    expect(isValidMixtapeSlug('edit_')).toBe(false);
  });

  it('rejects the reserved legacy-shim word', () => {
    expect(RESERVED_MIXTAPE_SLUGS.has('edit')).toBe(true);
    expect(isValidMixtapeSlug('edit')).toBe(false);
  });
});
