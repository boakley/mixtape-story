import { describe, it, expect } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it('returns local paths verbatim', () => {
    expect(safeRedirect('/g/foo/i/bar', '/me')).toBe('/g/foo/i/bar');
    expect(safeRedirect('/handle', '/me')).toBe('/handle');
  });

  it('falls back when next is missing or empty', () => {
    expect(safeRedirect(null, '/me')).toBe('/me');
    expect(safeRedirect(undefined, '/me')).toBe('/me');
    expect(safeRedirect('', '/me')).toBe('/me');
  });

  it('blocks protocol-relative URLs (open-redirect vector)', () => {
    expect(safeRedirect('//evil.com', '/me')).toBe('/me');
    expect(safeRedirect('//evil.com/path', '/me')).toBe('/me');
  });

  it('blocks escaped-backslash URLs', () => {
    expect(safeRedirect('/\\evil.com', '/me')).toBe('/me');
  });

  it('blocks absolute URLs to other origins', () => {
    expect(safeRedirect('https://evil.com', '/me')).toBe('/me');
    expect(safeRedirect('http://evil.com', '/me')).toBe('/me');
  });

  it('blocks non-slash starts', () => {
    expect(safeRedirect('handle', '/me')).toBe('/me');
    expect(safeRedirect('?query', '/me')).toBe('/me');
  });
});
