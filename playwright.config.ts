import { defineConfig, devices } from '@playwright/test';

// Default headed mode locally so a developer can watch the journey
// run; headless in CI for speed and stability. The `CI` env var is set
// by GitHub Actions, Cloudflare CI, etc. — flip to headed by setting
// `PWHEAD=1` if you want to watch a specific run somewhere headless.
const isCI = !!process.env.CI;
const headed = !!process.env.PWHEAD || !isCI;

export default defineConfig({
  testDir: './testing/e2e/tests',
  // Everything Playwright writes (traces, videos, screenshots, HTML
  // report) lives under testing/e2e/results/ — gitignored and safe
  // to `rm -rf` without touching any tests, fixtures, or page objects.
  outputDir: './testing/e2e/results/artifacts',
  fullyParallel: false, // E2E suite walks a single journey; serialize for clarity
  forbidOnly: isCI,
  // Cold-start flakes (first SvelteKit route compilation, first
  // Supabase admin call) can blow past the default 5s expect timeout.
  // globalSetup warms the dev server below, but one retry is the
  // belt-and-braces — fast enough that we keep it in local too.
  retries: 1,
  // Pre-compile representative routes so the first real test starts
  // against a warm dev server (see global-setup.ts for the rationale).
  globalSetup: './testing/e2e/fixtures/global-setup.ts',
  workers: 1,
  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: './testing/e2e/results/report' }]]
    : [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    headless: !headed,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000
  },
  // Per TESTING.md: mobile-first audience, one mobile + one desktop is
  // enough; a full matrix would be ceremony.
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }
    }
  ],
  // Reuse the existing `pnpm run dev` server if it's already up;
  // otherwise Playwright starts it. The local Supabase stack must be
  // running separately (`supabase start`); the fixtures don't try to
  // boot Docker — that's the developer's responsibility.
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
