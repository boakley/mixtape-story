// Unit tests for the feature-flag parsing in src/lib/server/features.ts.
//
// We test isTruthy() directly rather than trying to manipulate the env
// behind isFeatureEnabled(): $env/dynamic/private snapshots .env.local
// at module load and doesn't proxy process.env live, so test-time env
// mutation doesn't propagate. The parsing rule is the interesting
// logic; the env wiring is one trivial line per flag.

import { describe, it, expect } from 'vitest';
import { isTruthy } from './features';

describe('isTruthy (feature-flag value parsing)', () => {
  describe('truthy values', () => {
    it.each([
      '1',
      'true',
      'TRUE',
      'True',
      'yes',
      'YES',
      'on',
      'ON',
      ' 1 ',
      '\ttrue\n',
      '  yes  '
    ])('%j → true', (value) => {
      expect(isTruthy(value)).toBe(true);
    });
  });

  describe('falsy values', () => {
    it.each([
      '',
      '0',
      'false',
      'FALSE',
      'no',
      'off',
      'banana',
      '2',
      'truthy', // not exactly in the allowlist
      ' ' // whitespace alone is empty after trim
    ])('%j → false', (value) => {
      expect(isTruthy(value)).toBe(false);
    });
  });

  it('returns false for undefined', () => {
    expect(isTruthy(undefined)).toBe(false);
  });
});
