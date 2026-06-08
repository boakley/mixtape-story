#!/usr/bin/env -S node --experimental-strip-types
/**
 * Enforce the tag scheme documented in docs/TESTING.md "Tags" section:
 * every E2E spec must carry at least one `@feature:*` tag and at least
 * one `@role:*` tag. Run by the vitest meta-check
 * (src/lib/check-test-tags.test.ts) on every `pnpm test:unit` and CI
 * run; safe to invoke directly via:
 *
 *   node --experimental-strip-types scripts/check-test-tags.ts
 *
 * Format-only validation, not allowlist: catches typos like
 * `@features:group` (extra 's') or empty values `@feature:` but not
 * semantic drift like `@feature:groups`. The full allowed-value list
 * stays in docs/TESTING.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TESTS_DIR = resolvePath(HERE, '..', 'testing', 'e2e', 'tests');

// Match each test() call from `test(` (or `test.skip(`, `test.only(`)
// through the start of its callback (`async (`). Captures the test
// name in group 1; match[0] is the whole call including any options
// object. The [\s\S]*? lets the regex span multi-line `{ tag: [...] }`
// option literals.
const TEST_BLOCK_RE =
  /\btest(?:\.\w+)?\s*\(\s*['"`]([^'"`]+)['"`][\s\S]*?async\s*\(/g;

const FEATURE_RE = /@feature:[a-z][a-z0-9-]*/;
const ROLE_RE = /@role:[a-z][a-z0-9-]*/;

type Issue = { file: string; testName: string; missing: string };
const issues: Issue[] = [];
let testCount = 0;

for (const file of readdirSync(TESTS_DIR).sort()) {
  if (!file.endsWith('.spec.ts')) continue;
  const src = readFileSync(resolvePath(TESTS_DIR, file), 'utf8');

  for (const match of src.matchAll(TEST_BLOCK_RE)) {
    testCount += 1;
    const block = match[0];
    const testName = match[1];
    if (!FEATURE_RE.test(block)) {
      issues.push({ file, testName, missing: '@feature:*' });
    }
    if (!ROLE_RE.test(block)) {
      issues.push({ file, testName, missing: '@role:*' });
    }
  }
}

if (issues.length > 0) {
  console.error(
    `Test tag check failed: ${issues.length} issue${issues.length === 1 ? '' : 's'} ` +
      `across ${testCount} test${testCount === 1 ? '' : 's'}.`
  );
  for (const i of issues) {
    console.error(`  ${i.file}: "${i.testName}" missing ${i.missing} tag`);
  }
  console.error('\nSee docs/TESTING.md "Tags" for the scheme.');
  process.exit(1);
}

console.log(`✓ All ${testCount} E2E tests carry @feature:* and @role:* tags.`);
