import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Don't watch the Playwright artifacts directory. When tests run,
  // traces/screenshots/videos get written there continuously — without
  // this, Vite hot-reloads mid-test and kills in-flight form actions.
  server: {
    watch: {
      ignored: ['**/testing/e2e/results/**']
    }
  },
  // Vitest config: pure-logic unit tests live alongside src/, run in
  // node (no DOM needed for the things we test). Browser tests are
  // Playwright's job, not Vitest's.
  test: {
    include: ['src/**/*.{test,spec}.{ts,js}'],
    environment: 'node'
  }
});
