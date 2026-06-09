import { describe, it, expect } from 'vitest';
import { isReservedHandle, RESERVED_HANDLES } from './reserved';

describe('reserved personal handles', () => {
  it('rejects system / auth / infra handles', () => {
    expect(isReservedHandle('admin')).toBe(true);
    expect(isReservedHandle('api')).toBe(true);
    expect(isReservedHandle('login')).toBe(true);
    expect(isReservedHandle('onboarding')).toBe(true);
    expect(isReservedHandle('settings')).toBe(true);
  });

  it('rejects brand / product handles', () => {
    expect(isReservedHandle('mixtape')).toBe(true);
    expect(isReservedHandle('mixtapestory')).toBe(true);
    expect(isReservedHandle('story')).toBe(true);
    expect(isReservedHandle('stories')).toBe(true);
  });

  it('rejects discovery / navigation handles', () => {
    expect(isReservedHandle('dashboard')).toBe(true);
    expect(isReservedHandle('discover')).toBe(true);
    expect(isReservedHandle('search')).toBe(true);
    expect(isReservedHandle('share')).toBe(true);
  });

  it('rejects future-audience handles (singular + plural)', () => {
    expect(isReservedHandle('artist')).toBe(true);
    expect(isReservedHandle('artists')).toBe(true);
    expect(isReservedHandle('memorial')).toBe(true);
    expect(isReservedHandle('memorials')).toBe(true);
    expect(isReservedHandle('business')).toBe(true);
    expect(isReservedHandle('businesses')).toBe(true);
  });

  it('rejects single-letter namespace escape hatches', () => {
    expect(isReservedHandle('a')).toBe(true);
    expect(isReservedHandle('m')).toBe(true);
    expect(isReservedHandle('u')).toBe(true);
    expect(isReservedHandle('x')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isReservedHandle('ADMIN')).toBe(true);
    expect(isReservedHandle('Mixtape')).toBe(true);
    expect(isReservedHandle('Login')).toBe(true);
  });

  it('allows ordinary handles', () => {
    expect(isReservedHandle('sam')).toBe(false);
    expect(isReservedHandle('margaret')).toBe(false);
    expect(isReservedHandle('jack-and-diane')).toBe(false);
    expect(isReservedHandle('writing-group-2026')).toBe(false);
  });

  it('exposes the underlying set for direct iteration', () => {
    expect(RESERVED_HANDLES.size).toBeGreaterThan(20);
    expect(RESERVED_HANDLES).toBeInstanceOf(Set);
  });
});
