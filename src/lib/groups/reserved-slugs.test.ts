import { describe, it, expect } from 'vitest';
import { isReservedGroupSlug, RESERVED_GROUP_SLUGS } from './reserved-slugs';

describe('reserved group slugs', () => {
  it('rejects route-conflict slugs', () => {
    expect(isReservedGroupSlug('create')).toBe(true);
    expect(isReservedGroupSlug('new')).toBe(true);
    expect(isReservedGroupSlug('manage')).toBe(true);
    expect(isReservedGroupSlug('settings')).toBe(true);
  });

  it('rejects brand slugs', () => {
    expect(isReservedGroupSlug('mixtape')).toBe(true);
    expect(isReservedGroupSlug('mixtapes')).toBe(true);
    expect(isReservedGroupSlug('mixtapestory')).toBe(true);
    expect(isReservedGroupSlug('story')).toBe(true);
    expect(isReservedGroupSlug('stories')).toBe(true);
  });

  it('rejects system / org-noun slugs', () => {
    expect(isReservedGroupSlug('admin')).toBe(true);
    expect(isReservedGroupSlug('help')).toBe(true);
    expect(isReservedGroupSlug('support')).toBe(true);
    expect(isReservedGroupSlug('official')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isReservedGroupSlug('CREATE')).toBe(true);
    expect(isReservedGroupSlug('Mixtape')).toBe(true);
  });

  it('allows ordinary slugs', () => {
    expect(isReservedGroupSlug('writing-meditation')).toBe(false);
    expect(isReservedGroupSlug('memorial-for-mom')).toBe(false);
    expect(isReservedGroupSlug('spring-2026-cohort')).toBe(false);
    expect(isReservedGroupSlug('jazz-club')).toBe(false);
  });

  it('exposes the underlying set for direct iteration', () => {
    expect(RESERVED_GROUP_SLUGS.size).toBeGreaterThan(5);
    expect(RESERVED_GROUP_SLUGS).toBeInstanceOf(Set);
  });
});
