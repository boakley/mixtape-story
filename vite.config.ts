import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Vitest config: pure-logic unit tests live alongside src/, run in
  // node (no DOM needed for the things we test). Browser tests are
  // Playwright's job, not Vitest's.
  test: {
    include: ['src/**/*.{test,spec}.{ts,js}'],
    environment: 'node'
  }
});
