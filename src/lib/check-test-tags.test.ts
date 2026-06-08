// Meta-check: enforce that every E2E spec carries the documented
// @feature:* and @role:* tags. Runs as part of `pnpm test:unit` (and
// CI), so a missing-tag commit goes red even without a pre-commit
// hook installed locally.
//
// The actual check lives in scripts/check-test-tags.ts so it can also
// be invoked from a husky hook later if we decide we want one. This
// test just runs the script and surfaces its diagnostic output as the
// test failure message.

import { describe, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';

describe('E2E test tag scheme', () => {
  it('every spec carries @feature:* and @role:* tags', () => {
    const script = resolvePath(__dirname, '..', '..', 'scripts', 'check-test-tags.ts');
    const result = spawnSync(
      'node',
      ['--experimental-strip-types', script],
      { encoding: 'utf8' }
    );
    if (result.status !== 0) {
      const out = (result.stderr || '') + (result.stdout || '');
      throw new Error('check-test-tags.ts reported issues:\n' + out);
    }
  });
});
